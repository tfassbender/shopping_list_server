# Shopping List Server

A shopping list app with user accounts and lists shared between users.

- **Backend:** Quarkus + Kotlin, REST API (hexagonal architecture), PostgreSQL via Hibernate ORM/JPA +
  Flyway - or JSON files, switchable by one config flag
- **Web frontend:** React + TypeScript, optimized for mobile, works offline
- **Android app:** planned, using the same REST API

## Status

Phases 0–11 of the [implementation plan](doc/implementation_plan.md) are done. Next: Docker & deployment.

## Quick start

Requires JDK 21, Node.js and a running **Docker** (Docker Desktop on Windows/macOS): in dev mode and in the
tests, Quarkus starts PostgreSQL in a container by itself (Dev Services).

```bash
./gradlew build -PwithFrontend                          # build + test everything
```

Development: `./gradlew :backend:quarkusDev` and `./gradlew :frontend:npmDev` (http://localhost:5173;
`:frontend:npmDevStop` frees the port if a server was left running). The dev database lives in
`backend/data/dev-postgres` and survives restarts; delete the folder to start over.
API docs: http://localhost:4723/q/swagger-ui

### Storage: PostgreSQL or files

`shoppinglist.storage` picks the storage: `postgres` (default) or `file` (JSON files under
`shoppinglist.data.dir`, no database needed). The two stores are independent - switching does not move data.

```bash
./gradlew :backend:test -Pstorage=file                                    # tests on the file storage
java -Dshoppinglist.storage=file -jar backend/build/quarkus-app/quarkus-run.jar   # packaged app without a database
```

The packaged app on PostgreSQL reads the connection from the environment:
`SHOPPINGLIST_DB_URL` (e.g. `jdbc:postgresql://localhost:5432/shoppinglist`), `SHOPPINGLIST_DB_USER`,
`SHOPPINGLIST_DB_PASSWORD`. Flyway creates/migrates the schema at startup.

## Documentation

- [Tech stack & architecture](doc/tech_stack.md)
- [Features](doc/features.md)
- [Domain data model](doc/data_model.md)
- [Implementation plan](doc/implementation_plan.md)
