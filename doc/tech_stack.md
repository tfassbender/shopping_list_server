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
| Persistence        | PostgreSQL via Hibernate ORM (plain JPA) + Flyway; file-based JSON as switchable alternative - both behind repository ports |
| Containers         | Docker (Postgres locally and on the server), Docker Compose for the production stack |
| Web frontend       | React + TypeScript, Vite, mobile-first                        |
| Styling            | Tailwind CSS                                                  |
| Android app (later)| Native Android (Kotlin), consuming the same REST API          |
| Build              | Gradle (Kotlin DSL), multi-module                             |
| Testing            | JUnit 5, RestAssured, Dev Services/Testcontainers (Postgres), Vitest + Testing Library (frontend) |

## Backend

- **Quarkus + Kotlin**, same setup as `../avalons_final_stand`:
  - Gradle plugins: `io.quarkus`, `kotlin("jvm")`, `kotlin("plugin.allopen")`
  - `allOpen` for `@Path`, `@ApplicationScoped`, `@QuarkusTest` (Quarkus needs non-final beans)
  - Kotlin version must match the one enforced by the Quarkus BOM (see avalon's `gradle.properties`)
  - `javaParameters = true`, JVM target 21
- **Base package:** `com.tfassbender.shoppinglist`
- **Architecture:** see [Architecture](#architecture-hexagonal--light-ddd) below.
- **API:** versioned under `/api/...`, JSON only, stateless (`Authorization: Bearer` header) –
  works identically for browser, Android and AI agents.
- **API documentation:** `quarkus-smallrye-openapi` (OpenAPI spec + Swagger UI) – the contract for the
  Android client and for AI agents. Keep operation ids, descriptions and schemas meaningful.

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
- **Spaces** with owner/member roles and **single-use invite links** (configurable expiry, default 1 day,
  revocable, only token hash stored) – see `doc/features.md` 3.1
- **Personal API tokens** for AI agents: random opaque tokens (only hash stored), name + expiry,
  scope `read` or `full`, revocable. No MCP server – agents use the REST API. Accepted as `Bearer` token next to the JWT – needs a custom Quarkus
  `HttpAuthenticationMechanism`/`IdentityProvider` that recognizes the token prefix (e.g. `slt_...`).
- Possibly refresh tokens / longer-lived sessions for the mobile app (avalon uses 24 h tokens)
- Account deletion (GDPR): owned spaces pass to the longest-standing member

## Architecture (hexagonal + light DDD)

Ports & adapters with a small, framework-free domain. DDD is used only where it pays off for a small app:
aggregates, value objects, repositories. **No** domain events, CQRS, event sourcing or separate
bounded-context modules.

```
com.tfassbender.shoppinglist
├── domain/          pure Kotlin, no Quarkus/Jackson/Jakarta imports
│   ├── space/       Space (members, roles, invites), SpaceCatalog (categories, units, item history)
│   ├── list/        ShoppingList (items), ShopLayout
│   └── user/        User, ApiToken
├── application/     use-case services + ports
│   ├── port/        repositories, TokenIssuer, EmailSender, Clock
│   ├── space/       SpaceService (create, invite, join, remove member, transfer ownership, ...)
│   ├── list/        ShoppingListService (add item, check, sort, ...)
│   └── auth/        AuthService (register, login, verify, reset, API tokens, ...)
└── adapter/
    ├── rest/        JAX-RS resources + DTOs + exception mappers   (driving)
    ├── persistence/ File JSON repositories + JSON mapping         (driven)
    │   └── jpa/     JPA entities + repositories (PostgreSQL)      (driven)
    ├── security/    JWT issuer                                    (driven)
    └── email/       Quarkus Mailer EmailSender                    (driven)
```

Rules:
- Dependencies point inward: `adapter → application → domain`. The domain knows nothing about the outside.
- **Aggregates:**
  - `Space` – the unit of sharing. Owns members (user id, role, joined-at) and invites. Enforces
    membership rules (exactly one owner, owner can't leave without handing over, single-use invites).
  - `SpaceCatalog` – categories (with colors), units, item history of a space.
  - `ShoppingList` – items of one list; references its `SpaceId`.
  - `ShopLayout` – sort order for one shop, part of the space, usable by several lists.
  - `User`, `ApiToken` – personal, never shared.
  - Aggregates reference each other **by id only**. Permission checks ("is this user a member/owner of
    the space that contains this list?") happen in the application services using the `Space`.
- **Value objects:** typed ids as Kotlin `@JvmInline value class` (`ListId`, `ItemId`, `UserId`), `Email`
  (normalized lowercase), `ItemName` etc. only where validation is needed.
- Domain objects are immutable `data class`es; mutations return a copy that the service saves.
- **Repository ports** are defined in `application.port` in domain terms (`findById`, `findByMember`,
  `save`, `delete`). Adapters translate to the storage format with their own persistence DTOs, so the
  domain classes carry no Jackson annotations.
- REST DTOs live in `adapter.rest` – never expose domain objects directly on the wire.
- Architecture rules are enforced with **ArchUnit** tests (as in avalon).

## Persistence

Two interchangeable adapters implement the same repository ports in `application.port`; a runtime config
flag selects one:

```properties
shoppinglist.storage=postgres   # default; or: file
```

**Why a database at all:** not performance (the data is small, one server instance). The project is also a
portfolio piece, and PostgreSQL + Hibernate + Flyway + Docker are technologies worth showing. The file
adapter stays, which also demonstrates that the hexagonal ports really make storage exchangeable.

- Switching the flag does **not** migrate data - the two stores are independent. A one-shot copy tool
  (file -> Postgres) is optional.
- A single server instance stays the assumption: the in-process `SpaceLocks` remain the concurrency
  mechanism for both adapters (no database locks, no multi-instance SSE fan-out).
- In file mode the datasource and Hibernate are deactivated at runtime, so the app starts without Postgres.

### PostgreSQL (primary adapter)

- **Hibernate ORM with plain JPA** (`EntityManager`), no Panache: plain JPA skills carry over to other
  stacks, and Panache's active-record style would pull persistence concerns towards the domain.
- **Normalized schema** (tables for users, API tokens, spaces, members, invites, categories,
  units, item history, lists, items, item stamps, layouts, layout entries, sequence counter, sync state).
- **JPA entities are separate from the domain model - a firm rule.** Entities live only in
  `adapter.persistence.jpa`; the domain stays immutable Kotlin `data class`es with value-class ids and no
  JPA annotations. Repositories map entity <-> domain in both directions (same idea as the file DTOs).
  Reasons: JPA needs mutable, open classes with a no-arg constructor and managed identity, which conflicts
  with immutable aggregates; and the domain must not depend on Jakarta Persistence (ArchUnit enforces it).
  The Kotlin `plugin.jpa` (no-arg) and `allopen` for `@Entity` apply to the entity classes only.
- **Saving an aggregate** replaces its state: the repository loads the managed root entity (or creates
  it) and brings it to the domain state with `updateFrom`; Hibernate writes only the rows that changed.
  - Parts without identity in the database (members, invites, categories, units, history entries, layout
    orders, applied change ids, merge stamps) are `@ElementCollection`s of `data class` embeddables;
    ordered lists carry a `position` column (`@OrderColumn`).
  - Items are real entities (`@OneToMany(orphanRemoval)`), because each one owns its stamps. They are
    matched by domain id and updated in place - new instances for the same item would make Hibernate
    insert before it deletes and break the unique (list, item id) constraint.
  - Roots whose domain ids are unique only per space (lists, layouts) get a surrogate `pk` plus a unique
    constraint on (space id, domain id). The user's API tokens have no root row of their own - they are
    rows keyed by user id.
  - The aggregate is the unit of persistence: domain objects are built inside the transaction, so no lazy
    loading leaks into the domain, and entities never leave the adapter.
- **Schema owned by Flyway** (`src/main/resources/db/migration/V*__*.sql`, `migrate-at-start`); Hibernate
  only validates it (`schema-management.strategy=validate`) and never generates tables. Applied migrations
  are never edited - changes go into a new `V2__...`. Column names come from the property names
  (`CamelCaseToUnderscoresNamingStrategy`).
- **Foreign keys** with `ON DELETE CASCADE` inside an aggregate and from all space data to `spaces` and all
  personal data to `users`, so deleting a space or user is one delete. None for id references the domain
  allows to dangle (category ids, layout list ids, member and stamp user ids).
- **Transactions:** one transaction per locked operation, opened via a small port (`TransactionRunner`)
  that `SpaceLocks` uses; it commits before the lock is released and before live updates go out. Every
  repository method joins it, or runs in its own transaction outside a lock. The file adapter's runner
  does nothing. Keeps `@Transactional` out of the application services.
- **Timestamps** are `timestamptz` with microsecond precision; an `Instant` with nanoseconds comes back
  rounded to microseconds (harmless, the app never compares stored timestamps for equality).
- **Tests:** `RepositoryContract` is one test suite that runs against both adapters
  (`FileRepositoryContractTest`, `JpaRepositoryContractTest`), plus a rollback test of `SpaceLocks`. The
  Postgres tests use a real database from Quarkus Dev Services (Testcontainers, needs Docker); each
  test uses random ids because the database is shared by the whole test run. All REST tests run on Postgres
  by default and on files with `-Pstorage=file`.
- **Dev mode:** Dev Services as well, with the data directory bound to `backend/data/dev-postgres`
  (gitignored), so dev data survives restarts.
- **Production:** connection from `SHOPPINGLIST_DB_URL`, `SHOPPINGLIST_DB_USER`, `SHOPPINGLIST_DB_PASSWORD`.

### File-based JSON (alternative adapter)

The original storage, kept as a fully working alternative (`shoppinglist.storage=file`). Lists are small, so
files are sufficient; it needs no database at all.

- Layout under a configurable data dir (`shoppinglist.data.dir`, default `data`, gitignored):
  ```
  data/
  ├── users/<userId>/
  │   ├── user.json
  │   └── api-tokens.json
  └── spaces/<spaceId>/
      ├── space.json            members, roles, invites
      ├── catalog.json          categories, units, item history
      ├── lists/<listId>.json   items
      └── layouts/<layoutId>.json
  ```
- **Atomic writes:** write to a temp file, then atomic move (avalon's `AtomicJsonFile` pattern) – a crash
  never leaves a half-written file.
- **Concurrency:** one in-process `ReentrantLock` per space id around load-modify-save (single instance
  deployment; simple and sufficient since a space's data is small). Plus a `version` field on the list for optimistic checks from clients if needed.
- Lookups other than by id (e.g. "lists where I'm a member", user by email) scan the directory. Fine at
  this scale; an in-memory index is the obvious later optimization.
- Path-segment guard on ids so a crafted id can't escape the data dir.
- Persistence DTOs carry a `schemaVersion` so the file format can evolve.

## Containers & Deployment

- **Docker** for PostgreSQL locally (Docker Desktop; enables Quarkus Dev Services) and on the Ubuntu server
  (Docker Engine + Compose plugin from Docker's apt repository).
- **Production stack** via `docker-compose.yml`: app image (multi-stage `Dockerfile`: builds the SPA and the
  backend, runs on a slim Java 21 runtime) + Postgres with a named volume and health check; secrets in an
  `.env` file that is not committed.
- Postgres publishes **no port**; the app reaches it on the internal Compose network. The app port binds to
  `127.0.0.1` behind a reverse proxy for HTTPS (ports published by Docker bypass `ufw`).
- Backups: daily `pg_dump` (via `docker exec`) by cron.

## Offline Sync

Rules are defined in `doc/features.md` 3.5. Technical approach:

- **Change API:** clients send batches of fine-grained changes (`POST /api/spaces/{id}/changes`), each with a
  client-generated change id (idempotency) and client-generated entity ids (UUIDs).
- **Merge in the domain:** applying a change is domain logic (`ShoppingList` aggregate), so web, Android
  and AI agents get identical behaviour. "Later wins" = order in which the server applies the changes.
- **Pull:** a per-space sequence counter; every item/list stores the sequence of its last change, deleted
  items are kept as tombstones for a while. `GET /api/spaces/{id}/changes?since=<seq>` returns everything
  newer – no separate change log file needed.
- **Merge warnings** are returned in the sync response (what was overwritten / restored); the client
  stores them for the warning icon.
- The plain REST endpoints (e.g. `POST .../items`) stay available for online clients and AI agents and go
  through the same domain logic.

## Live Updates

- **SSE, notify-then-refetch:** `GET /api/spaces/{id}/events` (or one stream per user for all their spaces)
  sends a lightweight "space changed (seq)" notification; the client then pulls via the sync endpoint.
- Supported by `quarkus-rest` out of the box; SSE can't send an `Authorization` header from the browser's
  `EventSource`, so use `fetch`-based SSE or a short-lived stream token.
- Android: may use a different mechanism (e.g. FCM push in the background) – decided later.

## Web Frontend

- **React + TypeScript**, built with **Vite**
- **Mobile-first:** responsive layout, large touch targets, installable as **PWA** (home screen icon)
- **Tailwind CSS** – utility classes instead of custom CSS files (same as avalon)
- **Routing:** React Router
- **Server state:** TanStack Query (caching, refetch/polling for shared lists)
- **i18n:** German + English (avalon stores the user's language on the account)
- **Testing:** Vitest + React Testing Library
- Dev: Vite dev server proxies `/api` to Quarkus; prod: the built SPA is served by Quarkus from
  `META-INF/resources` (packaged into the backend JAR with `./gradlew build -PwithFrontend`), so one
  deployable JAR. Deep links are rerouted to `index.html` (`SpaRouting`).

## Android App (later)

- Native Kotlin app using the same REST API (e.g. Retrofit/Ktor client + Jetpack Compose)
- Requirement for the backend now: everything must be possible via REST, no logic only in the web frontend
- **Android App Links:** the server serves `/.well-known/assetlinks.json` (package name and SHA-256
  signing certificate fingerprints per app - release and debug separately - from `shoppinglist.android.*` in
  `application.properties`; empty by default). The link paths are stable, so the app's intent filters can match them:
  `<public-base-url>/invite/<token>`, `/verify-email?token=<token>`, `/reset-password?token=<token>`.

## Project Structure (planned)

```
shopping_list_server/
├── backend/        Quarkus + Kotlin
├── frontend/       React + TypeScript (Vite)
├── e2e/            REST end-to-end tests (RestAssured), like avalon
├── doc/            tech_stack.md, features.md, implementation_plan.md (later)
├── build.gradle.kts / settings.gradle.kts / gradle.properties
```

- Local backend port: e.g. `4723` (avalon uses 4719, so both can run at the same time)
