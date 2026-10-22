INSERT INTO "products" ("category_id", "name", "emoji", "price_cents", "stock")
SELECT c."id", v.name, v.emoji, v.price_cents, v.stock
FROM "categories" c
CROSS JOIN (
	VALUES
		('Chicken croquette', '🥠', 650, 22),
		('Esfiha', '🫓', 800, 20),
		('French fries', '🍟', 700, 28),
		('Hot dog', '🌭', 1100, 14),
		('Kibbeh', '🥙', 750, 16),
		('Mini pizza', '🍕', 1300, 10)
) AS v(name, emoji, price_cents, stock)
WHERE c."name" = 'Snacks'
	AND NOT EXISTS (SELECT 1 FROM "products" p WHERE p."name" = v.name);
--> statement-breakpoint
INSERT INTO "products" ("category_id", "name", "emoji", "price_cents", "stock")
SELECT c."id", v.name, v.emoji, v.price_cents, v.stock
FROM "categories" c
CROSS JOIN (
	VALUES
		('Beijinho', '🥥', 400, 48),
		('Churro', '🍯', 650, 18),
		('Cookie', '🍪', 500, 36),
		('Donut', '🍩', 600, 24),
		('Ice cream', '🍨', 900, 12),
		('Passion fruit mousse', '🍋', 850, 8),
		('Pudding', '🍮', 700, 15)
) AS v(name, emoji, price_cents, stock)
WHERE c."name" = 'Sweets'
	AND NOT EXISTS (SELECT 1 FROM "products" p WHERE p."name" = v.name);
