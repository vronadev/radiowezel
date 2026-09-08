import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { WebSocket } from "ws";
import { nextReconnectDelayMs } from "../../src/realtime/events.js";
import { RealtimeHub } from "../../src/services/realtimeHub.js";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { VoteController } from "../../src/controllers/voteController.js";
import type { QueueManager } from "../../src/services/queueManager.js";
import type { YoutubeMetadataService } from "../../src/services/youtubeMetadataService.js";
import type { IRealtimeHub } from "../../src/realtime/events.js";

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.once("message", (data) => resolve(String(data)));
  });
}

describe("realtime WebSocket hub", () => {
  let hub: RealtimeHub | undefined;
  let server: http.Server | undefined;
  let database: IDatabase | undefined;

  afterEach(async () => {
    hub?.close();
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
      if (!server) {
        resolve();
      }
    });
    database?.close();
    hub = undefined;
    server = undefined;
  });

  async function listen(): Promise<number> {
    hub = new RealtimeHub();
    server = http.createServer();
    hub.attach(server);
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("no port");
    }
    return address.port;
  }

  it("broadcasts events to every connected client", async () => {
    const port = await listen();
    const first = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const second = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([waitForOpen(first), waitForOpen(second)]);
    expect(hub?.clientCount()).toBe(2);
    const firstMsg = nextMessage(first);
    const secondMsg = nextMessage(second);
    hub?.publish({ event: "queue:updated", songId: "s1" });
    const parsed = JSON.parse(await firstMsg) as { event: string; songId: string; ts: string };
    expect(parsed.event).toBe("queue:updated");
    expect(parsed.songId).toBe("s1");
    expect(JSON.parse(await secondMsg).event).toBe("queue:updated");
    first.close();
    second.close();
  });

  it("reconnects a client after the socket drops and still receives later events", async () => {
    const port = await listen();
    const first = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await waitForOpen(first);
    first.close();
    await vi.waitFor(() => expect(hub?.clientCount()).toBe(0));
    const delay = nextReconnectDelayMs(0);
    expect(delay).toBe(500);
    expect(nextReconnectDelayMs(8)).toBe(10_000);
    const second = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await waitForOpen(second);
    const msg = nextMessage(second);
    hub?.publish({ event: "song:playing", songId: "song-1", title: "Track" });
    expect(JSON.parse(await msg).event).toBe("song:playing");
    second.close();
  });

  it("publishes votes:changed after a successful vote mutation without changing the HTTP body", async () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const userId = layer.userService.create("user@zsi.kielce.pl", "hash", false);
    const songId = layer.songService.createPending({
      title: "Song",
      author: "A",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    });
    layer.songService.updateStatus(songId, "verified");
    const realtime: IRealtimeHub = { publish: vi.fn(), clientCount: () => 0 };
    const body: { statusCode: number; payload: unknown } = { statusCode: 200, payload: undefined };
    const controller = new VoteController(
      layer.voteService,
      layer.songService,
      { refreshQueueFile: () => ({}) } as unknown as QueueManager,
      { fetchYouTubeMetadata: async () => null } as unknown as YoutubeMetadataService,
      layer.songRequestService,
      realtime,
    );
    await controller.vote(
      { user: { id: userId, isAdmin: false }, body: { songId } } as unknown as Request,
      {
        status(code: number) {
          body.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          body.payload = payload;
          return this;
        },
      } as unknown as Response,
    );
    expect(body.payload).toEqual({ success: true });
    expect(realtime.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event: "votes:changed", songId, title: "Song" }),
    );
  });
});
