# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A shopping list app with user management and list sharing between users.

- **Backend:** Quarkus + Kotlin, REST API
- **Web frontend:** React + TypeScript (Vite), mobile-first
- **Android app:** planned later, uses the same REST API

**Status:** planning phase. Tech stack and features are settled; implementation plan in `doc/implementation_plan.md`.
Phase 0 (project setup) is done.

## Documentation (`doc/`)

- `doc/tech_stack.md` – **authoritative** tech stack and architecture decisions (hexagonal layering,
  light DDD, file-based JSON persistence). Read before writing backend code.
- `doc/features.md` – **authoritative** feature list with priorities and detailed rules (spaces,
  permissions, sorting, offline sync, API tokens). Based partly on the reference app *Einfacher Einkaufszettel*.
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
    to a space; only favorites and API tokens are personal. Roles: owner + member.
  - Aggregates (see `doc/tech_stack.md`): `Space`, `SpaceCatalog`, `ShoppingList`, `ShopLayout`, `User`,
    `ApiToken`, `UserFavorites`. Cross-aggregate references by id only. Invariants inside the aggregate,
    permission checks in application services.
  - Typed ids as `@JvmInline value class`; immutable `data class`es, mutations via `copy`.
  - Repository/driven ports in `application.port`; REST DTOs and persistence DTOs live in their adapters
    – domain objects are never serialized directly.
  - **Not used:** domain events, CQRS, event sourcing, generic base classes "for later". Call out
    over-engineering.
  - Enforce layering with ArchUnit tests.
- **Persistence: file-based JSON, no database.** One file per aggregate under `data/users/<id>/` and
  `data/spaces/<id>/`, atomic writes (temp file + move), a `ReentrantLock` per space for
  load-modify-save. Must stay exchangeable – only the persistence adapter knows about files.
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
- **Backend port:** 4720 (avalon uses 4719).

## Open decisions

- Live updates in the Android app (SSE or e.g. FCM push).

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
- **Run the packaged app:** `java -jar backend/build/quarkus-app/quarkus-run.jar` → http://localhost:4720
- **Backend dev (live reload, port 4720):** `./gradlew :backend:quarkusDev`
- **Backend tests:** `./gradlew :backend:test`; one class:
  `./gradlew :backend:test --tests "com.tfassbender.shoppinglist.adapter.rest.HealthResourceTest"`
- **Frontend dev (Vite, port 5173, proxies `/api` → 4720):** `cd frontend && npm run dev`
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
