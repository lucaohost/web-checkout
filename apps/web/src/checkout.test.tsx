import { act, screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_ID, checkoutView, orderView, serveCheckout } from "./test/checkout-api.ts";
import { PRODUCT } from "./test/fixtures.ts";
import { renderKiosk, serveMenu, startOrder } from "./test/render.tsx";

type User = ReturnType<typeof userEvent.setup>;

async function orderTwoCoxinhas(user: User) {
  await startOrder(user);
  const coxinha = screen.getByRole("article", { name: "Coxinha" });
  await user.click(within(coxinha).getByRole("button", { name: /add coxinha/i }));
  await user.click(within(coxinha).getByRole("button", { name: /add coxinha/i }));
  await user.click(screen.getByRole("button", { name: "Confirm order" }));
}

async function payByCard(user: User) {
  await user.click(await screen.findByRole("button", { name: /^card/i }));
  await user.click(await screen.findByRole("button", { name: /tap your card/i }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("paying by card", () => {
  it("confirms the Cart with the prices the Customer saw, then prints a Receipt with the Order Code", async () => {
    serveMenu();
    const requests = serveCheckout();
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await payByCard(user);

    expect(await screen.findByText("A-042")).toBeInTheDocument();
    expect(screen.getByText(/paid by card/i)).toBeInTheDocument();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/checkouts",
      body: { items: [{ productId: PRODUCT.coxinha, quantity: 2, unitPriceCents: 850 }] },
    });
    expect(requests[1]).toMatchObject({ path: `/checkouts/${CHECKOUT_ID}/payment`, body: { method: "CARD" } });

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: /start your order/i })).toBeInTheDocument();
  });

  it("offers another card, Pay at Pickup or Cancel after a decline, and Pay at Pickup ends with a Receipt to pay at the counter", async () => {
    serveMenu();
    const recorded = serveCheckout({
      payments: [
        {
          status: 402,
          body: {
            error: "PAYMENT_DECLINED",
            message: "The card was declined.",
            reason: "insufficient_funds",
            options: ["TRY_ANOTHER_CARD", "PAY_AT_PICKUP", "CANCEL"],
            cardAttemptsLeft: 2,
          },
        },
        { status: 201, body: orderView({ status: "PAYMENT_PENDING", paymentMethod: "PAY_AT_PICKUP" }) },
      ],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await payByCard(user);

    expect(await screen.findByRole("heading", { name: /your card was declined/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try another card/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /pay at pickup/i }));

    expect(await screen.findByText("A-042")).toBeInTheDocument();
    expect(screen.getByText(/pay \$17\.00 at the counter/i)).toBeInTheDocument();
    expect(recorded[2]).toMatchObject({ path: `/checkouts/${CHECKOUT_ID}/payment`, body: { method: "PAY_AT_PICKUP" } });
    expect(recorded[2]!.key).not.toBe(recorded[1]!.key);
  });

  it("stops offering cards when the charge cannot be confirmed, and promises the refund", async () => {
    serveMenu();
    serveCheckout({
      payments: [
        {
          status: 402,
          body: {
            error: "PAYMENT_UNCONFIRMED",
            message: "The card payment could not be confirmed.",
            options: ["PAY_AT_PICKUP", "CANCEL"],
            cardAttemptsLeft: 0,
          },
        },
      ],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await payByCard(user);

    expect(await screen.findByRole("heading", { name: /couldn't confirm your card payment/i })).toBeInTheDocument();
    expect(screen.getByText(/it will be refunded automatically/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try another card/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay at pickup/i })).toBeInTheDocument();
  });
});

describe("when the Cart no longer matches the Menu", () => {
  it("shows every change at once and, once accepted, confirms the adjusted Cart as a new request", async () => {
    serveMenu();
    const requests = serveCheckout({
      checkouts: [
        {
          status: 409,
          body: {
            error: "CHECKOUT_CONFLICT",
            message: "Some prices or quantities changed.",
            conflicts: [
              {
                productId: PRODUCT.coxinha,
                name: "Coxinha",
                reasons: ["NOT_ENOUGH_STOCK", "PRICE_CHANGED"],
                requestedQuantity: 2,
                availableQuantity: 1,
                seenUnitPriceCents: 850,
                currentUnitPriceCents: 900,
              },
            ],
          },
        },
        { status: 201, body: checkoutView({ totalCents: 900 }) },
      ],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);

    const changes = await screen.findByRole("region", { name: /your order changed/i });
    expect(within(changes).getByText(/only 1 left/i)).toBeInTheDocument();
    expect(within(changes).getByText(/\$8\.50 → \$9\.00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue with these changes" }));

    expect(await screen.findByRole("heading", { name: /how would you like to pay/i })).toBeInTheDocument();
    expect(requests[1]).toMatchObject({ body: { items: [{ productId: PRODUCT.coxinha, quantity: 1, unitPriceCents: 900 }] } });
    expect(requests[1]!.key).not.toBe(requests[0]!.key);
  });
});

describe("an unreliable connection", () => {
  it("repeats a lost confirmation with the same Idempotency-Key, so nothing is reserved twice", async () => {
    serveMenu();
    const requests = serveCheckout({ checkouts: "network-error-then-created" });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);

    expect(await screen.findByRole("heading", { name: /how would you like to pay/i }, { timeout: 4_000 })).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[1]!.key).toBe(requests[0]!.key);
  });

  it("explains an expired reservation and gives the Cart back for another try", async () => {
    serveMenu();
    serveCheckout({
      payments: [{ status: 410, body: { error: "CHECKOUT_EXPIRED", message: "This Checkout expired." } }],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await payByCard(user);

    expect(await screen.findByText(/we put your items back/i)).toBeInTheDocument();
    const ticket = screen.getByRole("complementary", { name: "Your order" });
    expect(within(ticket).getByLabelText("Total")).toHaveTextContent("$17.00");
  });
});

describe("a lost payment response", () => {
  it("shows the receipt when every payment attempt loses its response but the Checkout already became an Order", async () => {
    serveMenu();
    const requests = serveCheckout({
      payments: ["network-error", "network-error", "network-error"],
      reads: [{ status: 200, body: checkoutView({ status: "CONSUMED", order: orderView() }) }],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await payByCard(user);

    expect(await screen.findByText("A-042", {}, { timeout: 8_000 })).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "GET")).toHaveLength(1);
  }, 15_000);

  it("shows the failure on the payment screen when the charge did not become an Order", async () => {
    serveMenu();
    serveCheckout({
      payments: ["network-error", "network-error", "network-error"],
      reads: [{ status: 200, body: checkoutView({ status: "ACTIVE", order: null }) }],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await payByCard(user);

    expect(await screen.findByRole("heading", { name: /how would you like to pay/i }, { timeout: 8_000 })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/did not go through/i);
  }, 15_000);

  it("recovers the receipt when paying again is rejected because the Checkout is already an Order", async () => {
    serveMenu();
    serveCheckout({
      payments: [{ status: 409, body: { error: "CHECKOUT_COMPLETED", message: "This Checkout already became an Order." } }],
      reads: [{ status: 200, body: checkoutView({ status: "CONSUMED", order: orderView() }) }],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await payByCard(user);

    expect(await screen.findByText("A-042")).toBeInTheDocument();
  });
});

describe("a lost confirmation", () => {
  it("confirms again with the same key when the Cart did not change", async () => {
    serveMenu();
    const requests = serveCheckout({
      checkouts: ["network-error", "network-error", "network-error", { status: 201, body: checkoutView() }],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    expect(await screen.findByText(/check the connection/i, {}, { timeout: 8_000 })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm order" }));

    expect(await screen.findByRole("heading", { name: /how would you like to pay/i })).toBeInTheDocument();
    const posts = requests.filter((request) => request.method === "POST" && request.path === "/checkouts");
    expect(posts).toHaveLength(4);
    expect(new Set(posts.map((request) => request.key)).size).toBe(1);
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
  }, 15_000);

  it("cancels the Checkout a lost confirmation reserved once the Cart changes, then confirms the new Cart with a new key", async () => {
    serveMenu();
    const requests = serveCheckout({
      checkouts: [
        "network-error",
        "network-error",
        "network-error",
        { status: 201, body: checkoutView() },
        { status: 201, body: checkoutView() },
      ],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    expect(await screen.findByText(/check the connection/i, {}, { timeout: 8_000 })).toBeInTheDocument();
    const lostKey = requests[0]!.key;

    await user.click(screen.getByRole("button", { name: "Add Cola" }));
    await waitFor(() => expect(requests.some((request) => request.method === "DELETE")).toBe(true));

    expect(requests[3]).toMatchObject({
      method: "POST",
      path: "/checkouts",
      key: lostKey,
      body: { items: [{ productId: PRODUCT.coxinha, quantity: 2, unitPriceCents: 850 }] },
    });

    await user.click(screen.getByRole("button", { name: "Confirm order" }));
    expect(await screen.findByRole("heading", { name: /how would you like to pay/i })).toBeInTheDocument();
    const confirmed = requests.filter((request) => request.method === "POST" && request.path === "/checkouts").at(-1)!;
    expect(confirmed.key).not.toBe(lostKey);
    expect(confirmed.body).toEqual({
      items: [
        { productId: PRODUCT.coxinha, quantity: 2, unitPriceCents: 850 },
        { productId: PRODUCT.cola, quantity: 1, unitPriceCents: 600 },
      ],
    });
  }, 15_000);
});

describe("the card reader", () => {
  it("lets the Customer leave the reader and choose another way to pay", async () => {
    serveMenu();
    const requests = serveCheckout();
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await user.click(await screen.findByRole("button", { name: /^card/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: /how would you like to pay/i })).toBeInTheDocument();
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
  });

  it("sends a forced card outcome chosen from the demo control", async () => {
    serveMenu();
    const requests = serveCheckout({
      payments: [
        {
          status: 402,
          body: {
            error: "PAYMENT_DECLINED",
            message: "The card was declined.",
            options: ["TRY_ANOTHER_CARD", "PAY_AT_PICKUP", "CANCEL"],
            cardAttemptsLeft: 2,
          },
        },
      ],
    });
    const { user } = renderKiosk();

    await orderTwoCoxinhas(user);
    await user.click(await screen.findByRole("button", { name: /^card/i }));
    await user.click(screen.getByText("Demo tools"));
    await user.selectOptions(screen.getByLabelText("Force card outcome"), "declined");
    await user.click(screen.getByRole("button", { name: /tap your card/i }));

    expect(await screen.findByRole("heading", { name: /your card was declined/i })).toBeInTheDocument();
    expect(requests.find((request) => request.path.endsWith("/payment"))?.forceError).toBe("declined");
  });
});

describe("a finished Order", () => {
  it("returns to the start about 15 seconds after the receipt", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveMenu();
    const requests = serveCheckout();
    const { user } = renderKiosk({ advanceTimers: vi.advanceTimersByTime });

    await orderTwoCoxinhas(user);
    await payByCard(user);
    expect(await screen.findByText("A-042")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(14_000));
    expect(screen.getByText("A-042")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByRole("button", { name: /start your order/i })).toBeInTheDocument();
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
  });
});

describe("a Customer who walks away", () => {
  it("asks whether anyone is still there, then cancels the Checkout and starts over", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveMenu();
    const requests = serveCheckout();
    const { user } = renderKiosk({ advanceTimers: vi.advanceTimersByTime });

    await orderTwoCoxinhas(user);
    await screen.findByRole("heading", { name: /how would you like to pay/i });

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByRole("alertdialog", { name: /still there/i })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByRole("button", { name: /start your order/i })).toBeInTheDocument();
    expect(requests.at(-1)).toMatchObject({ method: "DELETE", path: `/checkouts/${CHECKOUT_ID}` });
  });

  it("keeps the order when the Customer answers the question", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveMenu();
    const { user } = renderKiosk({ advanceTimers: vi.advanceTimersByTime });
    await startOrder(user);
    await user.click(within(screen.getByRole("article", { name: "Coxinha" })).getByRole("button", { name: /add coxinha/i }));

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    await user.click(screen.getByRole("button", { name: /i'm still here/i }));
    await act(() => vi.advanceTimersByTimeAsync(15_000));

    const ticket = screen.getByRole("complementary", { name: "Your order" });
    expect(within(ticket).getByLabelText("Total")).toHaveTextContent("$8.50");
  });
});
