import { useReducer, useState } from "react";
import { cartReducer } from "./cart/cart.ts";
import { MenuScreen } from "./screens/MenuScreen.tsx";
import { OrderTicket } from "./screens/OrderTicket.tsx";
import { WelcomeScreen } from "./screens/WelcomeScreen.tsx";

type Screen = "welcome" | "menu";

export function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [cart, dispatch] = useReducer(cartReducer, []);

  if (screen === "welcome") return <WelcomeScreen onStart={() => setScreen("menu")} />;

  return (
    <MenuScreen
      cart={cart}
      onAdd={(product) => dispatch({ type: "add", product })}
      ticket={
        <OrderTicket
          cart={cart}
          onAddOne={(productId) => dispatch({ type: "addOne", productId })}
          onRemoveOne={(productId) => dispatch({ type: "removeOne", productId })}
        />
      }
    />
  );
}
