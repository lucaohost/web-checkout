import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getMenu, type Product } from "../api/client.ts";
import { type CartLine, quantityInCart } from "../cart/cart.ts";
import { ProductCard } from "./ProductCard.tsx";

function soldOutLast(products: Product[]) {
  return [...products].sort(
    (a, b) => Number(a.availability === "SOLD_OUT") - Number(b.availability === "SOLD_OUT"),
  );
}

export function MenuScreen({
  cart,
  onAdd,
  ticket,
}: {
  cart: CartLine[];
  onAdd: (product: Product) => void;
  ticket: ReactNode;
}) {
  const menu = useQuery({ queryKey: ["menu"], queryFn: getMenu });

  if (menu.isPending) {
    return (
      <main className="notice" aria-busy="true">
        <p className="notice__title">Setting out the menu…</p>
      </main>
    );
  }

  if (menu.isError) {
    return (
      <main className="notice">
        <p className="notice__title">We couldn't load the menu.</p>
        <p className="notice__body">The kiosk lost touch with the kitchen for a moment. It usually comes back in seconds.</p>
        <button type="button" className="button button--primary" onClick={() => menu.refetch()}>
          Try again
        </button>
      </main>
    );
  }

  const categories = menu.data.categories.filter((category) => category.products.length > 0);

  return (
    <div className="ordering">
      <header className="ordering__header">
        <span className="ordering__brand">Snack Counter</span>
        <nav aria-label="Categories" className="ordering__tabs">
          {categories.map((category) => (
            <a key={category.id} href={`#category-${category.id}`} className="ordering__tab">
              {category.name}
            </a>
          ))}
        </nav>
      </header>
      <main className="ordering__menu">
        {categories.map((category) => (
          <section key={category.id} id={`category-${category.id}`} aria-label={category.name} className="category">
            <h2 className="category__title">{category.name}</h2>
            <div className="category__grid">
              {soldOutLast(category.products).map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantityInCart={quantityInCart(cart, product.id)}
                  onAdd={() => onAdd(product)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
      {ticket}
    </div>
  );
}
