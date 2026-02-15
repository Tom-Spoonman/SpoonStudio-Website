# Filmclub Requirements (Derived from your description)

## Product context
Filmclub is a web companion app for a recurring in-person movie-night group.

## Functional requirements
1. The system must support a persistent historical record of movie-night events.
2. The system must allow members to add records, including:
   - Which movie was watched
   - Where food was ordered from
   - Who placed/took over the order
3. The system must include food cost tracking and debt-settlement tracking between members.
4. The system must provide a member rating mechanism for watched movies (and optionally food/vendor ratings later).
5. The system must support a trust-confirmation workflow:
   - A user proposes a change to the record
   - Other members can approve or reject
   - The record only becomes committed once approval rules are met
6. The system must keep an auditable log of:
   - Who proposed a change
   - Who approved/rejected
   - Timestamps and final outcome
7. The app must be usable by a closed group with authenticated members.
8. The system must support multiple independent clubs with strict data isolation by club.
9. The system must support self-join membership by join code.
10. The approval threshold model must be configurable per club with these options:
   - `unanimous`
   - `majority`
   - `fixed` number of approvals from 1..n

## Non-functional requirements
1. The app must be available on the web and deployable under the spoon.studio domain.
2. The data model must be durable and queryable for long-term history.
3. The trust-confirmation process must be tamper-evident from an audit perspective.
4. The app should be optimized for phone usage during movie nights.
5. The architecture should allow adding future modules without major rewrites.
6. Production deployment target should use `filmclub.spoon.studio` for the web app.

## Confirmed clarifications
1. Approval threshold model: configurable per group with `unanimous`, `majority`, or `fixed` count (1..n).
2. Membership model: self-join with code.
3. Debt settlement scope (phase 1): track balances only.
4. Debt settlement scope (later): order placer/takeover member can send debt reminders.
5. Privacy model: multiple independent filmclubs.

## Implemented update
1. Payment reminder flow is now implemented as an audited action:
   - A creditor can send a reminder to a debtor for an outstanding directed balance.
   - Reminder creation does not mutate ledger balances.
   - Reminder entries are persisted and queryable per club.
