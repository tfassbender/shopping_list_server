# Deployment

The app runs on the Ubuntu server as a **Docker Compose** stack: the app container and a PostgreSQL
container. The image is built on the PC (`./gradlew dockerImage`) and uploaded to the server as a file;
there, `./start.sh` and `./stop.sh` start and stop the app. The server has no source code.

HTTPS comes from **cloudflared**: the tunnel forwards `https://shopping-list.tobias-fassbender.com` to the
app on `127.0.0.1:4723`. There is no reverse proxy and no open port.

```
browser ──https──> Cloudflare ──tunnel──> cloudflared (server) ──> 127.0.0.1:4723 app ──> db (Compose network)
```

## Build the image (PC)

```bash
./gradlew build -PwithFrontend     # all tests - the image build skips them
./gradlew dockerImage              # -> build/docker/
```

`dockerImage` needs Docker Desktop. The Dockerfile builds the web app and the backend itself, so no other
build step is needed. `build/docker/` then contains:

| File | Upload |
|---|---|
| `shopping-list-<version>.tar.gz` | the image (~120 MB) - for every release |
| `start.sh`, `stop.sh`, `backup.sh`, `docker-compose.yml` | once (again only if they change) |
| `env.example`, `application.properties.example` | templates for the first setup |

The version comes from `build.gradle.kts`.

## Files on the server

The app lives in a directory of your choice (below: `<app dir>`), e.g. next to the other Quarkus apps:

```
<app dir>/
├── start.sh                       loads an uploaded image file, starts database + app, health check
├── stop.sh                        stops database + app (the data stays)
├── backup.sh                      database dump into backups/
├── docker-compose.yml
├── .env                           database password (from env.example)
├── config/
│   ├── application.properties     settings of the app (from application.properties.example)
│   └── jwt.jwk                    JWT signing key
└── backups/
```

`config/` is mounted into the app container: Quarkus reads `config/application.properties` on top of its
built-in settings (`backend/src/main/resources/application.properties`), so everything set there wins.
After a change, run `./start.sh` again. The database lives in the Docker volume `shopping-list_db-data`.

## First setup

1. **Docker:** Docker Engine with the Compose plugin from Docker's apt repository
   (https://docs.docker.com/engine/install/ubuntu/), not the snap. `docker compose version` must work.
   Without `sudo`: add your user to the `docker` group (`sudo usermod -aG docker $USER`, log in again) -
   otherwise run the scripts with `sudo`.
2. **Upload** the files from `build/docker/` to `<app dir>`. If the scripts lost their executable bit on
   the way: `chmod +x *.sh`.
3. **`.env`:** `cp env.example .env`, set `DB_PASSWORD` to a long random string
   (`openssl rand -base64 32`), `chmod 600 .env`. Both containers use it; it never leaves the server.
4. **`config/application.properties`:** `mkdir config && cp application.properties.example config/application.properties`,
   then fill in `shoppinglist.public-base-url` (links in emails and invites) and `quarkus.mailer.password`
   (the Resend API key). The sender `noreply@mail.tobias-fassbender.com` must be verified in Resend.
5. **JWT key** - signs the login sessions; changing it logs everybody out:
   ```bash
   python3 -c "import secrets,base64,json; k=base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode(); print(json.dumps({'kty':'oct','use':'sig','alg':'HS256','k':k}))" > config/jwt.jwk
   ```
6. **Permissions:** the app runs as user and group 10001 in the container and only needs to read
   `config/`; you keep owning and editing the files:
   ```bash
   sudo chgrp -R 10001 config && chmod 750 config && chmod 640 config/*
   ```
7. **Start:** `./start.sh` - loads the image file (and deletes it afterwards), starts the database and the
   app and ends with `{"status":"UP","version":"1.0.0"}`. `docker compose logs app` shows
   "Profile prod activated" and the Flyway migrations.
8. **cloudflared:** add the hostname to the tunnel's ingress rules (in `config.yml` before the final
   catch-all rule, or in the Cloudflare dashboard for a remotely managed tunnel):
   ```yaml
   - hostname: shopping-list.tobias-fassbender.com
     service: http://localhost:4723
   ```
   then `cloudflared tunnel route dns <tunnel> shopping-list.tobias-fassbender.com` and restart cloudflared.
   Live updates (server-sent events) work through the tunnel; the app sends a heartbeat every 25 s, well
   below Cloudflare's 100 s idle timeout.
9. **Try it:** register on the public address - the verification email must arrive. Then the checks from
   `doc/offline_test_checklist.md`.
10. **Backups:** see below.

## Update to a new version

Build the image on the PC (`./gradlew dockerImage`), upload `shopping-list-<version>.tar.gz` to `<app dir>`
and run `./start.sh` there. It loads the new image and recreates the app container (Flyway migrates the
database at startup); `.env`, `config/` and the database stay. Users get the new web app on their next
visit (index.html and the service worker are never cached).

**Rollback** to an older version that is still loaded (`docker image ls shopping-list`):
`docker tag shopping-list:<old version> shopping-list:latest && ./start.sh`. A database migration of the
newer version is not undone by this - restore a backup if needed.

## Backups

`backup.sh` writes `backups/shoppinglist-<date>.sql.gz` (`pg_dump` of the running database) and keeps 14
days. Daily by cron (`crontab -e`):

```
15 3 * * * cd <app dir> && ./backup.sh >> backups/backup.log 2>&1
```

Copy the `backups/` folder off the server regularly (a backup on the same disk doesn't help if the disk
dies). **Restore** (replaces the current data):

```bash
gunzip -c backups/shoppinglist-2026-11-12.sql.gz | docker compose exec -T db psql -U shoppinglist -d shoppinglist
```

## Operation

- **Start / stop:** `./start.sh`, `./stop.sh` (the database volume stays; `docker compose down -v` would
  delete it).
- **Logs:** `docker compose logs -f app` (unexpected errors are logged with an error id, which the user
  sees in the error response).
- **Rate limits:** login (20 per 10 minutes), registration (10 per hour) and the email endpoints (5 per
  hour) are limited per client address (`AuthRateLimits`, Cloudflare's `CF-Connecting-IP`). Answer: 429.
- **Ports:** the app publishes only `127.0.0.1:4723` (`APP_PORT` in `.env` changes it), the database
  nothing. Ports published by Docker bypass `ufw`, which is why nothing is published publicly.

## Trying the stack locally

With Docker Desktop, in the project: `.env` and `config/` (both gitignored) as above, then
`APP_PORT=4732 docker compose up -d --build` → http://localhost:4732 (a port that doesn't collide with
`quarkusDev` on 4723). With a real Resend key, emails are really sent. Remove it again with
`docker compose down -v`.
