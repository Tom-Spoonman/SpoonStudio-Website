# Debt Ledger Foundations (Step 4)

## Scope
Initial debt-ledger support for food orders and per-member net balances.

## Data model
Tables:
1. `food_orders`
2. `food_order_participants`
3. `ledger_entries`

## API endpoints
1. `POST /v1/food-orders`
- Creates a `food_order` proposal (trust-confirmation).
- Ledger entries are created only when proposal reaches `approved`.
- Uses equal split across selected participants.

2. `GET /v1/clubs/:clubId/balances?currency=EUR`
- Returns per-member net balance in selected currency.
- Positive = others owe this member.
- Negative = this member owes others.

## UI implementation
In `apps/web/app/page.tsx`:
1. Food order form (vendor, total, currency, payer, participants).
2. Proposal feedback after submission (`pending` vs `approved`).
3. Balance panel for active club.

## Known limitations
1. Uses equal split only.
2. Currency conversion is not implemented.
3. No manual settlement entry flow yet.
