import { describe, expect, it, afterEach } from "vitest";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import type { DataLayer } from "../../src/factories/dataLayerFactory.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { formatLocalDate, localWeekday } from "../../src/utils/localCalendar.js";

function createLayer(): { database: IDatabase; layer: DataLayer } {
  const database = openDatabase(":memory:");
  return { database, layer: DataLayerFactory.create(database) };
}

describe("Phase 1 data layer", () => {
  let database: IDatabase | undefined;

  afterEach(() => {
    database?.close();
  });

  it("reads default settings and vote quota", () => {
    const created = createLayer();
    database = created.database;
    const { settingsService } = created.layer;
    expect(settingsService.getSetting("vote_quota_per_user", "0")).toBe("5");
    expect(settingsService.getVoteQuota()).toEqual({ perUser: 5, periodHours: 24 });
  });

  it("resolves effective playlist from one-off schedule then cyclic then active setting", () => {
    const created = createLayer();
    database = created.database;
    const { playlistService, scheduleService, settingsService } = created.layer;

    const playlistA = playlistService.create("A", null);
    const playlistB = playlistService.create("B", null);
    const playlistC = playlistService.create("C", null);

    const at = new Date(2026, 8, 7, 12, 0, 0);
    const dateStr = formatLocalDate(at);
    const dayOfWeek = localWeekday(at);

    settingsService.setActivePlaylistId(playlistA);
    expect(playlistService.getEffectivePlaylistId(at)).toBe(playlistA);

    scheduleService.replaceCyclic([{ playlistId: playlistB, dayOfWeek }]);
    expect(playlistService.getEffectivePlaylistId(at)).toBe(playlistB);

    scheduleService.replaceOneOff([{ playlistId: playlistC, date: dateStr }]);
    expect(playlistService.getEffectivePlaylistId(at)).toBe(playlistC);
  });

  it("matches one-off playlist dates to local midnight, not UTC ISO", () => {
    const created = createLayer();
    database = created.database;
    const { playlistService, scheduleService } = created.layer;
    const playlist = playlistService.create("Local day", null);
    const earlyLocal = new Date(2026, 8, 7, 0, 30, 0);
    scheduleService.replaceOneOff([{ playlistId: playlist, date: formatLocalDate(earlyLocal) }]);
    expect(playlistService.getEffectivePlaylistId(earlyLocal)).toBe(playlist);
  });

  it("filters votable songs using exclude_from_voting when no playlist is active", () => {
    const created = createLayer();
    database = created.database;
    const { playlistService, songService } = created.layer;

    const hiddenPlaylist = playlistService.create("Hidden", null);
    playlistService.update(hiddenPlaylist, { excludeFromVoting: true });

    const openSongId = songService.createPending({
      title: "Open",
      author: "A",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    });
    const hiddenSongId = songService.createPending({
      title: "Hidden",
      author: "B",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=bbbbbbbbbbb",
    });
    songService.updateStatus(openSongId, "verified");
    songService.updateStatus(hiddenSongId, "verified");
    playlistService.addSong(hiddenPlaylist, hiddenSongId, "manual");

    const votable = songService.getVotableSongIds();
    expect(votable).toContain(openSongId);
    expect(votable).not.toContain(hiddenSongId);
  });

  it("counts votes with queue overrides and enforces quota", () => {
    const created = createLayer();
    database = created.database;
    const { userService, songService, voteService, settingsService } = created.layer;

    const userId = userService.create("user@zsi.kielce.pl", "hash", false);
    const songId = songService.createPending({
      title: "Song",
      author: "X",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=ccccccccccc",
    });
    songService.updateStatus(songId, "verified");

    voteService.addVote(userId, songId);
    voteService.addVote(userId, songId);
    expect(voteService.getVotesBySong()[songId]?.count).toBe(2);

    settingsService.setVoteQuotaPerUser(1);
    expect(voteService.checkVoteQuota(userId)).toBe(false);
    expect(() => voteService.addVote(userId, songId, { enforceQuota: true })).toThrowError(/VOTE_QUOTA_EXCEEDED/);
    expect(voteService.getVotesBySong()[songId]?.count).toBe(2);

    voteService.setQueueOverride(songId, 9);
    expect(voteService.getVotesBySong()[songId]?.count).toBe(9);

    voteService.resetQueueVotesForSong(songId);
    expect(voteService.getVotesBySong()[songId]?.count).toBe(9);
  });

  it("promotes an existing user to admin and consumes email tokens", () => {
    const created = createLayer();
    database = created.database;
    const { userService, emailTokenService } = created.layer;

    const userId = userService.create("admin@zsi.kielce.pl", "old-hash", false);
    userService.ensureAdminUser("admin@zsi.kielce.pl", "new-hash");
    const user = userService.findByEmail("admin@zsi.kielce.pl");
    expect(user?.id).toBe(userId);
    expect(user?.isAdmin).toBe(true);
    expect(user?.passwordHash).toBe("new-hash");

    const token = emailTokenService.create("admin@zsi.kielce.pl", "login");
    const consumed = emailTokenService.consumeValid(token);
    expect(consumed?.email).toBe("admin@zsi.kielce.pl");
    expect(emailTokenService.consumeValid(token)).toBeUndefined();
  });
});
