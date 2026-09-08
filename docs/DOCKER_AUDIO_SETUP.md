# Docker audio setup (Windows host)

This backend plays MP3s with `ffplay`/`ffmpeg`. In Docker those processes run inside the container, so audio must be sent to a **PulseAudio server on the Windows host**. The container does not need speakers of its own.

Break slots and playlist day/date lookups use the **container local time**. Compose sets `TZ=Europe/Warsaw` by default so school hours match Poland, not UTC.

Reference tutorial: [Play Audio from Docker Container on Windows](https://www.youtube.com/watch?v=SF_WMBpQ0Qs).

## 1. PulseAudio on Windows

1. Download the PulseAudio Windows package: [http://bosmans.ch/pulseaudio/pulseaudio-1.1.zip](http://bosmans.ch/pulseaudio/pulseaudio-1.1.zip).
2. Extract it to a stable folder, for example `C:\pulseaudio` or `Downloads\pulseaudio-1.1`.
3. Open `etc/pulse/default.pa` in that extraction (not a copy under Program Files unless you extracted there).
4. Enable TCP native protocol access. Find the commented line `#load-module module-native-protocol-tcp` and **replace or add**:

```
load-module module-native-protocol-tcp listen=0.0.0.0 auth-anonymous=1
```

Do not leave the `#` in front of `load-module`. `listen=0.0.0.0` lets Docker reach the daemon; `auth-anonymous=1` matches the usual Windows-bridge setup from the video (LAN-exposed PulseAudio with anonymous auth — use only on a trusted machine).

5. Allow inbound TCP **4713** in Windows Defender Firewall if playback stays silent.

### 1a. One-off start (manual)

From the PulseAudio `bin` directory in PowerShell or CMD:

```bat
.\pulseaudio.exe --use-pid-file=false -D
```

Leave it running while the container plays audio. To stop it, end `pulseaudio.exe` in Task Manager or run `pulseaudio.exe --kill` from the same `bin` folder if that build supports it.

### 1b. Persistent Windows service (NSSM)

Use [NSSM](https://nssm.cc/download) so PulseAudio starts automatically at boot, **even before anyone logs in**.

1. Download NSSM from [https://nssm.cc/download](https://nssm.cc/download) and extract `nssm.exe` into the PulseAudio folder (for example `Downloads\pulseaudio-1.1` or `C:\pulseaudio`). Prefer the `win64` binary on 64-bit Windows.
2. Open **PowerShell or CMD as Administrator** and `cd` to that folder.
3. Create the service:

```powershell
.\nssm.exe install PulseAudioServer
```

4. In the NSSM window, set:

   | Field | Value |
   |---|---|
   | Path | full path to `pulseaudio.exe` (usually the `bin` subdirectory, e.g. `C:\pulseaudio\bin\pulseaudio.exe`) |
   | Startup directory | the `bin` directory that contains `pulseaudio.exe` |
   | Arguments | `--use-pid-file=false -D` |

5. On the **Details** tab, set a display name such as `PulseAudio Server`. On **Startup**, keep **Automatic** so Windows starts it at boot (before interactive logon).
6. Click **Install service**, then start it:

```powershell
.\nssm.exe start PulseAudioServer
```

Useful later:

```powershell
.\nssm.exe status PulseAudioServer
.\nssm.exe stop PulseAudioServer
.\nssm.exe edit PulseAudioServer
```

If the service shows as stopped right after start, PulseAudio may have daemonized away from NSSM. Edit the service, drop `-D` from the arguments (keep `--use-pid-file=false`), and start again so NSSM supervises the process.

## 2. Backend configuration

From the `backend` folder (paths below are relative to `backend/`):

1. Copy `config.example.json` to `config.json` and set `jwtSecret` (or set `JWT_SECRET` in `.env`).
2. Copy `.env.example` to `.env`. Keep:

```
TZ=Europe/Warsaw
PULSE_SERVER=tcp:host.docker.internal:4713
SDL_AUDIODRIVER=pulse
FFPLAY_PATH=/usr/bin/ffplay
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
FFMPEG_LOCATION=/usr/bin
```

`TZ` is passed into the container (`docker-compose.yml` defaults to `Europe/Warsaw` if it is omitted). Change it only if the radio should follow a different IANA timezone. Slot hours (`08:45`) and cyclic/one-off playlist days use this local time, not UTC.

`host.docker.internal` is the Windows host from Docker Desktop. Compose also adds `extra_hosts: host.docker.internal:host-gateway` for other Docker engines.

`PlayerFFMPEG` reads `PULSE_SERVER`, `FFPLAY_PATH`, and `FFMPEG_PATH` from the environment (via `loadConfig`) and passes `PULSE_SERVER` plus `SDL_AUDIODRIVER=pulse` into every `ffplay`/`ffmpeg` child process. There are no hardcoded Windows media paths in the player.

## 3. Run the container

The image is a **single-port** stack: Vite production assets, Express `/api`, and WebSocket `/ws`. Layout:

- Repo root `docker-compose.yml` — unified UI+API+player (`.docker/Dockerfile`). Compose currently publishes **host port 80**.
- `backend/docker-compose.yml` — player/API only (default **3001**)
- `radiowezel-app/docker-compose.yml` — public Nginx UI + `/api` `/ws` proxy

Each directory uses a file named `.env` (see `.env.example` next to it). From that folder:

```powershell
docker compose up --build
```

```powershell
cd <repo-root>
copy backend\config.example.json backend\config.json
copy backend\.env.example backend\.env
docker compose up --build
```

- One-host app: `http://localhost` / `http://127.0.0.1` (SPA + API). `GET /health` reports `phase: 6`.
- SQLite and downloaded songs persist in `backend/data` (`app.db`, `queue.json`, `songs/`).
- `backend/config.json` is mounted read-only at `/app/config.json`. Equal-vote order is `voteTieBreakMode` in that file (default `oldest_vote`); `VOTE_TIE_BREAK_MODE` in `.env` overrides it.
- Magic-link emails use `FRONTEND_ORIGIN` from `backend/.env`. CORS also allows localhost / `127.0.0.1` / `[::1]` on the same port as that origin.
- Confirm time inside the container with `docker compose exec backend date` — it should match Warsaw (or your `TZ`), not UTC.

The image is Debian Bookworm (`node:22-bookworm`). It installs `ffmpeg` (provides `ffmpeg`, `ffprobe`, `ffplay`), `tzdata`, PulseAudio client libraries, and the official `yt-dlp` binary.

## 4. Quick checks

| Check | Expected |
|---|---|
| PulseAudio running on Windows | `pulseaudio.exe` in Task Manager, or `nssm status PulseAudioServer` → `SERVICE_RUNNING` |
| `docker compose exec backend date` | local time in `TZ` (default Europe/Warsaw) |
| `docker compose exec backend ffplay -version` | version banner |
| `docker compose exec backend ffmpeg -version` | version banner |
| `docker compose exec backend ffprobe -version` | version banner |
| `docker compose exec backend yt-dlp --version` | version string |
| Song plays during a configured break | sound on the **host** speakers |

If the API works but there is no sound: confirm `default.pa` has the TCP module uncommented, the daemon was started with `--use-pid-file=false -D` (or the NSSM service is running), firewall allows 4713, and the container env shows `PULSE_SERVER=tcp:host.docker.internal:4713`.

If breaks fire at the wrong hour: confirm `TZ` in `.env` / compose and `docker compose exec backend date`.

## 5. Public frontend + LAN backend (split hosts)

Keep the root `docker-compose.yml` for a single machine. For production where the player stays on a private host and only the UI is public:

**Backend host** (not exposed to the internet): from `backend/`, `docker compose up --build`. Bind port 3001 to the LAN only. Set `FRONTEND_ORIGIN` to the **public** site URL (the origin browsers use). Loopback aliases are allowed automatically so `http://localhost` works alongside a LAN IP.

**Frontend host** (public):

```powershell
cd radiowezel-app
copy .env.example .env
```

Set `BACKEND_HOST` to the backend LAN IP or hostname (no `http://`). Then:

```powershell
docker compose up --build
```

Nginx (config in `.docker/nginx/`) serves the Vite `dist` and reverse-proxies `/api/` and `/ws` to that backend. Ports are published on `0.0.0.0` and IPv6 so `http://localhost` is not skipped when the browser uses `::1`.

If `http://<lan-ip>` works but `http://localhost` does not, another process (often IIS on Windows) is usually bound to `127.0.0.1:80`. Stop it, or set `FRONTEND_PORT=8080` and open `http://localhost:8080`.
