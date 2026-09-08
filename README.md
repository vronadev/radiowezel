# Radiowęzeł

School radio: students vote on tracks, the queue plays only during configured breaks, and admins moderate requests. The UI is React (Vite); the backend is Express + SQLite and plays audio with `ffplay`.

## Layout

| Path | Role |
|---|---|
| `docker-compose.yml` | One-host stack: UI + API + player in one container |
| `.docker/Dockerfile` | Build recipe for that unified image |
| `backend/` | Player/API (`Dockerfile`, `docker-compose.yml`, `config.json`, `.env`) |
| `radiowezel-app/` | Public UI + Nginx reverse proxy (`Dockerfile`, `docker-compose.yml`, `.env`) |
| `radiowezel-app/.docker/nginx/` | Nginx template (`/api/` and `/ws` → LAN backend) |
| `docs/DOCKER_AUDIO_SETUP.md` | Windows host PulseAudio (required for Docker playback) |

Each compose file reads a local `.env` (Compose’s default). From that folder you can run `docker compose up --build` with no extra `--env-file` flags.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop on Windows)
- For **one-host** or **backend-host** Docker playback on Windows: PulseAudio on the host, TCP `4713`, and `PULSE_SERVER=tcp:host.docker.internal:4713`. Follow **[docs/DOCKER_AUDIO_SETUP.md](docs/DOCKER_AUDIO_SETUP.md)** before you expect sound. The container has `ffmpeg` / `ffplay` / `yt-dlp`; the host needs PulseAudio (and a firewall hole for 4713 if playback is silent).
- Optional local development: Node.js 18+ on the machine that runs `npm run dev`.

Copy config before the first run:

```powershell
copy backend\config.example.json backend\config.json
copy backend\.env.example backend\.env
copy radiowezel-app\.env.example radiowezel-app\.env
```

Set `JWT_SECRET` in `backend/.env` (or `jwtSecret` in `config.json`). Edit `config.json` (breaks, admin, SMTP). Point `FRONTEND_ORIGIN` at the URL browsers actually use.

---

## Option A — one host (UI + API + player)

From the **repository root**:

```powershell
docker compose up --build
```

Compose uses `backend/.env` and mounts `backend/config.json` and `backend/data/`. By default the app is published on **host port 80** (see `PORT` in the root compose file). Open `http://localhost` or `http://127.0.0.1`. `GET /health` should return `"phase": 6`.

PulseAudio must already be running on Windows ([docs/DOCKER_AUDIO_SETUP.md](docs/DOCKER_AUDIO_SETUP.md)). Confirm time inside the container with `docker compose exec backend date` (should match `TZ`, default `Europe/Warsaw`).

---

## Option B — split hosts (public frontend, LAN backend)

**Backend machine** (LAN only, not on the public internet), from `backend/`:

```powershell
docker compose up --build
```

Listens on **3001** by default (`PORT` in `backend/.env`). Set `FRONTEND_ORIGIN` to the **public** site origin (the `https://…` URL users type), not the backend IP.

**Frontend machine** (public or behind another proxy), from `radiowezel-app/`:

```powershell
docker compose up --build
```

Set `BACKEND_HOST` to the backend LAN hostname or IPv4 (no `http://`) and `BACKEND_PORT` (usually `3001`). Nginx serves the Vite build and proxies `/api/` and `/ws` to that backend. Default UI port is **80** (`FRONTEND_PORT`).

If `http://<lan-ip>` works but `http://localhost` does not, another process (often IIS) may own `127.0.0.1:80`, or the browser is using IPv6; try `http://127.0.0.1` or set `FRONTEND_PORT=8080`.

---

## Option C — local development (no Docker)

Backend:

```powershell
cd backend
npm install
npm run dev
```

API: `http://localhost:3001`. You still need `yt-dlp`, `ffmpeg`, `ffprobe`, and `ffplay` on PATH (or `FFMPEG_LOCATION` / `config.json` `ffmpegLocation`).

Frontend:

```powershell
cd radiowezel-app
npm install
npm run dev
```

Vite: `http://localhost:5173`, proxy `/api` and `/ws` to port 3001. Set `FRONTEND_ORIGIN=http://localhost:5173` in `backend/.env`.

---

## HTTPS in production (Nginx Proxy Manager)

TLS terminates in front of the LAN. A working path looks like this:

1. **Browser** → `https://radio.vrona.dev` (DNS A/AAAA record to Nginx Proxy Manager).
2. **NPM** proxies that vhost (HTTP + **WebSocket**) to the frontend container: `http://10.1.0.5:80`.
3. **Frontend Nginx** (this repo’s `radiowezel-app` compose) serves the SPA and reverse-proxies `/api/` and `/ws` to the player: `http://10.1.0.6:3001`.

The browser only talks to the HTTPS hostname. It never opens `10.1.0.6:3001`. Cookies stay same-site on `radio.vrona.dev`. Set `FRONTEND_ORIGIN=https://radio.vrona.dev` on the backend (comma-separated extras allowed; `localhost` / `127.0.0.1` / `[::1]` on the same port are added automatically). In NPM, enable WebSocket support for `/ws` or the live queue will fall back to slower HTTP polling.

---

## Configuration reference

Environment variables override the same keys in `config.json` when both are set. Do not commit real `.env` or `config.json` secrets.

### `backend/config.json`

Copy from `backend/config.example.json`. Used for school-specific settings that are awkward as env vars.

| Field | Purpose |
|---|---|
| `jwtSecret` | Signing secret for auth cookies. Required here **or** as `JWT_SECRET`. Use a long random string in production. |
| `allowedEmailDomain` | Email domain allowed to register / magic-link (e.g. `zsi.kielce.pl`). Overridable with `ALLOWED_EMAIL_DOMAIN`. |
| `adminEmails` | Addresses that get the admin UI. |
| `adminEmail` / `adminPassword` | Bootstrap admin created on first start if that user does not exist. Changing the password later is a database update, not a restart. |
| `schedule.slots` | Breaks as `{ "start": "HH:MM", "end": "HH:MM" }` in **container local time** (`TZ`). Playback only runs inside these windows. |
| `schedule.bellOffsetSeconds` | Stop music this many seconds **before** the slot `end` (bell window). Playback and queue ETAs use `end - bellOffsetSeconds`. Fade-out finishes at that instant. |
| `schedule.fadeOutSecondsBeforeEnd` | Start the live fade this many seconds before music stop (`end - bellOffsetSeconds`). Fade ends at the music stop, not the calendar slot end. |
| `voteTieBreakMode` | Equal-vote queue/library order. **Default `oldest_vote`**. Also `older_latest_vote` (earlier latest vote wins) or `newest_vote` (later latest vote wins, previous behaviour). Top-level field, next to `schedule` — not inside the slots list. Overridable with `VOTE_TIE_BREAK_MODE`. |
| `dataDir` / `songsDir` / `queueFilePath` | Local paths if you are **not** using Docker. Docker compose forces `/app/data` (and friends) via env. |
| `queue.randomMinRemaining` / `queue.randomFillSize` | Random backfill of the play queue (votes always win). Overridable with `QUEUE_RANDOM_*`. |
| `downloads.maxConcurrency` / `maxAttempts` / `retryDelayMs` | Background YouTube downloads. Overridable with `DOWNLOAD_*`. |
| `smtp` | `host`, `port`, `secure`, `user`, `pass`, `from`. Without SMTP, magic-link and approval emails are not sent. Overridable with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. |
| `ffmpegLocation` | Directory containing ffmpeg on a **non-Docker** Windows install. Docker images set `FFMPEG_LOCATION=/usr/bin`. |
| `playerKey` | Optional extra player auth key (`PLAYER_KEY` env). |

### `backend/.env`

Used by `backend/docker-compose.yml` and by the root one-host compose (`env_file: backend/.env`). Also loaded by `npm run dev` via dotenv.

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Required if `jwtSecret` is not in `config.json`. |
| `FRONTEND_ORIGIN` | Public origin for CORS and magic-link URLs. Comma-separated list allowed. Example (HTTPS split): `https://radio.vrona.dev`. Local Vite: `http://localhost:5173`. One-host HTTP: `http://localhost` or `http://localhost:80`. |
| `PORT` | Port the Node process listens on. **Backend-only compose:** default **3001** (published `3001:3001`). **One-host compose:** compose currently sets listen/publish to **80** unless you change that file. |
| `TZ` | IANA timezone for breaks and playlist calendar. Default `Europe/Warsaw`. |
| `PULSE_SERVER` | Docker → Windows PulseAudio. Default `tcp:host.docker.internal:4713`. See [docs/DOCKER_AUDIO_SETUP.md](docs/DOCKER_AUDIO_SETUP.md). |
| `SDL_AUDIODRIVER` | Keep `pulse` in Docker. |
| `FFPLAY_PATH` / `FFMPEG_PATH` / `FFPROBE_PATH` / `FFMPEG_LOCATION` | Media binaries. Docker defaults `/usr/bin/...`. |
| `DATA_DIR` / `SONGS_DIR` / `QUEUE_FILE_PATH` / `DB_PATH` | Inside the container these should stay `/app/data` (volume `backend/data`). |
| `QUEUE_RANDOM_MIN_REMAINING` / `QUEUE_RANDOM_FILL_SIZE` | Random queue backfill. |
| `VOTE_TIE_BREAK_MODE` | Optional override of `config.json` `voteTieBreakMode`. |
| `DOWNLOAD_MAX_CONCURRENCY` / `DOWNLOAD_MAX_ATTEMPTS` / `DOWNLOAD_RETRY_DELAY_MS` | Download worker limits. |
| `ALLOWED_EMAIL_DOMAIN` | Optional override of `allowedEmailDomain`. |
| `SMTP_*` | Optional overrides of `config.json` `smtp`. |
| `FRONTEND_DIR` | Unified image only: directory of the Vite `dist` (default `/app/public`). |

### `radiowezel-app/.env`

Used by `radiowezel-app/docker-compose.yml` (public Nginx UI). Not used by Vite `npm run dev` except that Compose interpolation reads this file when you `docker compose up` in that folder.

| Variable | Purpose |
|---|---|
| `BACKEND_HOST` | Backend LAN hostname or IPv4 only (no `http://`, no path). Example: `10.1.0.6`. Same Windows machine as Docker Desktop: `host.docker.internal` often works. |
| `BACKEND_PORT` | Backend listen port (usually `3001`). |
| `FRONTEND_PORT` | Host port published to Nginx (default `80`). |

Nginx substitutes `BACKEND_HOST` and `BACKEND_PORT` into `.docker/nginx/default.conf.template` at container start.
