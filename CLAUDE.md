# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A shopping list app with user management and list sharing between users.

- **Backend:** Quarkus + Kotlin, REST API
- **Web frontend:** React + TypeScript (Vite), mobile-first
- **Android app:** planned later, uses the same REST API

**Status:** Phases 0–10 of `doc/implementation_plan.md` are implemented (accounts, spaces, lists, catalog,
shop layouts, API tokens, offline sync, live updates, i18n/PWA) plus the UI rework from
`doc/mockups/lists-mockup.html`. Next: Phase 11 (PostgreSQL persistence), then Phase 12 (Docker &
deployment).

## Documentation (`doc/`)

- `doc/tech_stack.md` – **authoritative** tech stack and architecture decisions (hexagonal layering,
  light DDD, Postgres/JPA + file-based persistence, Docker). Read before writing backend code.
- `doc/features.md` – **authoritative** feature list with priorities and detailed rules (spaces,
  permissions, sorting, offline sync, API tokens). Based partly on the reference app *Einfacher Einkaufszettel*.
- `doc/data_model.md` – Mermaid diagrams of the domain model (aggregates, id references, sync fields).
- `doc/implementation_plan.md` – phased roadmap (setup → auth → spaces → lists → catalog → layouts →
  API tokens → offline sync → SSE → i18n → deployment).
  Update its checkboxes/status as work completes.

Workflow: tech stack → feature analysis → implementation plan → implementation. Don't jump ahead.

## Decided directions

- **All functionality must be available via REST.** No business logic only in the web frontend – the
  Android app must be able to do everything the web app can. Stateless JWT bearer auth.
- **Architecture: hexagonal (ports & adapters) with light DDD.** Small app – don't overdo it:
  - Layers `domain` → `application` → `adapter`; dependencies point inward only.
  - `domain` is pure Kotlin: no Quarkus, Jakarta or Jackson imports.
  - **The space is the unit of sharing**: lists, shop layouts, categories, units and item history belong
    to a space; only API tokens (and the account) are personal. Roles: owner + member.
  - Aggregates (diagrams in `doc/data_model.md`): `Space`, `SpaceCatalog`, `ShoppingList`, `ShopLayout`,
    `SyncState`, `User`, `UserApiTokens`. Cross-aggregate references by id only. Invariants inside the aggregate,
    permission checks in application services.
  - Typed ids as `@JvmInline value class`; immutable `data class`es, mutations via `copy`.
  - Repository/driven ports in `application.port`; REST DTOs and persistence DTOs live in their adapters
    – domain objects are never serialized directly.
  - **Not used:** domain events, CQRS, event sourcing, generic base classes "for later". Call out
    over-engineering.
  - Enforce layering with ArchUnit tests.
- **Persistence: PostgreSQL (primary) or file-based JSON, switched by `shoppinglist.storage`.** Postgres via
  Hibernate ORM with plain JPA (no Panache), normalized schema, Flyway owns the schema (Hibernate only
  validates). **JPA entities are separate from the domain model** and never leave the persistence adapter.
  The file adapter stays: one file per aggregate under `data/users/<id>/` and `data/spaces/<id>/`, atomic
  writes. Both use a `ReentrantLock` per space for load-modify-save (single instance). Chosen partly as a
  portfolio piece, not for performance.
- **Docker:** Postgres runs in Docker locally and on the Ubuntu server; production via Docker Compose.
- **User management modelled on `../avalons_final_stand`** (email login, BCrypt, HS256 JWT, email
  verification & password reset with hashed tokens, `email-disabled` switch for dev/test).
- **Base package:** `com.tfassbender.shoppinglist`.
- **Monorepo:** Gradle Kotlin DSL with `backend` / `frontend` / `e2e` modules. Built SPA is served by
  Quarkus (single deployable JAR).
- **Offline-first for lists and items:** fine-grained change sync, later change wins per field, edit wins
  over delete, merge warnings via icon + dialog (see `doc/features.md` 3.5). Client-generated UUIDs,
  idempotent change ids.
- **Live updates (web): SSE, notify-then-refetch** via the sync endpoint.
- **AI agents use the same REST API**, documented via OpenAPI; users authenticate them with personal
  API tokens (read-only or full access). No MCP server.
- **Backend port:** 4723 (avalon uses 4719).

## Open decisions

- Live updates in the Android app (SSE or e.g. FCM push).

## Where things are (beyond `doc/`)

- Merge rules of the offline sync: `domain/list/ShoppingList.kt` + `Merge.kt` (tests: `MergeRulesTest`).
- Web offline layer: `frontend/src/offline/` (`SyncEngine`, IndexedDB storage, live updates via SSE).
- Texts: `frontend/src/i18n/en.ts` / `de.ts` - add every new text to both.
- Manual offline checks: `doc/offline_test_checklist.md`.

Don't hard-code undecided details – ask.

## Sibling reference projects – look, don't copy

- `../avalons_final_stand` – same family stack (Quarkus + Kotlin, hexagonal, file JSON storage, JWT auth).
  Main reference for auth (`backend/.../application/auth`, `adapter/rest/AuthResource.kt`,
  `adapter/persistence/FileUserRepository.kt`, `AtomicJsonFile`) and Gradle/Kotlin setup
  (`gradle.properties`: Kotlin version must match the Quarkus BOM).
- Treat sibling projects as **read-only**. Reimplement cleanly instead of copying wholesale; this app is
  simpler (no game engine), so drop what isn't needed.

## Build, run & test commands

Gradle monorepo (`backend` / `frontend` / `e2e`), JDK 21. Run from the repo root.

- **Everything (backend + frontend tests, JAR with SPA):** `./gradlew build -PwithFrontend`
  (without `-PwithFrontend` the backend JAR contains no web app)
- **Run the packaged app:** `java -jar backend/build/quarkus-app/quarkus-run.jar` → http://localhost:4723
- **Backend dev (live reload, port 4723):** `./gradlew :backend:quarkusDev`
- **Backend tests:** `./gradlew :backend:test`; one class:
  `./gradlew :backend:test --tests "com.tfassbender.shoppinglist.adapter.rest.HealthResourceTest"`
- **Frontend dev (Vite, port 5173, proxies `/api` → 4723):** `./gradlew :frontend:npmDev` (or `cd frontend && npm run dev`);
  `./gradlew :frontend:npmDevStop` frees the port if a server was left running
- **Frontend tests / type check / build:** `cd frontend && npm test` / `npm run check` / `npm run build`;
  one file: `npm test -- src/App.test.tsx`
- **E2E (REST against a running backend):** start the backend, then `./gradlew :e2e:e2eTest`
  (`-PbaseUrl=...` for another server). Tests skip themselves if no backend is reachable.
- **API docs:** OpenAPI at `/q/openapi`, Swagger UI at `/q/swagger-ui`.

Domain and application tests run as plain JUnit 5 (no `@QuarkusTest`). `HexagonalArchitectureTest`
(ArchUnit) enforces the layering.

## Conventions

- Kotlin backend; follow the user's global style (methods < 50 lines, descriptive names, comments
  explain *why*). In Kotlin, type inference is fine (the Java "no `var`" rule doesn't apply); still
  prefer `val` over mutable `var`.
- Tests: JUnit 5; RestAssured for REST tests. Domain and application tests run as **plain JUnit without
  `@QuarkusTest`** (use in-memory fakes for ports) – fast and container-free.
- Frontend: the user is not very experienced with React/CSS – explain non-obvious frontend choices
  briefly. Mobile-first layouts, Tailwind utility classes.
- No user-facing strings that would block i18n later (keep them in one place).
- **Git:** solo project – commit directly to `main`, no branches/PRs unless asked.
