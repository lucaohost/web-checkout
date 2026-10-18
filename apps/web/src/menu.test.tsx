import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderKiosk, serveMenu, startOrder } from "./test/render.tsx";
import { API_URL, server } from "./test/server.ts";

function productCard(name: string) {
  return screen.getByRole("article", { name });
}

describe("Menu", () => {
  it("shows every Category with its Products, prices and Availability", async () => {
    serveMenu();
    const { user } = renderKiosk();
    await startOrder(user);

    const sweets = screen.getByRole("region", { name: "Sweets" });
    const sweetNames = within(sweets)
      .getAllByRole("article")
      .map((card) => card.getAttribute("aria-label"));
    expect(sweetNames).toEqual(["Brownie", "Carrot cake"]);
    expect(within(productCard("Coxinha")).getByText("$8.50")).toBeInTheDocument();
    expect(within(productCard("Brownie")).getByText("Only 2 left")).toBeInTheDocument();
    expect(within(productCard("Carrot cake")).getByText("Sold out")).toBeInTheDocument();
    expect(within(productCard("Carrot cake")).getByRole("button", { name: /add carrot cake/i })).toBeDisabled();
  });

  it("explains when the Menu cannot load and lets the Customer try again", async () => {
    serveMenu();
    server.use(http.get(`${API_URL}/menu`, () => HttpResponse.json({}, { status: 503 }), { once: true }));
    const { user } = renderKiosk();
    await user.click(screen.getByRole("button", { name: /start your order/i }));

    expect(await screen.findByText(/we couldn't load the menu/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Snacks" })).toBeInTheDocument();
  });
});

describe("Cart", () => {
  it("adds Products, keeps a running total and never goes beyond what the Menu allows", async () => {
    serveMenu();
    const { user } = renderKiosk();
    await startOrder(user);

    await user.click(within(productCard("Coxinha")).getByRole("button", { name: /add coxinha/i }));
    await user.click(within(productCard("Coxinha")).getByRole("button", { name: /add coxinha/i }));
    await user.click(within(productCard("Brownie")).getByRole("button", { name: /add brownie/i }));
    await user.click(within(productCard("Brownie")).getByRole("button", { name: /add brownie/i }));

    const ticket = screen.getByRole("complementary", { name: "Your order" });
    expect(within(ticket).getByLabelText("Total")).toHaveTextContent("$35.00");
    expect(within(productCard("Brownie")).getByRole("button", { name: /add brownie/i })).toBeDisabled();

    await user.click(within(ticket).getByRole("button", { name: /remove one coxinha/i }));
    await user.click(within(ticket).getByRole("button", { name: /remove one coxinha/i }));

    expect(within(ticket).queryByText("Coxinha")).not.toBeInTheDocument();
    expect(within(ticket).getByLabelText("Total")).toHaveTextContent("$18.00");
  });
});
