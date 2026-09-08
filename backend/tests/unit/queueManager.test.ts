import { afterEach, describe, expect, it, vi } from "vitest";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { QueueManager } from "../../src/services/queueManager.js";
import { SlotSchedule } from "../../src/services/slotSchedule.js";
import { CountingFileStore, FixedClock, MemoryFileStore, atLocalTime } from "../helpers/testDoubles.js";
import type { NowPlaying } from "../../src/@types/models.js";
import type { DataLayer } from "../../src/factories/dataLayerFactory.js";

describe("QueueManager", () => {
  let database: IDatabase | undefined;

  afterEach(() => {
    database?.close();
  });

  function setup(fileStore: MemoryFileStore = new MemoryFileStore()) {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    return { layer, fileStore };
  }

  function youtubeUrl(index: number): string {
    return `https://www.youtube.com/watch?v=${index.toString().padStart(11, "x")}`;
  }

  function addVerifiedSongs(
    layer: DataLayer,
    fileStore: MemoryFileStore,
    count: number,
    prefix: string,
    durationSeconds = 90,
  ): string[] {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const filePath = `/tmp/${prefix}-${index}.mp3`;
      fileStore.addSongFile(filePath);
      const id = layer.songService.createPending({
        title: `${prefix}${index}`,
        author: "A",
        coverUrl: null,
        youtubeUrl: youtubeUrl(index + prefix.length * 17),
      });
      layer.songService.markVerified(id, filePath, `${prefix}${index}`, "A", null, durationSeconds);
      ids.push(id);
    }
    return ids;
  }

  function createQueueManager(
    layer: DataLayer,
    fileStore: MemoryFileStore,
    options: {
      clock?: FixedClock;
      slots?: Array<{ start: string; end: string }>;
      random?: () => number;
      randomMinRemaining?: number;
      randomFillSize?: number;
    } = {},
  ): QueueManager {
    const clock = options.clock ?? new FixedClock(atLocalTime(12, 0));
    return new QueueManager({
      songService: layer.songService,
      voteService: layer.voteService,
      playlistService: layer.playlistService,
      slotSchedule: new SlotSchedule(options.slots ?? [], clock),
      queueFilePath: "/tmp/queue.json",
      fileStore,
      clock,
      random: options.random ?? (() => 0),
      randomMinRemaining: options.randomMinRemaining,
      randomFillSize: options.randomFillSize,
    });
  }

  it("orders voted songs first and fills the rest from the playable pool", () => {
    const { layer, fileStore } = setup();
    const ids = addVerifiedSongs(layer, fileStore, 3, "ord");
    const userId = layer.userService.create("user@zsi.kielce.pl", "hash", false);
    layer.voteService.addVote(userId, ids[0]!);

    const queueManager = createQueueManager(layer, fileStore);
    expect(queueManager.getEffectiveVotableSongIds().sort()).toEqual([...ids].sort());
    const built = queueManager.buildFullQueue();
    expect(built.queue[0]?.songId).toBe(ids[0]);
    expect(built.queue[0]?.votes).toBe(1);
    expect(built.queue.map((item) => item.songId)).toEqual(expect.arrayContaining(ids));
  });

  it("restricts votable songs to the effective playlist and exclusions", () => {
    const { layer, fileStore } = setup();
    const openPath = "/tmp/open.mp3";
    const hiddenPath = "/tmp/hidden.mp3";
    fileStore.addSongFile(openPath);
    fileStore.addSongFile(hiddenPath);

    const openId = layer.songService.createPending({
      title: "Open",
      author: "A",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    });
    const hiddenId = layer.songService.createPending({
      title: "Hidden",
      author: "B",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=bbbbbbbbbbb",
    });
    layer.songService.markVerified(openId, openPath, "Open", "A", null, 90);
    layer.songService.markVerified(hiddenId, hiddenPath, "Hidden", "B", null, 90);

    const hiddenPlaylist = layer.playlistService.create("Hidden", null);
    layer.playlistService.update(hiddenPlaylist, { excludeFromVoting: true });
    layer.playlistService.addSong(hiddenPlaylist, hiddenId, "manual");

    const queueManager = createQueueManager(layer, fileStore);
    expect(queueManager.getEffectiveVotableSongIds()).toEqual([openId]);

    const playlist = layer.playlistService.create("Active", null);
    layer.playlistService.addSong(playlist, hiddenId, "manual");
    layer.settingsService.setActivePlaylistId(playlist);
    expect(queueManager.getEffectiveVotableSongIds()).toEqual([hiddenId]);
    expect(queueManager.getAllowedSongIds()).toEqual([hiddenId]);
  });

  it("does not write queue.json across sequential GET polls", () => {
    const fileStore = new CountingFileStore();
    const { layer } = setup(fileStore);
    addVerifiedSongs(layer, fileStore, 12, "poll");
    const queueManager = createQueueManager(layer, fileStore, { randomMinRemaining: 10, randomFillSize: 10 });
    queueManager.refreshQueueFile();
    const writesAfterSeed = fileStore.writes;
    const snapshot = fileStore.readFile("/tmp/queue.json");

    const first = queueManager.getQueuePayload(null);
    const second = queueManager.getQueuePayload(null);
    const third = queueManager.getQueuePayload(null);

    expect(fileStore.writes).toBe(writesAfterSeed);
    expect(fileStore.readFile("/tmp/queue.json")).toBe(snapshot);
    expect(second.queue.map((item) => item.songId)).toEqual(first.queue.map((item) => item.songId));
    expect(third.queue.map((item) => item.songId)).toEqual(first.queue.map((item) => item.songId));
  });

  it("keeps a short random tail stable on GET even when it is below the fill target", () => {
    const fileStore = new CountingFileStore();
    const { layer } = setup(fileStore);
    const ids = addVerifiedSongs(layer, fileStore, 15, "short");
    const userId = layer.userService.create("user@zsi.kielce.pl", "hash", false);
    for (const id of ids.slice(0, 9)) {
      layer.voteService.addVote(userId, id);
    }

    const queueManager = createQueueManager(layer, fileStore, { randomMinRemaining: 10, randomFillSize: 10 });
    queueManager.writeQueueFile({
      nowPlaying: null,
      queue: [
        ...ids.slice(0, 9).map((songId, index) => ({
          id: `q-${songId}`,
          songId,
          title: `short${index}`,
          author: "A",
          coverUrl: null,
          votes: 1,
          position: index + 1,
          estimatedPlayAt: null,
          durationSeconds: 90,
        })),
        {
          id: `r-${ids[9]}`,
          songId: ids[9]!,
          title: "short9",
          author: "A",
          coverUrl: null,
          votes: 0,
          position: 10,
          estimatedPlayAt: null,
          durationSeconds: 90,
        },
      ],
      updatedAt: null,
      randomFillOrder: [ids[9]!],
    });
    const writesAfterSeed = fileStore.writes;
    const snapshot = fileStore.readFile("/tmp/queue.json");

    const payload = queueManager.getQueuePayload(null);
    expect(fileStore.writes).toBe(writesAfterSeed);
    expect(fileStore.readFile("/tmp/queue.json")).toBe(snapshot);
    expect(payload.queue.filter((item) => item.votes > 0)).toHaveLength(9);
    expect(payload.queue.filter((item) => item.votes === 0).map((item) => item.songId)).toEqual([ids[9]]);
  });

  it("appends random songs up to the fill size without reshuffling the existing tail", () => {
    const { layer, fileStore } = setup();
    const ids = addVerifiedSongs(layer, fileStore, 20, "tail");
    const userId = layer.userService.create("user@zsi.kielce.pl", "hash", false);
    for (const id of ids.slice(0, 9)) {
      layer.voteService.addVote(userId, id);
    }

    const queueManager = createQueueManager(layer, fileStore, {
      random: () => 0.1,
      randomMinRemaining: 10,
      randomFillSize: 10,
    });
    queueManager.writeQueueFile({
      nowPlaying: null,
      queue: [],
      updatedAt: null,
      randomFillOrder: [ids[9]!],
    });

    const built = queueManager.buildFullQueue();
    const randomTail = built.queue.filter((item) => item.votes === 0).map((item) => item.songId);
    const votedHead = built.queue.filter((item) => item.votes > 0).map((item) => item.songId);
    expect(votedHead.sort()).toEqual([...ids.slice(0, 9)].sort());
    expect(randomTail[0]).toBe(ids[9]);
    expect(randomTail).toHaveLength(10);
    expect(new Set(randomTail).size).toBe(10);
    expect(built.data.randomFillOrder?.[0]).toBe(ids[9]);
  });

  it("computes ETAs from remaining playback in the current break", () => {
    const { layer, fileStore } = setup();
    addVerifiedSongs(layer, fileStore, 1, "eta");
    const clock = new FixedClock(atLocalTime(8, 46));
    const queueManager = createQueueManager(layer, fileStore, {
      clock,
      slots: [{ start: "08:45", end: "08:50" }],
    });
    queueManager.refreshQueueFile();

    const payload = queueManager.getQueuePayload(null);
    expect(payload.schedule.inBreak).toBe(true);
    expect(payload.schedule.currentSlot).toEqual({ start: "08:45", end: "08:50" });
    expect(localTime(payload.queue[0]?.estimatedPlayAt)).toEqual({ hours: 8, minutes: 46, seconds: 0 });
  });

  it("does not double-count the playing song when it is still stored in queue.json", () => {
    const { layer, fileStore } = setup();
    const ids = addVerifiedSongs(layer, fileStore, 3, "now");
    const clock = new FixedClock(atLocalTime(8, 46));
    const queueManager = createQueueManager(layer, fileStore, {
      clock,
      slots: [
        { start: "08:45", end: "08:50" },
        { start: "11:15", end: "11:30" },
      ],
      randomMinRemaining: 3,
      randomFillSize: 3,
    });
    queueManager.refreshQueueFile();
    const persisted = queueManager.readQueueFile();
    expect(persisted.queue[0]?.songId).toBeDefined();

    const nowPlaying: NowPlaying = {
      ...(persisted.queue[0] as NowPlaying),
      startedAt: atLocalTime(8, 45, 20).toISOString(),
      durationSeconds: 60,
    };
    const payload = queueManager.getQueuePayload(nowPlaying);
    expect(payload.queue.map((item) => item.songId)).not.toContain(nowPlaying.songId);
    expect(localTime(payload.queue[0]?.estimatedPlayAt)).toEqual({ hours: 8, minutes: 46, seconds: 20 });
    expect(localTime(payload.queue[1]?.estimatedPlayAt)).toEqual({ hours: 8, minutes: 47, seconds: 50 });
  });

  it("chains ETAs across slot boundaries instead of snapping every overflow song to the next slot start", () => {
    const { layer, fileStore } = setup();
    addVerifiedSongs(layer, fileStore, 6, "slot");
    const clock = new FixedClock(atLocalTime(8, 46));
    const queueManager = createQueueManager(layer, fileStore, {
      clock,
      slots: [
        { start: "08:45", end: "08:50" },
        { start: "11:15", end: "11:30" },
      ],
      randomMinRemaining: 6,
      randomFillSize: 6,
    });
    queueManager.refreshQueueFile();

    const nowPlaying: NowPlaying = {
      id: "now",
      songId: "now-song",
      title: "Now",
      author: "A",
      coverUrl: null,
      votes: 0,
      position: 1,
      estimatedPlayAt: null,
      durationSeconds: 60,
      startedAt: atLocalTime(8, 45, 20).toISOString(),
    };
    const payload = queueManager.getQueuePayload(nowPlaying);
    expect(localTime(payload.queue[0]?.estimatedPlayAt)).toEqual({ hours: 8, minutes: 46, seconds: 20 });
    expect(localTime(payload.queue[1]?.estimatedPlayAt)).toEqual({ hours: 8, minutes: 47, seconds: 50 });
    expect(localTime(payload.queue[2]?.estimatedPlayAt)).toEqual({ hours: 8, minutes: 49, seconds: 20 });
    expect(localTime(payload.queue[3]?.estimatedPlayAt)).toEqual({ hours: 11, minutes: 15, seconds: 0 });
    expect(localTime(payload.queue[4]?.estimatedPlayAt)).toEqual({ hours: 11, minutes: 16, seconds: 30 });
  });

  it("chains evening-slot overflow into the next morning break instead of batch-resetting to 07:30", () => {
    const { layer, fileStore } = setup();
    addVerifiedSongs(layer, fileStore, 6, "eve", 180);
    const clock = new FixedClock(atLocalTime(22, 50));
    const queueManager = createQueueManager(layer, fileStore, {
      clock,
      slots: [
        { start: "07:30", end: "08:00" },
        { start: "20:20", end: "23:04" },
      ],
      randomMinRemaining: 6,
      randomFillSize: 6,
    });
    queueManager.refreshQueueFile();
    const payload = queueManager.getQueuePayload(null);
    expect(localTime(payload.queue[0]?.estimatedPlayAt)).toEqual({ hours: 22, minutes: 50, seconds: 0 });
    expect(localTime(payload.queue[1]?.estimatedPlayAt)).toEqual({ hours: 22, minutes: 53, seconds: 0 });
    expect(localTime(payload.queue[4]?.estimatedPlayAt)).toEqual({ hours: 23, minutes: 2, seconds: 0 });
    expect(localTime(payload.queue[5]?.estimatedPlayAt)).toEqual({ hours: 7, minutes: 30, seconds: 0 });
    expect(new Date(payload.queue[5]!.estimatedPlayAt!).getDate()).toBe(clock.now().getDate() + 1);
  });

  it("never duplicates songs and stays short when the library is smaller than the fill target", () => {
    const { layer, fileStore } = setup();
    const ids = addVerifiedSongs(layer, fileStore, 3, "tiny");
    const queueManager = createQueueManager(layer, fileStore, {
      randomMinRemaining: 10,
      randomFillSize: 10,
    });
    queueManager.writeQueueFile({
      nowPlaying: null,
      queue: [],
      updatedAt: null,
      randomFillOrder: [ids[0]!, ids[0]!, ids[1]!],
    });

    const built = queueManager.buildFullQueue();
    const songIds = built.queue.map((item) => item.songId);
    expect(songIds).toHaveLength(3);
    expect(new Set(songIds).size).toBe(3);
    expect(built.data.randomFillOrder).toEqual(expect.arrayContaining(ids));
    expect(new Set(built.data.randomFillOrder).size).toBe(built.data.randomFillOrder?.length);
  });
});

function localTime(iso: string | null | undefined): { hours: number; minutes: number; seconds: number } {
  expect(iso).toBeTruthy();
  const date = new Date(iso!);
  return { hours: date.getHours(), minutes: date.getMinutes(), seconds: date.getSeconds() };
}
