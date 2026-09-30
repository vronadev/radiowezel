import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { PlayController } from "../../src/controllers/playController.js";
import { createPublicPlayRouter } from "../../src/routes/play.routes.js";

describe("public play history", () => {
  const servers: Array<ReturnType<typeof createServer>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it("returns recent plays without authentication", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "public-plays-"));
    fs.writeFileSync(
      path.join(dir, "played-songs.log"),
      `${JSON.stringify({
        ts: new Date().toISOString(),
        event: "song_started",
        songId: "song-1",
        title: "Public",
        author: "Radio",
        startedAt: new Date().toISOString(),
        durationSeconds: 90,
      })}\n`,
    );
    const app = express();
    app.use("/api/public", createPublicPlayRouter(new PlayController(dir)));
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/api/public/plays`);
    const body = (await response.json()) as { plays: Array<{ songId: string; title: string }> };

    expect(response.status).toBe(200);
    expect(body.plays.map((play) => play.songId)).toEqual(["song-1"]);
    expect(body.plays[0]?.title).toBe("Public");
  });
});
