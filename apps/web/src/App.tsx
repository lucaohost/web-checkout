import { useCheckout } from "./kiosk/useCheckout.ts";
import { useIdle } from "./kiosk/useIdle.ts";
import { ConflictScreen } from "./screens/ConflictScreen.tsx";
import { IdleDialog } from "./screens/IdleDialog.tsx";
import { MenuScreen } from "./screens/MenuScreen.tsx";
import { OrderTicket } from "./screens/OrderTicket.tsx";
import { CardTerminal, PayScreen } from "./screens/PayScreen.tsx";
import { PaymentProblemScreen } from "./screens/PaymentProblemScreen.tsx";
import { ReceiptScreen } from "./screens/ReceiptScreen.tsx";
import { WelcomeScreen } from "./screens/WelcomeScreen.tsx";

export function App() {
  const kiosk = useCheckout();
  const idle = useIdle({
    enabled: kiosk.screen !== "welcome" && kiosk.screen !== "receipt",
    onTimeout: kiosk.timeout,
  });

  return (
    <>
      {kiosk.screen === "welcome" && <WelcomeScreen onStart={kiosk.start} />}
      {kiosk.screen === "menu" && (
        <MenuScreen
          cart={kiosk.cart}
          banner={kiosk.banner}
          onAdd={kiosk.add}
          ticket={
            <OrderTicket
              cart={kiosk.cart}
              onAddOne={kiosk.addOne}
              onRemoveOne={kiosk.removeOne}
              footer={
                <button
                  type="button"
                  className="button button--primary button--wide"
                  disabled={kiosk.cart.length === 0 || kiosk.busy}
                  onClick={() => void kiosk.confirm()}
                >
                  Confirm order
                </button>
              }
            />
          }
        />
      )}
      {kiosk.screen === "conflicts" && (
        <ConflictScreen conflicts={kiosk.conflicts} onContinue={kiosk.acceptConflicts} onEdit={kiosk.editAfterConflicts} />
      )}
      {kiosk.screen === "pay" && kiosk.checkout && (
        <PayScreen
          totalCents={kiosk.checkout.totalCents}
          busy={kiosk.busy}
          onCard={kiosk.chooseCard}
          onPayAtPickup={kiosk.payAtPickup}
          onCancel={kiosk.abandon}
        />
      )}
      {kiosk.screen === "card" && <CardTerminal busy={kiosk.busy} onTap={kiosk.tapCard} />}
      {kiosk.screen === "problem" && kiosk.problem && (
        <PaymentProblemScreen
          problem={kiosk.problem}
          busy={kiosk.busy}
          onTryCard={kiosk.tryAnotherCard}
          onPayAtPickup={kiosk.payAtPickup}
          onCancel={kiosk.abandon}
        />
      )}
      {kiosk.screen === "receipt" && kiosk.order && <ReceiptScreen order={kiosk.order} onDone={kiosk.finish} />}
      {idle.secondsLeft !== null && <IdleDialog secondsLeft={idle.secondsLeft} onStay={idle.stillHere} />}
    </>
  );
}
