# UI Modernization Plan

## Goals

- Deliver a modern, mobile-first interface that feels fast and clear during live movie-night usage.
- Keep trust-confirmation flows obvious and low-risk for users making record changes.
- Improve visual consistency through shared design tokens and reusable layout patterns.
- Preserve existing product behavior while upgrading presentation and interaction quality.

## Principles

- Mobile-first by default: primary actions should be visible and thumb-friendly on narrow screens.
- Progressive disclosure: show essential context first, move dense details into lower sections.
- Consistent primitives: cards, forms, chips, and button patterns should look and behave the same.
- Meaningful feedback: status chips, success/error messages, and loading states should be immediate.
- Performance-aware UI: avoid unnecessary component complexity and keep styling lean.

## Architecture Decisions

- Keep the current Next.js app-router structure and existing route model.
- Introduce a stronger global design system in `app/globals.css` using CSS variables.
- Upgrade shell and navigation styling in `FilmclubClient.tsx` without changing feature logic.
- Reuse existing component boundaries (`ClubSettingsCard`, `HistoryCard`, `ProposalsPanel`) and style them via shared classes.

## Tradeoffs

- We prioritize low-risk UI refactoring over deep component rewrites in this phase.
- This means we get a major quality jump now, while some large JSX sections remain candidates for later split-up.
- Strong global styles improve consistency quickly, but require discipline when adding future one-off styles.

## Phase Plan

1. Phase 1 (current)
- Add modern design tokens, card/form/button system, and mobile-first app shell.
- Improve top-level navigation and visual hierarchy.
- Keep existing flows intact.

2. Phase 2
- Extract shared UI primitives (`Button`, `InputField`, `SectionCard`, `Stack`, `InlineNotice`).
- Refactor `FilmclubClient.tsx` into feature sections (auth, clubs, meetings, proposals, balances).

3. Phase 3
- Add richer interaction polish: skeletons, optimistic feedback, and subtle transitions.
- Expand accessibility coverage (focus flow review, keyboard pass, contrast pass).

## Acceptance Criteria (Phase 1)

- Mobile layout is clean and readable without horizontal overflow.
- Primary navigation and status are always visually clear.
- Cards/forms/buttons feel cohesive across auth, clubs, meetings, and proposals.
- Existing app behavior remains unchanged.
