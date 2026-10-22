import type { Product } from "../api/client.ts";
import { productIcon } from "../menu/icons.ts";
import { formatCents } from "../money.ts";

export function ProductCard({
  product,
  quantityInCart,
  onAdd,
}: {
  product: Product;
  quantityInCart: number;
  onAdd: () => void;
}) {
  const soldOut = product.availability === "SOLD_OUT";
  const atLimit = quantityInCart >= product.maxQuantity;

  return (
    <article aria-label={product.name} className={`product ${soldOut ? "product--sold-out" : ""}`}>
      <span className="product__emoji" aria-hidden="true">
        {productIcon(product.name)}
      </span>
      <h3 className="product__name">{product.name}</h3>
      <p className="product__price">{formatCents(product.priceCents)}</p>
      {soldOut && <p className="product__badge product__badge--sold-out">Sold out</p>}
      {product.availability === "LAST_UNITS" && (
        <p className="product__badge">Only {product.maxQuantity} left</p>
      )}
      {quantityInCart > 0 && (
        <p className="product__in-cart" aria-hidden="true">
          {quantityInCart} in your order
        </p>
      )}
      <button
        type="button"
        className="product__add"
        aria-label={`Add ${product.name}`}
        disabled={soldOut || atLimit}
        onClick={onAdd}
      >
        +
      </button>
    </article>
  );
}
