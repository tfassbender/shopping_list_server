# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A shopping list app with user management and list sharing between users.

- **Backend:** Quarkus + Kotlin, REST API
- **Web frontend:** React + TypeScript (Vite), mobile-first
- **Android app:** planned later, uses the same REST API

**Status:** planning phase. No code yet – only documentation in `doc/`.

## Documentation (`doc/`)

- `doc/tech_stack.md` – **authoritative** tech stack and architecture decisions (hexagonal layering,
  light DDD, file-based JSON persistence). Read before writing backend code.
- `doc/features.md` – feature collection incl. analysis of the reference app *Einfacher Einkaufszettel*
  (Jan Kassner). Priorities marked `?` are **not decided** – don't implement them without asking.
- `doc/implementation_plan.md` – *not created yet*; comes after the feature list is prioritized.
  Once it exists, update its checkboxes/status as work completes.

Workflow: tech stack → feature analysis → implementation plan → implementation. Don't jump ahead.

## Decided directions

- **All functionality must be available via REST.** No business logic only in the web frontend – the
  Android app must be able to do everything the web app can. Stateless JWT bearer auth.
- **Architecture: hexagonal (ports & adapters) with light DDD.** Small app – don't overdo it:
  - Layers `domain` → `application` → `adapter`; dependencies point inward only.
  - `domain` is pure Kotlin: no Quarkus, Jakarta or Jackson imports.
  - Aggregates: `ShoppingList` (owns items, categories, members) and `User`. Cross-aggregate references
    by id only. Invariants are enforced inside the aggregate.
  - Typed ids as `@JvmInline value class`; immutable `data class`es, mutations via `copy`.
  - Repository/driven ports in `application.port`; REST DTOs and persistence DTOs live in their adapters
    – domain objects are never serialized directly.
  - **Not used:** domain events, CQRS, event sourcing, generic base classes "for later". Call out
    over-engineering.
  - Enforce layering with ArchUnit tests.
- **Persistence: file-based JSON, no database.** One file per aggregate (`data/users/<id>.json`,
  `data/lists/<id>.json`), atomic writes (temp file + move), a `ReentrantLock` per list for
  load-modify-save. Must stay exchangeable – only the persistence adapter knows about files.
- **User management modelled on `../avalons_final_stand`** (email login, BCrypt, HS256 JWT, email
  verification & password reset with hashed tokens, `email-disabled` switch for dev/test).
- **Base package:** `com.tfassbender.shoppinglist`.
- **Monorepo:** Gradle Kotlin DSL with `backend` / `frontend` / `e2e` modules. Built SPA is served by
  Quarkus (single deployable JAR).
- **Backend port:** 4720 (avalon uses 4719).

## Open decisions

- Live sync for shared lists: start with polling, later SSE or WebSockets.
- Sharing mechanism: search user by email vs. invite link.
- Everything marked `?` in `doc/features.md`.

Don't hard-code undecided details – ask.

## Sibling reference projects – look, don't copy

- `../avalons_final_stand` – same family stack (Quarkus + Kotlin, hexagonal, file JSON storage, JWT auth).
  Main reference for auth (`backend/.../application/auth`, `adapter/rest/AuthResource.kt`,
  `adapter/persistence/FileUserRepository.kt`, `AtomicJsonFile`) and Gradle/Kotlin setup
  (`gradle.properties`: Kotlin version must match the Quarkus BOM).
- Treat sibling projects as **read-only**. Reimplement cleanly instead of copying wholesale; this app is
  simpler (no game engine), so drop what isn't needed.

## Build, run & test commands

*Not set up yet.* Fill in when the project is scaffolded (expected: `./gradlew :backend:quarkusDev`,
`./gradlew :backend:test`, `cd frontend && npm run dev` / `npm test`).

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
