import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ApiError,
  cancelCheckout,
  createCheckout,
  getCheckout,
  payCheckout,
  type CheckoutView,
  type Conflict,
  type OrderView,
  type PaymentProblem,
  type Product,
} from "../api/client.ts";
import { type CartAction, type CartLine, cartReducer } from "../cart/cart.ts";
import { applyConflicts } from "../cart/conflicts.ts";

export type Screen = "welcome" | "menu" | "conflicts" | "pay" | "card" | "problem" | "receipt";

/** requirements.md: back to the start about 15 s after a finished Order. */
export const RECEIPT_RESET_MS = 15_000;

type CheckoutLine = { productId: string; quantity: number; unitPriceCents: number };
type IdempotencyKey = ReturnType<typeof crypto.randomUUID>;
type PendingConfirm = { key: IdempotencyKey; items: CheckoutLine[] };

function checkoutItems(lines: CartLine[]): CheckoutLine[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
  }));
}

function sameItems(left: CheckoutLine[], right: CheckoutLine[]) {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.productId === right[index]?.productId &&
        item.quantity === right[index]?.quantity &&
        item.unitPriceCents === right[index]?.unitPriceCents,
    )
  );
}

/** The server may have reserved stock or placed the Order; the kiosk never saw the answer. */
function outcomeUnknown(error: unknown) {
  if (!(error instanceof ApiError)) return true;
  return error.status >= 500 || error.body.error === "REQUEST_IN_PROGRESS";
}

export function useCheckout() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [checkout, setCheckout] = useState<CheckoutView | null>(null);
  const [problem, setProblem] = useState<PaymentProblem | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [forceError, setForceError] = useState("");
  const confirmKey = useRef(crypto.randomUUID());
  const payKey = useRef(crypto.randomUUID());
  const inflight = useRef(false);
  const pendingConfirm = useRef<PendingConfirm | null>(null);
  const releaseTask = useRef<Promise<void>>(Promise.resolve());
  const cartRef = useRef(cart);
  cartRef.current = cart;

  const resetSession = useCallback((checkoutId?: string) => {
    if (checkoutId) void cancelCheckout(checkoutId).catch(() => undefined);
    pendingConfirm.current = null;
    dispatch({ type: "clear" });
    setCheckout(null);
    setConflicts([]);
    setProblem(null);
    setOrder(null);
    setBanner(null);
    setForceError("");
    setBusy(false);
    inflight.current = false;
    confirmKey.current = crypto.randomUUID();
    payKey.current = crypto.randomUUID();
    setScreen("welcome");
  }, []);

  useEffect(() => {
    if (screen !== "receipt") return;
    const timer = setTimeout(() => resetSession(), RECEIPT_RESET_MS);
    return () => clearTimeout(timer);
  }, [screen, resetSession]);

  const start = () => setScreen("menu");

  async function releasePending(pending: PendingConfirm) {
    try {
      const created = await createCheckout(pending.items, pending.key);
      if (created.status === "ACTIVE" || created.status === "PAYING") await cancelCheckout(created.checkoutId);
    } catch (error) {
      if (error instanceof ApiError && error.status < 500 && error.body.error !== "REQUEST_IN_PROGRESS") return;
      if (pendingConfirm.current === null) pendingConfirm.current = pending;
    }
  }

  function enqueueRelease() {
    const pending = pendingConfirm.current;
    if (!pending) return;
    pendingConfirm.current = null;
    releaseTask.current = releaseTask.current.then(() => releasePending(pending));
  }

  /** Drop the pending attempt we just finished. A different one still holds Stock, so keep trying to release it. */
  function settlePending(key: IdempotencyKey) {
    if (!pendingConfirm.current) return;
    if (pendingConfirm.current.key === key) pendingConfirm.current = null;
    else enqueueRelease();
  }

  function changeCart(action: CartAction) {
    const next = cartReducer(cart, action);
    const changed = !sameItems(checkoutItems(cart), checkoutItems(next));
    dispatch(action);
    if (!changed) return;
    confirmKey.current = crypto.randomUUID();
    const pending = pendingConfirm.current;
    if (pending && !sameItems(pending.items, checkoutItems(next))) enqueueRelease();
  }

  async function confirm() {
    if (inflight.current || cart.length === 0) return;
    inflight.current = true;
    setBusy(true);
    setBanner(null);
    let sentItems = checkoutItems(cart);
    let key = confirmKey.current;
    try {
      await releaseTask.current;
      if (pendingConfirm.current && !sameItems(pendingConfirm.current.items, checkoutItems(cartRef.current))) {
        enqueueRelease();
        await releaseTask.current;
      }
      sentItems = checkoutItems(cartRef.current);
      key =
        pendingConfirm.current && sameItems(pendingConfirm.current.items, sentItems)
          ? pendingConfirm.current.key
          : confirmKey.current;
      const created = await createCheckout(sentItems, key);
      settlePending(key);
      setCheckout(created);
      setScreen("pay");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && Array.isArray(error.body.conflicts)) {
        if (pendingConfirm.current?.key === key) pendingConfirm.current = null;
        const next = error.body.conflicts as Conflict[];
        setConflicts(next);
        setScreen("conflicts");
      } else if (outcomeUnknown(error)) {
        pendingConfirm.current = { key, items: sentItems };
        setBanner("We couldn't confirm your order. Check the connection and try again.");
        if (!sameItems(sentItems, checkoutItems(cartRef.current))) enqueueRelease();
      } else {
        if (error instanceof ApiError && error.body.error === "IDEMPOTENCY_KEY_REUSED") {
          confirmKey.current = crypto.randomUUID();
        }
        setBanner("We couldn't confirm your order. Check the connection and try again.");
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  function acceptConflicts() {
    const next = applyConflicts(cart, conflicts);
    dispatch({ type: "replace", lines: next });
    confirmKey.current = crypto.randomUUID();
    setConflicts([]);
    if (next.length === 0) {
      setScreen("menu");
      setBanner("Those items are gone. Add something else?");
      return;
    }
    void (async () => {
      inflight.current = true;
      setBusy(true);
      try {
        const created = await createCheckout(checkoutItems(next), confirmKey.current);
        settlePending(confirmKey.current);
        setCheckout(created);
        setScreen("pay");
      } catch (error) {
        if (outcomeUnknown(error)) pendingConfirm.current = { key: confirmKey.current, items: checkoutItems(next) };
        setScreen("menu");
        setBanner("We couldn't confirm your order. Check the connection and try again.");
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    })();
  }

  function editAfterConflicts() {
    dispatch({ type: "replace", lines: applyConflicts(cart, conflicts) });
    confirmKey.current = crypto.randomUUID();
    setConflicts([]);
    setScreen("menu");
  }

  async function placedOrder(checkoutId: string): Promise<OrderView | null> {
    try {
      const view = await getCheckout(checkoutId);
      return view.order;
    } catch {
      return null;
    }
  }

  async function pay(method: "CARD" | "PAY_AT_PICKUP") {
    if (!checkout || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setBanner(null);
    try {
      const placed = await payCheckout(
        checkout.checkoutId,
        method,
        payKey.current,
        method === "CARD" && forceError ? forceError : undefined,
      );
      setOrder(placed);
      setScreen("receipt");
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        setCheckout(null);
        confirmKey.current = crypto.randomUUID();
        payKey.current = crypto.randomUUID();
        setBanner("We put your items back. Confirm again when you are ready.");
        setScreen("menu");
      } else if (error instanceof ApiError && error.status === 402) {
        setProblem(error.body as PaymentProblem);
        setScreen("problem");
      } else {
        const recovered = await placedOrder(checkout.checkoutId);
        if (recovered) {
          setOrder(recovered);
          setBanner(null);
          setScreen("receipt");
        } else {
          setBanner("The payment did not go through. Try again.");
          setScreen("pay");
        }
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  function chooseCard() {
    payKey.current = crypto.randomUUID();
    setScreen("card");
  }

  function leaveCard() {
    if (inflight.current) return;
    setScreen("pay");
  }

  function tryAnotherCard() {
    payKey.current = crypto.randomUUID();
    setProblem(null);
    setScreen("card");
  }

  function abandon() {
    resetSession(checkout?.checkoutId);
  }

  return {
    screen,
    cart,
    busy,
    conflicts,
    checkout,
    problem,
    order,
    banner,
    forceError,
    setForceError,
    start,
    add: (product: Product) => changeCart({ type: "add", product }),
    addOne: (productId: string) => changeCart({ type: "addOne", productId }),
    removeOne: (productId: string) => changeCart({ type: "removeOne", productId }),
    confirm,
    acceptConflicts,
    editAfterConflicts,
    chooseCard,
    leaveCard,
    tapCard: () => void pay("CARD"),
    payAtPickup: () => {
      payKey.current = crypto.randomUUID();
      void pay("PAY_AT_PICKUP");
    },
    tryAnotherCard,
    abandon,
    finish: () => resetSession(),
    timeout: () => resetSession(checkout?.checkoutId),
  };
}
