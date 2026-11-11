# Tech Stack

Shopping list app with user management and list sharing. The backend exposes **all** functionality via
REST so the React web frontend and a later Android app are interchangeable clients.

## Overview

| Layer              | Technology                                                    |
|--------------------|---------------------------------------------------------------|
| Backend            | Quarkus 3.x, Kotlin (JVM 21)                                  |
| REST               | Quarkus REST (`quarkus-rest-jackson`), JSON via Jackson + `jackson-module-kotlin` |
| Auth               | SmallRye JWT (HS256 bearer tokens), BCrypt password hashing   |
| Email              | Quarkus Mailer (verification + password reset; mocked in dev/test) |
| Persistence        | File-based JSON (one file per aggregate), behind repository ports |
| Web frontend       | React + TypeScript, Vite, mobile-first                        |
| Styling            | Tailwind CSS                                                  |
| Android app (later)| Native Android (Kotlin), consuming the same REST API          |
| Build              | Gradle (Kotlin DSL), multi-module                             |
| Testing            | JUnit 5, RestAssured, Vitest + Testing Library (frontend)     |

## Backend

- **Quarkus + Kotlin**, same setup as `../avalons_final_stand`:
  - Gradle plugins: `io.quarkus`, `kotlin("jvm")`, `kotlin("plugin.allopen")`
  - `allOpen` for `@Path`, `@ApplicationScoped`, `@QuarkusTest` (Quarkus needs non-final beans)
  - Kotlin version must match the one enforced by the Quarkus BOM (see avalon's `gradle.properties`)
  - `javaParameters = true`, JVM target 21
- **Base package:** `com.tfassbender.shoppinglist`
- **Architecture:** see [Architecture](#architecture-hexagonal--light-ddd) below.
- **API:** versioned under `/api/...`, JSON only, stateless (JWT in `Authorization: Bearer` header) –
  works identically for browser and Android.
- **API documentation:** `quarkus-smallrye-openapi` (OpenAPI spec + Swagger UI) – useful as the contract
  for the Android client.

## User Management (adopted from Avalon's Final Stand)

Reuse the design of `avalons_final_stand/backend/.../application/auth` and `adapter/rest/AuthResource.kt`:

- `User` data class: `id` (UUID value class), `email`, `displayName`, `passwordHash`, `emailVerified`,
  hashed verification/reset tokens + expiry, `createdAt`, `language`
- Endpoints (`/api/auth`): `register`, `login`, `me`, `verify-email`, `resend-verification`,
  `forgot-password`, `reset-password`, `change-password`, `language`, `config`
- JWT: HS256, `upn`/`sub` = user id, group `user`, endpoints guarded with `@RolesAllowed("user")`
- Passwords: BCrypt cost 10 (`at.favre.lib:bcrypt`), max 72 bytes validated upfront
- Email/reset tokens: only SHA-256 hashes are persisted
- No account enumeration (`forgot-password` / `resend-verification` always return 204)
- `email-disabled` switch per profile: dev/test skip email verification, no SMTP needed

Additions needed for this project:
- Find users for sharing (by email or display name)
- Possibly refresh tokens / longer-lived sessions for the mobile app (avalon uses 24 h tokens)
- Account deletion (GDPR)

## Architecture (hexagonal + light DDD)

Ports & adapters with a small, framework-free domain. DDD is used only where it pays off for a small app:
aggregates, value objects, repositories. **No** domain events, CQRS, event sourcing or separate
bounded-context modules.

```
com.tfassbender.shoppinglist
├── domain/          pure Kotlin, no Quarkus/Jackson/Jakarta imports
│   ├── list/        ShoppingList (aggregate root), Item, Category, ListMember, ids
│   └── user/        User (aggregate root), UserId, Email
├── application/     use-case services + ports
│   ├── port/        ShoppingListRepository, UserRepository, TokenIssuer, EmailSender, Clock
│   ├── list/        ShoppingListService (create, add item, check, share, ...)
│   └── auth/        AuthService (register, login, verify, reset, ...)
└── adapter/
    ├── rest/        JAX-RS resources + DTOs + exception mappers   (driving)
    ├── persistence/ File JSON repositories + JSON mapping         (driven)
    ├── security/    JWT issuer                                    (driven)
    └── email/       Quarkus Mailer EmailSender                    (driven)
```

Rules:
- Dependencies point inward: `adapter → application → domain`. The domain knows nothing about the outside.
- **Aggregates:**
  - `ShoppingList` owns its items, categories and members. All changes go through methods on the
    aggregate that enforce invariants (e.g. only members may edit, only the owner may delete/remove
    members, the owner can't be removed).
  - `User` is a separate aggregate. Lists reference users **by `UserId` only**, never by object.
- **Value objects:** typed ids as Kotlin `@JvmInline value class` (`ListId`, `ItemId`, `UserId`), `Email`
  (normalized lowercase), `ItemName` etc. only where validation is needed.
- Domain objects are immutable `data class`es; mutations return a copy that the service saves.
- **Repository ports** are defined in `application.port` in domain terms (`findById`, `findByMember`,
  `save`, `delete`). Adapters translate to the storage format with their own persistence DTOs, so the
  domain classes carry no Jackson annotations.
- REST DTOs live in `adapter.rest` – never expose domain objects directly on the wire.
- Architecture rules are enforced with **ArchUnit** tests (as in avalon).

## Persistence: file-based JSON

Decided: **JSON files, no database.** Lists are small; this keeps setup and hosting trivial. Exchanging it
later (e.g. for PostgreSQL) only means writing new adapters for the repository ports.

- Layout under a configurable data dir (`shoppinglist.data.dir`, default `data`, gitignored):
  ```
  data/
  ├── users/<userId>.json
  └── lists/<listId>.json      list incl. items, categories, members
  ```
- **Atomic writes:** write to a temp file, then atomic move (avalon's `AtomicJsonFile` pattern) – a crash
  never leaves a half-written file.
- **Concurrency:** one in-process `ReentrantLock` per list id around load-modify-save (single instance
  deployment). Plus a `version` field on the list for optimistic checks from clients if needed.
- Lookups other than by id (e.g. "lists where I'm a member", user by email) scan the directory. Fine at
  this scale; an in-memory index is the obvious later optimization.
- Path-segment guard on ids so a crafted id can't escape the data dir.
- Persistence DTOs carry a `schemaVersion` so the file format can evolve.

## Live Sync (open decision)

Shared lists should update on other devices without manual refresh:

- **Polling** (simplest, start here) → **SSE** (`quarkus-rest` supports it) or **WebSockets Next** later.
- Items carry a `version` / `updatedAt` for conflict detection.

## Web Frontend

- **React + TypeScript**, built with **Vite**
- **Mobile-first:** responsive layout, large touch targets, installable as **PWA** (home screen icon)
- **Tailwind CSS** – utility classes instead of custom CSS files (same as avalon)
- **Routing:** React Router
- **Server state:** TanStack Query (caching, refetch/polling for shared lists)
- **i18n:** German + English (avalon stores the user's language on the account)
- **Testing:** Vitest + React Testing Library
- Dev: Vite dev server proxies `/api` to Quarkus; prod: the built SPA is served by Quarkus from
  `META-INF/resources` (same as avalon's `buildFrontend` task), so one deployable JAR.

## Android App (later)

- Native Kotlin app using the same REST API (e.g. Retrofit/Ktor client + Jetpack Compose)
- Requirement for the backend now: everything must be possible via REST, no logic only in the web frontend

## Project Structure (planned)

```
shopping_list_server/
├── backend/        Quarkus + Kotlin
├── frontend/       React + TypeScript (Vite)
├── e2e/            REST end-to-end tests (RestAssured), like avalon
├── doc/            tech_stack.md, features.md, implementation_plan.md (later)
├── build.gradle.kts / settings.gradle.kts / gradle.properties
```

- Local backend port: e.g. `4720` (avalon uses 4719, so both can run at the same time)
