# syntax=docker/dockerfile:1

FROM node:22-bookworm AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    tzdata \
    alsa-utils \
    libasound2-plugins \
    libpulse0 \
    libsdl2-2.0-0 \
    pulseaudio-utils \
  && curl -fsSL -o /usr/local/bin/yt-dlp \
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && ffmpeg -version \
  && ffprobe -version \
  && ffplay -version \
  && yt-dlp --version \
  && rm -rf /var/lib/apt/lists/*

RUN echo 'pcm.!default { type pulse } \nctl.!default { type pulse }' > /etc/asound.conf

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY config.example.json ./

ENV NODE_ENV=production \
    TZ=Europe/Warsaw \
    PORT=3001 \
    DATA_DIR=/app/data \
    SONGS_DIR=/app/data/songs \
    QUEUE_FILE_PATH=/app/data/queue.json \
    DB_PATH=/app/data/app.db \
    FFPLAY_PATH=/usr/bin/ffplay \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    FFMPEG_LOCATION=/usr/bin \
    PULSE_SERVER=tcp:host.docker.internal:4713 \
    SDL_AUDIODRIVER=pulse

EXPOSE 3001
CMD ["node", "dist/server.js"]
