.PHONY: up down demo test typecheck openapi

up:
	docker compose up --build

down:
	docker compose down

demo:
	docker compose up --build

observability:
	docker compose --profile observability up --build

test:
	cd apps/payment-mock && npm test
	cd apps/api && npm test
	cd apps/web && npm test
	cd apps/web && npm run e2e

typecheck:
	cd apps/api && npm run typecheck
	cd apps/payment-mock && npm run typecheck
	cd apps/web && npm run typecheck

openapi:
	cd apps/api && npm run openapi
	cd apps/web && npm run api:types
