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
- Supports:
  - Equal split via `participantUserIds`
  - Custom split via `participantShares` (must sum to total).

2. `GET /v1/clubs/:clubId/balances?currency=EUR`
- Returns per-member net balance in selected currency.
- Positive = others owe this member.
- Negative = this member owes others.

3. `GET /v1/clubs/:clubId/balance-overview?currency=EUR`
- Returns:
  - `balances` (net)
  - `summary` (`owes`/`owed`)
  - `matrix` (directed debts: from -> to)

## UI implementation
In `apps/web/app/page.tsx`:
1. Food order form (vendor, total, currency, payer, participants).
2. Custom split toggle with per-participant amounts.
3. Proposal feedback after submission (`pending` vs `approved`).
4. Balance panel with net, summary, and debt-matrix views.

## Known limitations
1. Uses equal split only.
2. Currency conversion is not implemented.
3. Settlement is currently entered via `debt_settlement` proposal payload fields (no dedicated UI form yet).
