# Implementation Plan

Phased roadmap based on `doc/features.md` (what) and `doc/tech_stack.md` (how).
Every phase ends with a working, tested state – backend **and** web frontend – so the app is usable
after each phase. Update the checkboxes and the status as work completes.

**Status:** Phases 0–6 done. Next: Phase 7.

## Guiding principles

- **Backend first per feature, frontend right after.** Every feature is available via REST (and in the
  OpenAPI spec) before the UI uses it – the Android app and AI agents depend on it.
- **Offline sync is designed in from Phase 3**, not bolted on later: list/item mutations are modelled as
  small change objects applied by the `ShoppingList` aggregate, entities carry a sequence number and
  deleted items become tombstones. Phase 7/8 then only add batching, merge warnings and the client queue.
- **Tests:** domain and application services as plain JUnit 5 with in-memory fakes; REST via
  `@QuarkusTest` + RestAssured; frontend via Vitest + Testing Library; a few REST end-to-end flows in `e2e`.

## Overview

| Phase | Content                                         | Result                                        |
|-------|-------------------------------------------------|-----------------------------------------------|
| 0     | Project setup                                   | Empty app builds, runs and is served by Quarkus |
| 1     | Accounts & authentication                       | Register, login, password flows, settings     |
| 2     | Spaces, members & invite links                  | Shareable spaces with owner/member roles      |
| 3     | Lists & items                                   | **Usable shopping list (MVP core)**           |
| 4     | Categories, units, item history                 | Colored categories, autocomplete              |
| 5     | Shop layouts & sorting                          | Sort by shop, favorites, most used first      |
| 6     | API tokens for AI agents                        | Read-only / full tokens, documented API       |
| 7     | Offline sync – backend                          | Batch change sync, merge rules, warnings      |
| 8     | Offline sync – web client                       | **App works offline**                         |
| 9     | Live updates (SSE)                              | Shared lists update without refresh           |
| 10    | i18n, polish, Could-features                    | German/English, PWA, voice input              |
| 11    | Deployment                                      | Running in production                         |
| later | Android app, widget                             |                                               |

---

## Phase 0 – Project setup

Goal: a Gradle monorepo where backend, frontend and e2e build, and the SPA is served by Quarkus.

- [x] Gradle Kotlin DSL root: `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`
      (Quarkus + matching Kotlin version, JVM 21), Gradle wrapper
- [x] `backend`: Quarkus + Kotlin (`quarkus-rest-jackson`, `quarkus-kotlin`, `jackson-module-kotlin`,
      `quarkus-smallrye-openapi`), `allOpen` config, base package `com.tfassbender.shoppinglist`
- [x] Package skeleton `domain` / `application` / `adapter` + **ArchUnit** layering test
- [x] `GET /api/health` + `@QuarkusTest` smoke test
- [x] Error handling: exception mappers → consistent JSON error body (`code`, `message`, error id for 500s)
- [x] Config: port 4720, `shoppinglist.data.dir`, CORS for the Vite dev server
- [x] `frontend`: React + TypeScript + Vite + Tailwind, React Router, TanStack Query, Vitest;
      Vite proxies `/api` → 4720
- [x] **Dark mode** foundation: Tailwind `dark:` variant, follows system setting (user override in Phase 1)
- [x] All UI strings in one place (simple message module) so i18n in Phase 10 is a drop-in
- [x] Gradle tasks: `:frontend:npmBuild`, `-PwithFrontend` packages the SPA into the backend JAR
- [x] SPA fallback routing in Quarkus (deep links like `/lists/123` return `index.html`)
- [x] `e2e` module (JUnit 5 + RestAssured) with one smoke test
- [x] `CLAUDE.md`: fill in build/run/test commands

## Phase 1 – Accounts & authentication

Goal: users can register, log in and manage their account. Modelled on `../avalons_final_stand`.

Backend:
- [x] `AtomicJsonFile` (temp file + atomic move), id path-segment guard, `schemaVersion` in files
- [x] Domain `User` (`UserId`, `Email`, display name, password hash, verification/reset token hashes,
      settings: language, theme, "checked items to the end", "ignore merge warnings")
- [x] Ports `UserRepository`, `TokenIssuer`, `EmailSender`, `Clock`; `FileUserRepository`
- [x] `AuthService`: register, login, me, verify email, resend verification, forgot/reset password,
      change password; BCrypt; no account enumeration
- [x] JWT issuing (HS256, dev key committed, prod key via config), `@RolesAllowed("user")`
- [x] `email-disabled` switch (dev/test/e2e), Quarkus Mailer adapter, mock mailer in dev/test
- [x] `PUT /api/users/me/settings`
- [x] Session lifetime for mobile – **decided: sliding JWT.** Token valid 30 days, clients exchange it via
      `POST /api/auth/refresh` (web: when older than a day). A `sv` (session version) claim, checked per
      request by `SessionValidationAugmentor`, invalidates all tokens on password change/reset and
      `POST /api/users/me/logout-everywhere`. No refresh-token storage needed.

Frontend:
- [x] Pages: login, register, verify email, forgot/reset password
- [x] Auth state (token storage, auto logout on 401), protected routes
- [x] Account/settings page: display name, change password, theme (system/light/dark), logout

Tests: service unit tests, `AuthResource` REST tests, e2e register → login → me.

## Phase 2 – Spaces, members & invite links

Goal: users create spaces and share them via single-use invite links.

Backend:
- [x] Domain `Space` aggregate: name, members (`UserId`, role, joined-at), invites; invariants
      (exactly one owner, owner can't leave without handover, single-use invites, expiry)
- [x] `FileSpaceRepository` (`data/spaces/<id>/space.json`), `ReentrantLock` per space
- [x] `SpaceService` + REST: create, list my spaces, rename, delete (owner)
- [x] Invites (owner): create with configurable expiry (default 1 day), list, revoke;
      accept via token (logged in user joins as member); only token hash stored
- [x] Members: list (display names only), remove (owner), leave (member), transfer ownership (owner)
- [x] Account deletion: owned spaces pass to longest-standing member, otherwise deleted; memberships removed
- [x] Central permission check helper used by all later services (`requireMember`, `requireOwner`)

Frontend:
- [x] Space overview (start page) + create / rename / delete
- [x] Members screen: member list, remove, leave, transfer ownership
- [x] Invite: create link (expiry picker), copy/share (Web Share API on mobile), revoke
- [x] Invite acceptance page `/invite/<token>` (redirects through login/register)
- [x] Delete account (with confirmation)

Decided while implementing: non-members get `404 SPACE_NOT_FOUND` (existence of foreign spaces isn't
revealed), members calling owner actions get `403 OWNER_ONLY`. Invite validity 1 h – 30 days.
`SpaceLocks` (per-space `ReentrantLock`) lives in the application layer, as the services define the
load-modify-save unit.

Tests: `Space` invariants (unit), permission matrix (REST tests per role), e2e invite flow with two users.

## Phase 3 – Lists & items (MVP core)

Goal: a usable shared shopping list. Online only, but built on the change model needed for offline sync.

Backend:
- [x] Domain `ShoppingList` aggregate (`ListId`, `SpaceId`, name, items) and `Item`
      (`ItemId`, name, quantity, unit, note, checked, `seq`, `deleted` tombstone)
- [x] **Change model:** sealed class of list/item changes (add, edit field, check, uncheck, delete,
      remove checked, rename list) applied by the aggregate; client-generated UUIDs accepted
- [x] Per-space sequence counter; every applied change stamps the entity's `seq`
- [x] `FileShoppingListRepository` (`data/spaces/<id>/lists/<listId>.json`)
- [x] REST: lists CRUD (members create/rename, owner deletes), items add/edit/check/uncheck/delete,
      `POST .../remove-checked`; all mapped onto the change model
- [x] Permission checks via `Space` membership

Frontend:
- [x] Lists overview per space, create/rename/delete
- [x] List screen (mobile-first): quick add field, check by tap, edit item (quantity, unit, note),
      delete, "remove all checked"
- [x] **Undo for check** (snackbar after checking)
- [x] "Checked items to the end" (personal setting from Phase 1)
- [x] Route all list mutations through one client module (`listChanges`) – becomes the offline queue in Phase 8

Decided while implementing: the sequence counter is its own file (`sequence.json`) behind the
`SequenceCounter` port; one seq per applied request (batch). Deleted lists are tombstones too.
Editing a tombstoned item is `404` for now – "edit wins over delete" comes with the merge rules in Phase 7.
The web client polls an open list every 10 s until SSE (Phase 9).

Tests: aggregate change application (unit), REST tests incl. permissions, e2e two users on one list.

## Phase 4 – Categories, units, item history

Goal: organized lists and fast entry.

Backend:
- [x] Domain `SpaceCatalog`: categories (name, color, order), units, item history
      (name → last category/unit, usage count, last used)
- [x] `catalog.json` per space; REST for categories (CRUD, color) and units
- [x] Item gets optional `categoryId`; adding/checking items updates the history (usage count)
- [x] `GET .../catalog/suggestions?q=` for autocomplete (prefix match, ranked by usage)
- [x] Sensible default categories + units when a space is created

Frontend:
- [x] Category management (name, color picker, order)
- [x] Item: choose category / unit; list grouped by category with category colors
- [x] Autocomplete in the quick add field (fills category/unit from history)

Decided while implementing: **checking** an item counts as a use ("bought"); adding/editing only teaches
name → category/unit. The server fills in the category from the history when an added item has none, so
all clients (incl. AI agents) place items alike. Suggestions: name-prefix matches first, then word-prefix
matches, each by usage count and recency. Default categories/units are created in the creator's
language. Category reordering uses dnd-kit (shared `SortableList`, reused for layouts in Phase 5).

Tests: suggestion ranking, history updates, REST tests.

## Phase 5 – Shop layouts & sorting

Goal: sort a list by the layout of the shop you are in.

Backend:
- [x] Domain `ShopLayout` (space, name, mode `CATEGORIES` (default) or `ITEMS`, ordered entries,
      connected list ids – usable by several lists)
- [x] `UserFavorites` (personal, per layout) in `data/users/<id>/favorites.json`
- [x] REST: layouts CRUD, connect/disconnect lists, reorder entries; favorites add/remove
- [x] Sorting as domain logic (layout order → favorites → most used first → name), exposed via a
      `sort=<layoutId>` parameter so all clients sort identically

Frontend:
- [x] Layout editor: drag & drop order of categories or items, mode switch, connected lists
- [x] Shop selector on the list screen (remember last used layout per list locally)
- [x] Mark favorites

Decided while implementing: sort keys are checked-to-end (personal setting) → layout position
(CATEGORIES: layout order, then remaining categories in the space order, uncategorized last; ITEMS: item
names case-insensitive, unknown last) → personal favorites → most bought → name. `?sort=` is accepted on
all list endpoints so mutation responses stay sorted. Item favorites are stored as normalized names per
layout. The shop selector offers connected layouts first, then the other shops of the space.

Tests: sort logic (unit, incl. checked-to-end interaction), REST tests.

## Phase 6 – API tokens for AI agents

Goal: users let AI agents use the API.

Backend:
- [x] Domain `ApiToken` (name, scope `READ`/`FULL`, expiry, hash, created/last used);
      `data/users/<id>/api-tokens.json`
- [x] REST: create (raw token shown once), list, revoke
- [x] Custom Quarkus `HttpAuthenticationMechanism`/`IdentityProvider`: recognizes token prefix
      (e.g. `slt_`), otherwise JWT; read-only tokens rejected on mutating endpoints
- [x] Token management endpoints require JWT (a token can't create tokens)
- [x] OpenAPI polish: operation ids, descriptions, examples, security scheme – usable by agents

Frontend:
- [x] Settings → API tokens: create (name, scope, expiry), copy once, list, revoke

Decided while implementing: raw token format `slt_<userId>_<secret>` (the user id finds the token file
without scanning, only a SHA-256 hash is stored); expiry 1 day – 10 years or none. Roles (`Roles`):
`user` for every caller, `session` only for JWTs – required for token management, password change,
logout everywhere, refresh and account deletion. Read-only tokens are blocked for every non-GET request
by a filter (safe by default for new endpoints). Last use is written at most once per hour.

Tests: auth mechanism (JWT vs. token, read-only enforcement, revoked/expired), REST tests.

## Phase 7 – Offline sync: backend

Goal: clients can sync batches of changes made offline.

- [ ] `POST /api/spaces/{id}/changes`: batch of changes with change ids (idempotent: applied change
      ids remembered for a while)
- [ ] Merge rules in the aggregate: same field → later applied wins; **edit wins over delete**
      (restores tombstoned items, also after "remove checked")
- [ ] Merge warnings in the response (overwritten / restored, with who and what)
- [ ] `GET /api/spaces/{id}/changes?since=<seq>`: all lists/items/catalog entries changed since `seq`,
      including tombstones
- [ ] Tombstone cleanup (e.g. after 30 days) + "full resync required" response for very old `since`

Tests: merge rules incl. edge cases (unit), batch idempotency, e2e two clients syncing conflicting changes.

## Phase 8 – Offline sync: web client

Goal: the web app works without connection.

- [ ] Local store in IndexedDB (spaces, lists, items, catalog, layouts) – the UI reads from it
- [ ] Change queue: `listChanges` writes locally + enqueues; sync on reconnect / app start / interval
- [ ] Pull with `since`, apply to local store
- [ ] Offline indicator; space management screens disabled offline
- [ ] **Merge warning icon** + dialog listing the warnings; respects "ignore merge warnings" setting
- [ ] Service worker caching the app shell (needed for offline start; also the base for PWA)

Tests: queue/sync logic (Vitest), manual offline test checklist.

## Phase 9 – Live updates (SSE)

- [ ] SSE endpoint: notification "space changed (seq)" for the user's spaces
- [ ] Auth for SSE (`fetch`-based SSE with header, or short-lived stream token)
- [ ] Client: on notification → pull changes; reconnect with backoff
- [ ] Android mechanism: decided later

## Phase 10 – i18n, polish & Could-features

- [ ] German + English UI, language saved in user settings
- [ ] Installable PWA (manifest, icons) – *Could*
- [ ] Voice input via Web Speech API where available – *Could*
- [ ] UX polish: empty states, loading/error states, accessibility, touch target sizes

## Phase 11 – Deployment

- [ ] Production config: JWT key, SMTP, data dir, public base URL (invite/verification links)
- [ ] Packaging (single JAR incl. SPA), service setup, HTTPS, backups of the data dir

## Later

- [ ] Android app (native Kotlin, same REST API, Room for offline, own live update mechanism)
- [ ] Android home screen widget
