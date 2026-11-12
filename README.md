# Shopping List Server

A shopping list app with user accounts and lists shared between users.

- **Backend:** Quarkus + Kotlin, REST API (hexagonal architecture), PostgreSQL via Hibernate ORM/JPA +
  Flyway - or JSON files, switchable by one config flag
- **Web frontend:** React + TypeScript, optimized for mobile, works offline
- **Android app:** planned, using the same REST API

## Status

Version 1.0.0 is live at https://shopping-list.tobias-fassbender.com. All phases of the
[implementation plan](doc/implementation_plan.md) up to deployment (Phase 12) are done; the Android app comes later.

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
# packaged app locally, without a database and without emails (e2e profile):
java -Dquarkus.profile=e2e -Dshoppinglist.storage=file -jar backend/build/quarkus-app/quarkus-run.jar
```

In its default `prod` profile the packaged app needs the production settings: the database connection
(`SHOPPINGLIST_DB_URL` / `_USER` / `_PASSWORD`), the JWT key file (`SHOPPINGLIST_JWT_KEY_LOCATION` - the dev
key in the repository is only used in dev and tests), and `config/application.properties` with the public
URL and the SMTP settings. The Docker setup provides all of it (below).

## Deployment

Docker Compose (app + PostgreSQL) behind a cloudflared tunnel. `./gradlew dockerImage` builds the image
into `build/docker/` (with `start.sh`, `stop.sh` and the config templates); upload it to the server and run
`./start.sh` there. The settings live outside the image in `config/application.properties`. Setup, updates
and backups: [doc/deployment.md](doc/deployment.md).

## Documentation

- [Tech stack & architecture](doc/tech_stack.md)
- [Features](doc/features.md)
- [Domain data model](doc/data_model.md)
- [Implementation plan](doc/implementation_plan.md)
- [Deployment](doc/deployment.md)
- [Manual offline test checklist](doc/offline_test_checklist.md)
- [QA findings of the test run on 2026-11-11](doc/qa_findings.md)
