import path from "node:path";
import type {
  BuiltQueue,
  NowPlaying,
  QueueFileData,
  QueueItem,
  QueuePayload,
  Song,
  VoteCount,
} from "../@types/models.js";
import {
  DEFAULT_QUEUE_RANDOM_FILL_SIZE,
  DEFAULT_QUEUE_RANDOM_MIN_REMAINING,
} from "../constants/queueFill.js";
import type { IClock } from "../interfaces/IClock.js";
import type { IFileStore } from "../interfaces/IFileStore.js";
import { NodeFileStore } from "./nodeFileStore.js";
import type { PlaylistService } from "./playlistService.js";
import type { SlotSchedule } from "./slotSchedule.js";
import type { SongService } from "./songService.js";
import { SystemClock } from "./systemClock.js";
import type { VoteService } from "./voteService.js";
import { compareTiedVoteSongs, resolveVoteTieBreakMode, type VoteTieBreakMode } from "../config/voteTieBreak.js";

const EMPTY_QUEUE_FILE: QueueFileData = { nowPlaying: null, queue: [], updatedAt: null };

export interface QueueManagerOptions {
  songService: SongService;
  voteService: VoteService;
  playlistService: PlaylistService;
  slotSchedule: SlotSchedule;
  queueFilePath: string;
  fileStore?: IFileStore;
  clock?: IClock;
  random?: () => number;
  randomMinRemaining?: number;
  randomFillSize?: number;
  voteTieBreakMode?: VoteTieBreakMode;
  onMutated?: () => void;
}

export class QueueManager {
  private readonly songService: SongService;
  private readonly voteService: VoteService;
  private readonly playlistService: PlaylistService;
  private readonly slotSchedule: SlotSchedule;
  private readonly queueFilePath: string;
  private readonly fileStore: IFileStore;
  private readonly clock: IClock;
  private readonly random: () => number;
  private readonly randomMinRemaining: number;
  private readonly randomFillSize: number;
  private readonly voteTieBreakMode: VoteTieBreakMode;
  private readonly onMutated?: () => void;
  private readOnlyDepth = 0;

  constructor(options: QueueManagerOptions) {
    this.songService = options.songService;
    this.voteService = options.voteService;
    this.playlistService = options.playlistService;
    this.slotSchedule = options.slotSchedule;
    this.queueFilePath = options.queueFilePath;
    this.fileStore = options.fileStore ?? new NodeFileStore();
    this.clock = options.clock ?? new SystemClock();
    this.random = options.random ?? Math.random;
    const fillSize = options.randomFillSize ?? DEFAULT_QUEUE_RANDOM_FILL_SIZE;
    const minRemaining = options.randomMinRemaining ?? DEFAULT_QUEUE_RANDOM_MIN_REMAINING;
    this.randomFillSize = Math.max(1, fillSize);
    this.randomMinRemaining = Math.min(this.randomFillSize, Math.max(1, minRemaining));
    this.voteTieBreakMode = resolveVoteTieBreakMode(options.voteTieBreakMode);
    this.onMutated = options.onMutated;
  }

  getEffectiveVotableSongIds(): string[] {
    return this.songService.getVotableSongIds();
  }

  getAllowedSongIds(): string[] | null {
    return this.playlistService.getAllowedSongIds();
  }

  readQueueFile(): QueueFileData {
    try {
      return JSON.parse(this.fileStore.readFile(this.queueFilePath)) as QueueFileData;
    } catch {
      return { ...EMPTY_QUEUE_FILE };
    }
  }

  writeQueueFile(data: QueueFileData): void {
    if (this.readOnlyDepth > 0) {
      throw new Error("Refusing to write queue.json during a read-only queue request");
    }
    this.fileStore.mkdirp(path.dirname(this.queueFilePath));
    this.fileStore.writeFile(
      this.queueFilePath,
      JSON.stringify({ ...data, updatedAt: this.clock.now().toISOString() }, null, 2),
    );
    this.onMutated?.();
  }

  buildQueueFromVotes(
    votesBySongId: Record<string, VoteCount>,
    songsById: Record<string, Song>,
    maxItems = 10,
    allowedSongIds: string[] | Set<string> | null = null,
    tieBreakMode?: VoteTieBreakMode,
  ): QueueItem[] {
    const allowed = allowedSongIds
      ? allowedSongIds instanceof Set
        ? allowedSongIds
        : new Set(allowedSongIds)
      : null;
    const mode = resolveVoteTieBreakMode(tieBreakMode, this.voteTieBreakMode);
    const sorted = Object.entries(votesBySongId)
      .map(([songId, data]) => ({
        songId,
        votes: data.count,
        firstVoteAt: data.firstVoteAt || "",
        lastVoteAt: data.lastVoteAt || "",
      }))
      .filter((entry) => this.isPlayableSong(songsById[entry.songId], allowed))
      .sort((left, right) => {
        if (right.votes !== left.votes) {
          return right.votes - left.votes;
        }
        return compareTiedVoteSongs(left, right, mode);
      })
      .slice(0, maxItems);

    return sorted.map((entry, index) => this.toQueueItem(songsById[entry.songId], entry.votes, index, "q"));
  }

  buildRandomQueue(songsById: Record<string, Song>, allowedSongIds: string[] | Set<string> | null, maxItems = 10): QueueItem[] {
    const allowed = allowedSongIds
      ? allowedSongIds instanceof Set
        ? allowedSongIds
        : new Set(allowedSongIds)
      : null;
    const pool = Object.values(songsById).filter((song) => this.isPlayableSong(song, allowed));
    return this.shuffle(pool)
      .slice(0, maxItems)
      .map((song, index) => this.toQueueItem(song, 0, index, "r"));
  }

  computeQueueETAs(queue: QueueItem[], nowPlaying: NowPlaying | null): QueueItem[] {
    if (!queue.length) {
      return queue;
    }
    const now = this.clock.now();
    let cursor = this.initialEtaCursor(now, nowPlaying);
    const out: QueueItem[] = [];
    for (const item of queue) {
      cursor = this.slotSchedule.nextPlayableInstant(cursor);
      const copy = { ...item, estimatedPlayAt: cursor.toISOString() };
      cursor = new Date(cursor.getTime() + (copy.durationSeconds || 180) * 1000);
      out.push(copy);
    }
    return out;
  }

  buildFullQueue(justPlayedSongId: string | null = null): BuiltQueue {
    const slots = this.slotSchedule.getSlots();
    const votesBySong = this.voteService.getVotesBySong();
    const songsById = this.songService.getSongsById();
    const effectivePlaylistId = this.playlistService.getEffectivePlaylistId();
    const allowedSongIds = this.playlistService.getSongIdsInPlaylist(effectivePlaylistId);
    const excludedFromRandom = this.playlistService.getSongIdsExcludedFromRandom(effectivePlaylistId);
    const votedQueue = this.buildQueueFromVotes(votesBySong, songsById, 20, allowedSongIds);
    const votedIds = new Set(votedQueue.map((item) => item.songId));
    const data = this.readQueueFile();
    const allowedSet = allowedSongIds ? new Set(allowedSongIds) : null;
    const pool = Object.values(songsById).filter(
      (song) => this.isPlayableSong(song, allowedSet) && !excludedFromRandom.has(song.id),
    );

    const previousOrder = this.uniqueIds(data.randomFillOrder || []);
    const validOrder = previousOrder.filter(
      (id) => id !== justPlayedSongId && this.isValidRandomId(id, songsById, allowedSongIds, excludedFromRandom),
    );
    const droppedStale = validOrder.length !== previousOrder.length || validOrder.some((id, index) => id !== previousOrder[index]);

    let orderToUse = [...validOrder];
    const queuedIds = new Set<string>([...votedIds, ...orderToUse]);
    const randomTailCount = orderToUse.filter((id) => !votedIds.has(id)).length;
    let didBackfill = false;
    if (randomTailCount < this.randomMinRemaining) {
      const exclude = new Set<string>(queuedIds);
      if (justPlayedSongId) {
        exclude.add(justPlayedSongId);
      }
      const needed = this.randomFillSize - randomTailCount;
      const additions = this.pickRandomIds(pool, exclude, Math.max(0, needed));
      if (additions.length > 0) {
        orderToUse = this.uniqueIds([...orderToUse, ...additions]);
        didBackfill = true;
      }
    }

    const randomIds = this.uniqueIds(orderToUse.filter((id) => !votedIds.has(id))).slice(0, this.randomFillSize);
    const randomItems = randomIds.flatMap((id, index) => {
      const song = songsById[id];
      if (!song || !this.isPlayableSong(song, allowedSet)) {
        return [];
      }
      return [this.toQueueItem(song, 0, votedQueue.length + index, "r")];
    });
    const queue = this.uniqueQueueItems([...votedQueue, ...randomItems]).map((item, index) => ({
      ...item,
      position: index + 1,
    }));
    data.randomFillOrder = orderToUse;
    return { queue, data, slots, needNewOrder: droppedStale || didBackfill };
  }

  refreshQueueFile(justPlayedSongId: string | null = null): QueueFileData {
    const built = this.buildFullQueue(justPlayedSongId);
    const existing = this.readQueueFile();
    built.data.nowPlaying = existing.nowPlaying;
    built.data.queue = built.queue;
    this.writeQueueFile(built.data);
    return built.data;
  }

  getQueuePayload(nowPlaying: NowPlaying | null): QueuePayload {
    return this.runReadOnly(() => {
      const data = this.readQueueFile();
      const resolvedNowPlaying = nowPlaying ?? data.nowPlaying ?? null;
      const persisted = data.queue ?? [];
      const upcoming = resolvedNowPlaying
        ? persisted.filter((item) => item.songId !== resolvedNowPlaying.songId)
        : persisted;
      return {
        nowPlaying: resolvedNowPlaying,
        queue: this.computeQueueETAs(upcoming, resolvedNowPlaying),
        schedule: this.slotSchedule.getScheduleContext(),
      };
    });
  }

  runReadOnly<T>(work: () => T): T {
    this.readOnlyDepth += 1;
    try {
      return work();
    } finally {
      this.readOnlyDepth = Math.max(0, this.readOnlyDepth - 1);
    }
  }

  removeFromRandomFillAndAppendOne(songId: string): void {
    const data = this.readQueueFile();
    let randomFillOrder = (data.randomFillOrder || []).filter((id) => id !== songId);
    const votesBySong = this.voteService.getVotesBySong();
    const songsById = this.songService.getSongsById();
    const effectivePlaylistId = this.playlistService.getEffectivePlaylistId();
    const allowedSongIds = this.playlistService.getSongIdsInPlaylist(effectivePlaylistId);
    const excludedFromRandom = this.playlistService.getSongIdsExcludedFromRandom(effectivePlaylistId);
    const votedQueue = this.buildQueueFromVotes(votesBySong, songsById, 20, allowedSongIds);
    const votedIds = new Set(votedQueue.map((item) => item.songId));
    const allowedSet = allowedSongIds ? new Set(allowedSongIds) : null;
    const pool = Object.values(songsById).filter(
      (song) => this.isPlayableSong(song, allowedSet) && !excludedFromRandom.has(song.id) && song.id !== songId,
    );
    const existingSet = new Set(this.uniqueIds(randomFillOrder));
    randomFillOrder = this.uniqueIds(randomFillOrder);
    const randomTailCount = randomFillOrder.filter((id) => !votedIds.has(id)).length;
    const additions = this.pickRandomIds(
      pool,
      new Set([...existingSet, ...votedIds]),
      Math.max(0, this.randomFillSize - randomTailCount),
    );
    randomFillOrder = this.uniqueIds([...randomFillOrder, ...additions]);
    data.randomFillOrder = randomFillOrder;
    this.writeQueueFile(data);
  }

  removeQueuedSong(songId: string): void {
    this.removeFromRandomFillAndAppendOne(songId);
    this.voteService.resetQueueVotesForSong(songId);
    this.voteService.deleteOverride(songId);
    this.refreshQueueFile();
  }

  consumePlayedSong(songId: string): void {
    this.voteService.resetQueueVotesForSong(songId);
    this.voteService.deleteOverride(songId);
    this.refreshQueueFile(songId);
  }

  setNowPlaying(nowPlaying: NowPlaying | null): void {
    const fileData = this.readQueueFile();
    this.writeQueueFile({ ...fileData, nowPlaying, queue: fileData.queue ?? [] });
  }

  private uniqueIds(ids: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      unique.push(id);
    }
    return unique;
  }

  private uniqueQueueItems(items: QueueItem[]): QueueItem[] {
    const seen = new Set<string>();
    const unique: QueueItem[] = [];
    for (const item of items) {
      if (seen.has(item.songId)) {
        continue;
      }
      seen.add(item.songId);
      unique.push(item);
    }
    return unique;
  }

  private isPlayableSong(song: Song | undefined, allowed: Set<string> | null): song is Song {
    if (!song || song.status !== "verified" || !song.localPath) {
      return false;
    }
    if (!this.fileStore.exists(song.localPath)) {
      return false;
    }
    if (allowed && !allowed.has(song.id)) {
      return false;
    }
    return true;
  }

  private isValidRandomId(
    id: string,
    songsById: Record<string, Song>,
    allowedSongIds: string[] | null,
    excludedFromRandom: Set<string>,
  ): boolean {
    const song = songsById[id];
    return this.isPlayableSong(song, allowedSongIds ? new Set(allowedSongIds) : null) && !excludedFromRandom.has(id);
  }

  private toQueueItem(song: Song, votes: number, index: number, prefix: "q" | "r"): QueueItem {
    return {
      id: `${prefix}-${song.id}`,
      songId: song.id,
      title: song.title,
      author: song.author,
      coverUrl: song.coverUrl,
      votes,
      position: index + 1,
      estimatedPlayAt: null,
      durationSeconds: song.durationSeconds || 180,
    };
  }

  private pickRandomIds(pool: Song[], exclude: Set<string>, count: number): string[] {
    if (count <= 0) {
      return [];
    }
    const available = pool.filter((song) => !exclude.has(song.id));
    return this.shuffle(available)
      .slice(0, count)
      .map((song) => song.id);
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.random() * (index + 1));
      const current = copy[index];
      const swapped = copy[swapIndex];
      if (current === undefined || swapped === undefined) {
        continue;
      }
      copy[index] = swapped;
      copy[swapIndex] = current;
    }
    return copy;
  }

  private remainingNowPlayingSeconds(nowPlaying: NowPlaying | null, now: Date): number {
    if (!nowPlaying?.startedAt || !nowPlaying.durationSeconds) {
      return 0;
    }
    const started = new Date(nowPlaying.startedAt).getTime();
    if (Number.isNaN(started)) {
      return 0;
    }
    const end = started + nowPlaying.durationSeconds * 1000;
    return Math.max(0, (end - now.getTime()) / 1000);
  }

  private initialEtaCursor(now: Date, nowPlaying: NowPlaying | null): Date {
    const remainingCurrent = this.remainingNowPlayingSeconds(nowPlaying, now);
    const slots = this.slotSchedule.getSlots();
    if (!slots.length) {
      return new Date(now.getTime() + remainingCurrent * 1000);
    }
    const atSeconds = this.slotSchedule.nowSeconds(now);
    if (this.slotSchedule.isMusicWindow(atSeconds)) {
      const proposed = new Date(now.getTime() + remainingCurrent * 1000);
      const slotEnd = this.slotSchedule.getSlotEndSeconds(atSeconds);
      if (slotEnd == null) {
        return proposed;
      }
      const slotEndDate = this.slotSchedule.dateFromSeconds(slotEnd, now);
      if (proposed.getTime() > slotEndDate.getTime()) {
        return this.slotSchedule.nextPlayableInstant(slotEndDate);
      }
      return proposed;
    }
    if (remainingCurrent > 0) {
      return this.slotSchedule.nextPlayableInstant(new Date(now.getTime() + remainingCurrent * 1000));
    }
    return this.slotSchedule.nextPlayableInstant(now);
  }
}
