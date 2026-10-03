![GitHub Release](https://img.shields.io/github/v/release/vronadev/radiowezel?style=flat-square)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/vronadev/radiowezel?style=flat-square)

# Radiowęzeł

School radio: students vote on tracks, the queue plays during configured breaks on open weekdays, and admins moderate requests from YouTube and YouTube Music. The UI is React (Vite); the backend is Express + SQLite and plays audio with `ffplay`.

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

### Admin password setup

Set `adminPasswordHash` in `backend/config.json` to a bcrypt hash generated locally. Log in using the original password, not the hash. The example configuration leaves this field empty; an omitted or empty hash skips bootstrap admin setup.

After installing the backend dependencies, run this in PowerShell from `backend/`. Enter your chosen password at the hidden prompt:

```powershell
$adminSecret = Read-Host "Admin password" -AsSecureString

try {
  $env:RADIO_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new(
    "",
    $adminSecret
  ).Password

  node -e "const bcrypt = require('bcryptjs'); const password = process.env.RADIO_ADMIN_PASSWORD; if (!password || Buffer.byteLength(password, 'utf8') > 72) { throw new Error('Password must contain 1 to 72 UTF-8 bytes'); } console.log(bcrypt.hashSync(password, 10));"
} finally {
  Remove-Item Env:RADIO_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable adminSecret
}
```

Copy the output into `adminPasswordHash`. Keep the actual configuration file private; do not put a real password or its hash into the shared example file.

To migrate an existing configuration:

1. Generate a bcrypt hash of your chosen admin password.
2. Add it as `adminPasswordHash` in `backend/config.json`.
3. Remove the old `adminPassword` property.
4. Restart the backend.

Configurations containing `adminPassword` stop startup with migration instructions. Non-string or malformed `adminPasswordHash` values are also rejected. These errors do not print the configured password or hash.

When both `adminEmail` and `adminPasswordHash` are set, startup creates the admin or updates the existing user's password hash and admin status. To change that password, generate and configure a new hash.

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

## Playback, queue, and voting

Breaks still come from `schedule.slots`. Which calendar days those breaks run on comes from `schedule.activeDays` (default Monday–Friday). A day with no checkmark in **Admin → Harmonogram → Dni odtwarzania** is closed: nothing plays, and estimates move to the next open day. An empty day list closes every day. The first time an admin saves that form, the chosen days are stored in SQLite and override `config.json` and `SCHEDULE_ACTIVE_DAYS` on later starts. Until that save, startup uses the config or env list, or Monday–Friday when neither is set.

Playlist rules for a day, in order:

- A one-off date replaces the cyclic weekday for that date.
- Several playlists on the same day play the union of their songs.
- With no schedule row, the single default playlist applies. With no default playlist, every verified song can play.

While a playlist is in effect, the player starts only songs from it. A voted song that is outside that set stays in the queue, keeps its place among the other deferred songs, and gets an estimate on the next later day that allows it (looked up for up to 21 days). If no later day allows it, the estimate is empty. A song that is on the day's playlist can play that day even when a deferred song sits ahead of it in the vote list. Inside the allowed set, order is current votes, then `voteTieBreakMode`.

Random fill still aims for `queue.randomFillSize` songs (default 10). Deferred votes do not count toward that fill. The random songs are taken from the playlist of the day the queue is being built for.

The queue file is rebuilt when someone votes, when a song ends, when a song is verified or its playlist membership changes, when the schedule is saved, when an admin calls `POST /api/queue/rebuild`, and once after the last slot when the next open day is a different date. Rebuilding leaves the current track running.

Queue screens show a clock time when the estimate is today, and a short weekday plus date when it falls on another day.

On **Głosowanie**, songs that already have votes in this cycle stay first (current votes, then the configured tie-break). Other songs you can vote for follow, ordered by lifetime votes, then title, artist, and id. Songs you cannot vote for stay last. Each card shows the lifetime total as gray `łącznie N` and the current-cycle count on the thumbs-up.

Each break can set `"volumePercentage": 0`–`100`. `ffplay` uses that value when a song starts in the slot. A missing or invalid value plays at 100%. A song that is already playing keeps the volume it started with; the next song picks up the slot that is active when it starts. There is no slot slider in the admin UI — set this in `config.json`.

**Zgłoszenia** (`/requests`) and the vote form accept a YouTube or YouTube Music link to a track (`youtube.com`, `music.youtube.com`, `youtu.be`, shorts, embed, live). Playlist-only links are rejected.

The browser API client waits 15 seconds. A timed-out request shows “Przekroczono czas oczekiwania” and can be retried.

These responses still return the old JSON, and they send `Deprecation: true`:

| Call | Use instead |
|---|---|
| `GET /api/queue/now-playing` | `GET /api/queue` (`nowPlaying` plus the queue) |
| `PATCH /api/admin/songs/:id/queue-votes` | `POST /api/vote` |
| `GET /api/admin/songs/:id/download-status` | `GET /api/admin/songs/download-queue` |
| `GET /api/effective-playlist` fields `playlistId` and `playlistName` | the `playlists` array on the same response (a day can have more than one) |

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
| `adminEmail` / `adminPasswordHash` | Configures the bootstrap admin using a bcrypt password hash. When both are set, startup creates the admin or updates the existing user's password hash and admin status. An omitted or empty hash skips bootstrap admin setup. |
| `schedule.slots` | Breaks as `{ "start": "HH:MM", "end": "HH:MM" }` in **container local time** (`TZ`). Optional `"volumePercentage": 0`–`100` (default 100 when omitted). Playback only runs inside these windows after the start bell offset and until the end bell offset, and only on an open day. |
| `schedule.activeDays` | Weekday names (`"monday"` … `"sunday"`, any case) or `Date#getDay()` numbers `0`–`6`. Names and numbers can be mixed. Default `["monday","tuesday","wednesday","thursday","friday"]`. `[]` closes every day. Overridable with `SCHEDULE_ACTIVE_DAYS` (comma-separated). After the first **Harmonogram** save, the SQLite value wins over both. |
| `schedule.bellStartOffsetSeconds` | Start music this many seconds **after** the slot `start` (opening bell window). Playback and queue ETAs use `start + bellStartOffsetSeconds`. Default `30`. Overridable with `BELL_START_OFFSET_SECONDS`. |
| `schedule.bellEndOffsetSeconds` | Stop music this many seconds **before** the slot `end` (closing bell window). Playback and queue ETAs use `end - bellEndOffsetSeconds`. Fade-out finishes at that instant. Default `30`. Overridable with `BELL_END_OFFSET_SECONDS`. |
| `schedule.fadeOutSecondsBeforeEnd` | Start the live fade this many seconds before music stop (`end - bellEndOffsetSeconds`). Fade ends at the music stop, not the calendar slot end. Overridable with `FADE_OUT_SECONDS_BEFORE_END`. |
| `voteTieBreakMode` | Equal-vote queue/library order. **Default `oldest_vote`**. Also `older_latest_vote` (earlier latest vote wins) or `newest_vote` (later latest vote wins, previous behaviour). Top-level field, next to `schedule` — not inside the slots list. Overridable with `VOTE_TIE_BREAK_MODE`. |
| `dataDir` / `songsDir` / `queueFilePath` | Local paths if you are **not** using Docker. Docker compose forces `/app/data` (and friends) via env. |
| `queue.randomMinRemaining` / `queue.randomFillSize` | Random backfill from that day's playlist. Voted songs that are deferred to a later day do not count toward the fill. Overridable with `QUEUE_RANDOM_*`. |
| `downloads.maxConcurrency` / `maxAttempts` / `retryDelayMs` | Background YouTube downloads. Overridable with `DOWNLOAD_*`. |
| `smtp` | `transport` (`smtp` or `sendmail`), `host`, `port`, `secure`, `user`, `pass`, `from`, `sendmailPath`. **`smtp`:** nodemailer connects to `host` with `user`/`pass` (default port **587**). **`sendmail`:** nodemailer pipes to `sendmailPath`; in Docker, msmtp uses the same `host`/`port`/`secure`/`from` with no login (default port **25**, default host `host.docker.internal` if unset). Set `port` / `SMTP_PORT` yourself if the mail server listens elsewhere. Without `host` (smtp mode) emails are skipped. Env: `SMTP_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SENDMAIL_PATH`. |
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
| `BELL_START_OFFSET_SECONDS` / `BELL_END_OFFSET_SECONDS` / `FADE_OUT_SECONDS_BEFORE_END` | Optional overrides of `config.json` schedule music offsets. |
| `SCHEDULE_ACTIVE_DAYS` | Optional override of `schedule.activeDays`, for example `monday,tuesday,wednesday,thursday,friday`. Ignored after an admin saves **Dni odtwarzania**. |
| `DOWNLOAD_MAX_CONCURRENCY` / `DOWNLOAD_MAX_ATTEMPTS` / `DOWNLOAD_RETRY_DELAY_MS` | Download worker limits. |
| `ALLOWED_EMAIL_DOMAIN` | Optional override of `allowedEmailDomain`. |
| `SMTP_*` | Optional overrides of `config.json` `smtp`. With `SMTP_TRANSPORT=sendmail`, `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_FROM` configure msmtp’s connection to the mail server (`SMTP_PORT` defaults to **25**; override for a non-standard submission port). `SMTP_USER` / `SMTP_PASS` are ignored. |
| `FRONTEND_DIR` | Unified image only: directory of the Vite `dist` (default `/app/public`). |

### `radiowezel-app/.env`

Used by `radiowezel-app/docker-compose.yml` (public Nginx UI). Not used by Vite `npm run dev` except that Compose interpolation reads this file when you `docker compose up` in that folder.

| Variable | Purpose |
|---|---|
| `BACKEND_HOST` | Backend LAN hostname or IPv4 only (no `http://`, no path). Example: `10.1.0.6`. Same Windows machine as Docker Desktop: `host.docker.internal` often works. |
| `BACKEND_PORT` | Backend listen port (usually `3001`). |
| `FRONTEND_PORT` | Host port published to Nginx (default `80`). |

Nginx substitutes `BACKEND_HOST` and `BACKEND_PORT` into `.docker/nginx/default.conf.template` at container start.
