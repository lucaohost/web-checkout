import { useCallback, useReducer, useRef, useState } from "react";
import {
  ApiError,
  cancelCheckout,
  createCheckout,
  payCheckout,
  type CheckoutView,
  type Conflict,
  type OrderView,
  type PaymentProblem,
  type Product,
} from "../api/client.ts";
import { applyConflicts } from "../cart/conflicts.ts";
import { cartReducer } from "../cart/cart.ts";

export type Screen = "welcome" | "menu" | "conflicts" | "pay" | "card" | "problem" | "receipt";

export function useCheckout() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [checkout, setCheckout] = useState<CheckoutView | null>(null);
  const [problem, setProblem] = useState<PaymentProblem | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const confirmKey = useRef(crypto.randomUUID());
  const payKey = useRef(crypto.randomUUID());
  const inflight = useRef(false);

  const resetSession = useCallback((checkoutId?: string) => {
    if (checkoutId) void cancelCheckout(checkoutId).catch(() => undefined);
    dispatch({ type: "clear" });
    setCheckout(null);
    setConflicts([]);
    setProblem(null);
    setOrder(null);
    setBanner(null);
    setBusy(false);
    inflight.current = false;
    confirmKey.current = crypto.randomUUID();
    payKey.current = crypto.randomUUID();
    setScreen("welcome");
  }, []);

  const start = () => setScreen("menu");

  const add = (product: Product) => dispatch({ type: "add", product });

  async function confirm() {
    if (inflight.current || cart.length === 0) return;
    inflight.current = true;
    setBusy(true);
    setBanner(null);
    try {
      const created = await createCheckout(
        cart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
        })),
        confirmKey.current,
      );
      setCheckout(created);
      setScreen("pay");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && Array.isArray(error.body.conflicts)) {
        const next = error.body.conflicts as Conflict[];
        setConflicts(next);
        setScreen("conflicts");
      } else {
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
        const created = await createCheckout(
          next.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
          })),
          confirmKey.current,
        );
        setCheckout(created);
        setScreen("pay");
      } catch {
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

  async function pay(method: "CARD" | "PAY_AT_PICKUP") {
    if (!checkout || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    try {
      const placed = await payCheckout(checkout.checkoutId, method, payKey.current);
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
        setBanner("The payment did not go through. Try again.");
        setScreen("pay");
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
    start,
    add,
    addOne: (productId: string) => dispatch({ type: "addOne", productId }),
    removeOne: (productId: string) => dispatch({ type: "removeOne", productId }),
    confirm,
    acceptConflicts,
    editAfterConflicts,
    chooseCard,
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

