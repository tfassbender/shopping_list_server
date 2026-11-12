# Implementation Plan

Phased roadmap based on `doc/features.md` (what) and `doc/tech_stack.md` (how).
Every phase ends with a working, tested state – backend **and** web frontend – so the app is usable
after each phase. Update the checkboxes and the status as work completes.

**Status:** Phases 0–12 are done: version 1.0.0 runs on the server (2026-11-12). Next: the Android app
(see "Later").

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
| 11    | PostgreSQL persistence (switchable)             | Data in Postgres, files via config flag       |
| 12    | Docker & deployment                             | Running in production                         |
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
- [x] Config: port 4723, `shoppinglist.data.dir`, CORS for the Vite dev server
- [x] `frontend`: React + TypeScript + Vite + Tailwind, React Router, TanStack Query, Vitest;
      Vite proxies `/api` → 4723
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
- [x] **Undo for check** (snackbar after checking) - the snackbar went away with the UI rework: checked
      items stay in place, so tapping again is the undo
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

**Removed on 2026-11-12:** personal favorites per shop (`UserFavorites`, the favorites endpoints, the
`favorite` flag on items, `favorites` in the sync pull, the switch in the item editor). Their only effect
was "first within the same category", too small to be worth it; "most bought first" covers most of it.
Sorting is now checked-to-end → layout position → most bought → name.

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

- [x] `POST /api/spaces/{id}/changes`: batch of changes with change ids (idempotent: applied change
      ids remembered for a while)
- [x] Merge rules in the aggregate: same field → later applied wins; **edit wins over delete**
      (restores tombstoned items, also after "remove checked")
- [x] Merge warnings in the response (overwritten / restored, with who and what)
- [x] `GET /api/spaces/{id}/changes?since=<seq>`: all lists/items/catalog entries changed since `seq`,
      including tombstones
- [x] Tombstone cleanup (e.g. after 30 days) + "full resync required" response for very old `since`

Decided while implementing:
- Items carry per-aspect **stamps** (seq + user) for existence, name, quantity, unit, note, category,
  checked. A batch carries `baseSeq` (the client's last pull); a change conflicts if the stamp of what it
  touches is newer than `baseSeq` and from another user. Online REST calls have no base: plain later-wins.
- Rules: same field → later wins + `OVERWRITTEN` warning; edit/check/uncheck of a deleted item →
  restored + `RESTORED`; delete / remove-checked of an item someone else changed concurrently → skipped
  + `DELETE_SKIPPED`; changes to a deleted list → rejected + `LIST_DELETED`. Offline "remove checked"
  sends the item ids the client saw checked.
- Each change in a batch is applied or rejected on its own (`APPLIED` / `DUPLICATE` / `REJECTED`), one
  seq per batch; change ids remembered 30 days (`spaces/<id>/sync.json`).
- Protocol: push with `baseSeq`, then pull with `since = baseSeq` (not the push seq).
- Tombstones are purged 30 days after deletion when the list is saved; the purge horizon forces a full
  resync for older clients. Catalog and layouts carry a seq and are included in the pull when changed.

Tests: merge rules incl. edge cases (unit), batch idempotency, e2e two clients syncing conflicting changes.

## Phase 8 – Offline sync: web client

Goal: the web app works without connection.

- [x] Local store in IndexedDB (spaces, lists, items, catalog, layouts) – the UI reads from it
- [x] Change queue: `listChanges` writes locally + enqueues; sync on reconnect / app start / interval
- [x] Pull with `since`, apply to local store
- [x] Offline indicator; space management screens disabled offline
- [x] **Merge warning icon** + dialog listing the warnings; respects "ignore merge warnings" setting
- [x] Service worker caching the app shell (needed for offline start; also the base for PWA)

Decided while implementing:
- Lists/items: own `SyncEngine` (`frontend/src/offline`) with confirmed server state + acknowledged +
  queued changes per space in IndexedDB (`idb-keyval`); the UI shows server state with pending changes
  applied. Everything else (spaces, catalog, layouts, favorites, user) via TanStack Query with its cache
  persisted to IndexedDB (`networkMode: offlineFirst`).
- Shop sorting moved to the client (`sortForLayout`, a port of `ItemSorter` with mirrored tests) so it
  works offline; the catalog API now includes usage counts. `?sort=` stays for other API clients.
- Sync on app start, reconnect, tab becoming visible and every 60 s (SSE in Phase 9).
- Hand-written service worker (`public/sw.js`, production builds only) instead of a build plugin.
- Logout clears the offline data. Manual checklist: `doc/offline_test_checklist.md`.

Tests: queue/sync logic (Vitest), manual offline test checklist.

## Phase 9 – Live updates (SSE)

- [x] SSE endpoint: notification "space changed (seq)" for the user's spaces
- [x] Auth for SSE (`fetch`-based SSE with header, or short-lived stream token)
- [x] Client: on notification → pull changes; reconnect with backoff
- [ ] Android mechanism: decided later

Decided while implementing: one stream per user, `GET /api/events` (`SPACE_CHANGED` with space id and
seq, `PING` heartbeat every 25 s), filtered per event by membership. Auth: **`fetch`-based SSE with the
normal `Authorization` header** (no stream token; works for API tokens too). Changes are announced by
`SpaceLocks` when the outermost lock of a space is released after success - every mutation already runs
under that lock, so no service needs to remember to notify. Client: reconnect with backoff 1 s → 30 s,
full sync after each (re)connect; the periodic sync fallback is now every 5 minutes.


## Phase 10 – i18n, polish & Could-features

- [x] German + English UI, language saved in user settings
- [x] Installable PWA (manifest, icons) – *Could*
- [x] Voice input via Web Speech API where available – *Could*
- [x] UX polish: empty states, loading/error states, accessibility, touch target sizes

Decided while implementing:
- i18n without a library: `i18n/en.ts` (reference) and `i18n/de.ts` typed `Record<MessageKey, string>`, so
  a missing German text is a compile error; a test checks that the placeholders match. Language = user
  setting once logged in, before that the last choice on the device (DE/EN toggle in the header) or the
  browser language. Registering takes the current UI language (it decides the default categories).
- PWA: `manifest.json` + PNG icons (incl. maskable), apple-touch icon. Caching headers: everything except
  the content-hashed `/assets/` is served `no-cache`, so new deployments reach users (found while testing:
  without it browsers kept an old app shell).
- Voice input: microphone button only where the browser has the Web Speech API; the recognized text goes
  into the quick-add field and is confirmed with Enter.
- Polish: load errors with retry, empty-state hints, Escape closes dialogs (`aria-modal`).

## UI rework (after Phase 10)

- [x] Clickable mockup `doc/mockups/lists-mockup.html` agreed with the user
- [x] Web app reworked to the mockup: light blue header bar with ⋮ menu for rare actions, start page shows
  all lists of all spaces, bigger base font (17px), design tokens in `index.css` (the start page later got
  icons instead of the menu, see below)
- [x] List view: no checkboxes (tap toggles, checked = grey + struck through), checked items stay in place;
  a header button moves them to the end on demand; + button opens the add dialog (stays open for several
  items); shop choice via the line under the title; item details via ⋯ (the favorite switch per shop
  was removed with the favorites)
- [x] Pages "Spaces & sharing" (`/spaces`), space page with members/invites/catalog/shops (members page
  merged into it), settings as rows, API tokens on their own page (`/settings/api-tokens`)

Decided while implementing:
- The user setting `checkedItemsToEnd` is no longer used by the web app (the sort button replaced it); it
  stays in the API for now.
- Confirmations use an in-app dialog (`ConfirmDialog`) instead of `window.confirm`.

## API additions for the Android app (GitHub issues)

- [x] #1 Item history for offline autocomplete: `CatalogDto.history` (complete history; the ranking of
  `getSuggestions` is described in its OpenAPI description). History changes from adding/checking items now
  reach the pull: each history entry carries its own seq, and the pull sends `historyChanges` (entries
  added/updated since `since`) instead of the whole catalog - checking items changes the history all the
  time and the history can hold 2000 entries. The complete `catalog` (incl. history) is sent when
  categories/units changed or entries were removed/renamed (also when the history was full and dropped one).
  The web app suggests from the cached history when offline; every sync pull updates that history in its
  query cache (`offline/pullToCache.ts`).
- [x] #2 Android App Links: `GET /.well-known/assetlinks.json` (public, not in OpenAPI), fingerprints from
  configuration, separately for release and debug app (`shoppinglist.android.{release,debug}.*`, empty by
  default, so the release package never trusts the debug key); stable link paths
  documented in `tech_stack.md` and the OpenAPI description.
- [x] #3 *(favorites removed on 2026-11-12)* Favorites in the sync pull: `favorites` (layout id -> names) is always sent complete - it is small
  and personal, so no seq per favorite. Changing a favorite now runs under the space lock and takes a new
  seq, so it is announced via SSE and the user's other devices pull (other members get an empty pull).
  User settings stay on `GET /api/users/me`.
- [x] #4 OpenAPI for generated clients: created resources return their DTO with `@ResponseStatus(201)` plus
  an `@APIResponse` (SmallRye doesn't read `@ResponseStatus`), no-content operations return nothing (204;
  POSTs annotated, otherwise the spec says 201), optional query parameters are `required: false`, and
  `SessionResponse` sends `token`/`expiresAt` as explicit nulls. Checked by `OpenApiContractTest`.

## Phase 11 – PostgreSQL persistence (switchable)

Goal: PostgreSQL is the primary storage; the file storage stays available via `shoppinglist.storage=file`.
Design in `doc/tech_stack.md` -> Persistence. Mainly a portfolio decision, not a performance one.

- [x] Local Postgres in Docker (Docker Desktop); Quarkus Dev Services for dev and tests (image
      `postgres:17`; dev data bound to `backend/data/dev-postgres`, tests start empty)
- [x] Dependencies: `quarkus-hibernate-orm`, `quarkus-jdbc-postgresql`, `quarkus-flyway` (+ `-postgresql`);
      Kotlin `plugin.jpa` + `allopen` for `@Entity`/`@Embeddable`
- [x] Config flag `shoppinglist.storage=postgres|file`; producers pick the adapter; datasource, Hibernate
      and Flyway deactivated in file mode (app starts without Postgres - checked with the packaged JAR)
- [x] Flyway `V1` migration with the normalized schema; Hibernate only validates
- [x] JPA entities in `adapter.persistence.jpa`, **separate from the domain model**, with mapping
      entity <-> domain; ArchUnit rules: JPA/JTA only in `adapter.persistence`, entities only in `.jpa`
- [x] JPA repositories for all ports (users, API tokens, spaces, catalog, lists + items,
      layouts, sequence counter, sync state)
- [x] `TransactionRunner` port: one transaction per `SpaceLocks` operation (no-op for files), rollback test
- [x] Shared repository contract tests (`RepositoryContract`), run against the file and the Postgres adapter
- [x] REST and e2e tests green in both modes (e2e against dev mode and the packaged JAR on Postgres and files)
- [ ] ~~Optional: one-shot copy tool file -> Postgres~~ - skipped: not deployed yet, no data to move

Side change: `@QuarkusTest`s run on a random HTTP port (`quarkus.http.test-port=0`), so test runs in
several checkouts/worktrees don't collide on 8081.

## Code review and UI additions (2026-11-12)

- [x] Code review (backend, architecture, frontend) and fixes: per-user lock (`UserLocks`) for the account
  and API tokens; sync pull under the space lock, applied change ids saved after the lists; prod requires
  `SHOPPINGLIST_JWT_KEY_LOCATION` (no fallback to the dev key); `CategoryId` moved to `domain.space`, ArchUnit
  forbids cycles between domain packages; web: offline storage errors shown, logout clears the device data
  and warns about unsent changes, dialogs keep the keyboard focus, the service worker caches the app's
  assets for offline starts
- [x] Space page lists the lists of the space; a list opened there leads back to it
- [x] Personal order of spaces: drag and drop on the spaces page, used by the start page
  (`PUT /api/spaces/order`, Flyway `V2` with table `user_space_order`)
- [x] Start page: + button for a new list, spaces and settings as header icons (no ⋮ menu); more compact rows
- [x] Clearer icons (sheet of paper with list lines) for the browser tab and the installed app

Open from the review, deliberately not done yet:
- ~~Rate limiting of login, registration and the email endpoints~~ - done in Phase 12.
- Upper limits for spaces, lists, layouts and invites per account.
- An open live-update stream is not closed by "log out everywhere" (it carries only ids and seq numbers).

## Phase 12 – Docker & deployment

- [x] Production config outside the image: `config/application.properties` (public URL, Resend SMTP) and
      `config/jwt.jwk` mounted into the container, database password in `.env`; version 1.0.0
- [ ] Android signing certificate fingerprints (App Links) - when the Android app exists
- [x] Rate limiting of login, registration and the email endpoints in the app (`AuthRateLimits`, per client
      address via Cloudflare's `CF-Connecting-IP`; off in dev/test/e2e)
- [x] Multi-stage `Dockerfile` (Node stage for the SPA, Gradle stage with `-PwithFrontend=prebuilt`, JRE 21
      runtime as an unprivileged user)
- [x] `docker-compose.yml`: app + Postgres (named volume, health check, `config/` mounted, no published DB
      port, app bound to `127.0.0.1`) - tried locally
- [x] Backups: `deploy/backup.sh` (`pg_dump`, 14 days) for a daily cron job - tried locally
- [x] `./gradlew dockerImage`: image built on the PC and saved as a file in `build/docker/` with `start.sh`,
      `stop.sh`, `backup.sh`, the Compose file and the config templates; uploaded by hand and started on the
      server with `./start.sh` (no sources there, as with the other projects) - tried locally
- [x] `doc/deployment.md`: setup, cloudflared ingress, updates, backups and restore
- [x] Ubuntu server: Docker Engine + Compose plugin (replaced the snap Docker)
- [x] Ubuntu server: `.env` and `config/`, first start, cloudflared ingress for
      `shopping-list.tobias-fassbender.com`; started and stopped with the server's other apps by its
      `start_all.sh` / `stop_all.sh` (they call `start.sh` / `stop.sh` where there is no `start-server.sh`)
- [ ] Ubuntu server: cron for the daily backup (`backup.sh`), copy of `backups/` off the server
- [x] Tag `v1.0.0`

Decided: HTTPS through the existing cloudflared tunnel instead of a reverse proxy (as for the other
projects on the server).
- [ ] Optional: GitHub Actions builds the image and pushes it to GHCR

## Later

- [ ] Android app (native Kotlin, same REST API, Room for offline, own live update mechanism)
- [ ] Android home screen widget
