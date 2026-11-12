# Shopping List Server

A shopping list app with user accounts and lists shared between users.

- **Backend:** Quarkus + Kotlin, REST API (hexagonal architecture, file-based JSON storage)
- **Web frontend:** React + TypeScript, optimized for mobile
- **Android app:** planned, using the same REST API

## Status

Project setup done (Phase 0 of the [implementation plan](doc/implementation_plan.md)).

## Quick start

Requires JDK 21 and Node.js.

```bash
./gradlew build -PwithFrontend                          # build + test everything
java -jar backend/build/quarkus-app/quarkus-run.jar    # http://localhost:4720
```

Development: `./gradlew :backend:quarkusDev` and `./gradlew :frontend:npmDev` (http://localhost:5173; `:frontend:npmDevStop` frees the port if a server was left running).
API docs: http://localhost:4720/q/swagger-ui

## Documentation

- [Tech stack & architecture](doc/tech_stack.md)
- [Features](doc/features.md)
- [Implementation plan](doc/implementation_plan.md)
