# Web Checkout

Self-service checkout for a snack bar: a customer alone at a tablet browses the menu, builds an order and pays, with no cashier.

## Menu

**Menu**:
Every Product on sale, grouped by Category.
_Avoid_: Catalog, item list

**Category**:
A group of Products shown together on the Menu, such as drinks or snacks.
_Avoid_: Section, tab

**Product**:
Something the snack bar sells, with a name, a price and a Category.
_Avoid_: Item

**Stock**:
How many units of a Product can still be sold, excluding units already sold or reserved.
_Avoid_: Inventory

**Availability**:
What the Customer is told about a Product's Stock: available, last units, or sold out.
_Avoid_: Stock (when talking about what the screen shows)

## Ordering

**Cart**:
The Customer's draft selection of Products and quantities, living only on the Kiosk until confirmed.
_Avoid_: Basket, order (before confirmation)

**Checkout**:
A Customer's attempt to buy a confirmed Cart, from confirmation until an Order exists or the attempt is abandoned.
_Avoid_: Session, order (before payment)

**Stock Reservation**:
Units of Stock set aside for a Checkout, so no other Customer can buy them while it is being paid.
_Avoid_: Hold, lock

**Order**:
A confirmed purchase. It exists only once its card payment is approved or the Customer chose Pay at Pickup.
_Avoid_: Purchase, sale, transaction

**Order Item**:
A Product and a quantity inside an Order, with the unit price fixed at the moment the Order was placed.
_Avoid_: Item, line

**Order Code**:
The short code, such as A-042, the Customer uses to pick up the Order.
_Avoid_: Order number, ticket

**Receipt**:
The printed proof of an Order handed to the Customer at the end.
_Avoid_: Invoice, bill

### Order statuses

**Payment Pending**:
An Order placed with Pay at Pickup that has not been paid yet.
_Avoid_: Unpaid, open

**Paid**:
An Order whose payment was received, by card at the Kiosk or at the counter.
_Avoid_: Confirmed, approved

**Picked Up**:
An Order already handed to the Customer.
_Avoid_: Delivered, completed

**Cancelled**:
An Order that will not be handed to the Customer.
_Avoid_: Voided, rejected

## Payment

**Card Terminal**:
The card reader next to the Kiosk the Customer taps to pay by card.
_Avoid_: Card machine, POS, terminal (alone)

**Pay at Pickup**:
Paying at the counter, in cash, when collecting the Order; the Order is placed before it is paid.
_Avoid_: Cash payment, pay at counter

**Payment Attempt**:
One try at charging the Customer's card; a Checkout can have several.
_Avoid_: Transaction, charge

**Payment Declined**:
The outcome where the card issuer refuses the charge for a business reason, such as insufficient funds or a blocked card.
_Avoid_: Payment error, payment failure

**Payment Failure**:
The outcome where the charge could not be completed for a technical reason, such as a timeout or an unavailable provider.
_Avoid_: Declined, rejected

**Refund**:
Returning a card charge to the Customer.
_Avoid_: Chargeback, reversal, void

## People and places

**Customer**:
The anonymous person ordering at the Kiosk; there are no accounts.
_Avoid_: User, client, buyer

**Kiosk**:
A tablet mounted at the counter running the checkout, identified by a fixed id.
_Avoid_: Terminal, device, totem
