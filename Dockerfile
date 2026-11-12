# Production image: builds the web app and the backend, runs the Quarkus app on a slim Java 21 runtime.
#   ./gradlew dockerImage     (builds it and saves it as build/docker/shopping-list-<version>.tar.gz)
# Tests are not run here - they run before a release with ./gradlew build -PwithFrontend.

# --- 1. Web app (Vite build) ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. Backend (Quarkus fast-jar) with the web app inside ------------------------------------------------
FROM eclipse-temurin:21-jdk AS backend
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./
COPY gradle/ gradle/
COPY backend/ backend/
COPY frontend/build.gradle.kts frontend/
# Gradle needs the build file of every included module, even though only the backend is built.
COPY e2e/build.gradle.kts e2e/
COPY --from=frontend /src/frontend/dist frontend/dist
# The Gradle cache survives between builds (BuildKit cache mount), so dependencies are downloaded once.
RUN --mount=type=cache,target=/root/.gradle \
    chmod +x gradlew && ./gradlew :backend:quarkusBuild -PwithFrontend=prebuilt --no-daemon --console=plain -x test

# --- 3. Runtime ---------------------------------------------------------------------------------------------
# Alpine keeps the image small - it is uploaded to the server as a file on every release.
FROM eclipse-temurin:21-jre-alpine
# A fixed, unprivileged user and group (10001): the files in config/ on the server must be readable by
# this group (see doc/deployment.md).
RUN addgroup -g 10001 app && adduser -D -H -u 10001 -G app -s /sbin/nologin app
WORKDIR /app
COPY --from=backend --chown=app /src/backend/build/quarkus-app/ ./
# Quarkus reads /app/config/application.properties on top of the built-in settings; docker-compose.yml
# mounts the server's config/ folder here.
USER app
EXPOSE 4723
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "quarkus-run.jar"]
