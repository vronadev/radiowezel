import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import { PollActionError } from "../../src/services/pollActionError.js";
import { optionEligible, selectPollWinner } from "../../src/services/pollTally.js";
import { recurringWeeklyBellWindows, weeklyBellWindow } from "../../src/utils/weeklyBellWindow.js";

function columns(database: IDatabase, table: string): string[] {
  return database.prepare<{ name: string }>(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

describe("bell and poll schema", () => {
  const created: IDatabase[] = [];

  afterEach(() => {
    for (const database of created.splice(0)) {
      database.close();
    }
  });

  it("creates bell, poll, option, and vote tables", () => {
    const database = openDatabase(":memory:");
    created.push(database);
    expect(columns(database, "bells")).toEqual([
      "id",
      "title",
      "artist",
      "youtube_url",
      "start_time_sec",
      "end_time_sec",
      "is_approved",
      "requested_by_id",
      "created_at",
    ]);
    expect(columns(database, "polls")).toEqual(["id", "title", "type", "start_date", "end_date", "is_active"]);
    expect(columns(database, "poll_options")).toEqual([
      "id",
      "poll_id",
      "bell_id",
      "title",
      "youtube_url",
      "start_time_sec",
      "end_time_sec",
    ]);
    expect(columns(database, "poll_votes")).toEqual(["id", "poll_id", "user_id", "poll_option_id", "created_at"]);
    const voteSql = database
      .prepare<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'poll_votes'")
      .get()?.sql;
    expect(voteSql).toContain("UNIQUE(poll_id, user_id)");
  });

  it("adds the poll tables to a database created before this feature", () => {
    const dbPath = path.join(os.tmpdir(), `radiowezel-bells-${Date.now()}.db`);
    const raw = new Database(dbPath);
    raw.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
    raw.close();
    const database = openDatabase(dbPath);
    created.push(database);
    expect(columns(database, "bells")).toContain("youtube_url");
    expect(columns(database, "poll_votes")).toContain("poll_option_id");
    database.close();
    created.pop();
    const reopened = openDatabase(dbPath);
    created.push(reopened);
    expect(columns(reopened, "polls")).toContain("type");
    reopened.close();
    created.pop();
    fs.rmSync(dbPath, { force: true });
  });
});

describe("weekly bell window", () => {
  it("covers Monday through Friday of the school week", () => {
    const monday = new Date(2026, 9, 5, 8, 0, 0);
    expect(monday.getDay()).toBe(1);
    expect(weeklyBellWindow(monday)).toEqual({ startDate: "2026-10-05", endDate: "2026-10-09" });
    expect(weeklyBellWindow(new Date(2026, 9, 7, 23, 0, 0))).toEqual({
      startDate: "2026-10-05",
      endDate: "2026-10-09",
    });
    expect(recurringWeeklyBellWindows(monday)).toHaveLength(1);
  });

  it("prepares the next school week from Friday through Sunday", () => {
    const friday = new Date(2026, 9, 9, 20, 0, 0);
    expect(recurringWeeklyBellWindows(friday)).toEqual([
      { startDate: "2026-10-05", endDate: "2026-10-09" },
      { startDate: "2026-10-12", endDate: "2026-10-16" },
    ]);
    expect(recurringWeeklyBellWindows(new Date(2026, 9, 11, 12, 0, 0))).toEqual([
      { startDate: "2026-10-05", endDate: "2026-10-09" },
      { startDate: "2026-10-12", endDate: "2026-10-16" },
    ]);
  });
});

describe("poll winner selection", () => {
  it("counts only approved bells and reuses the queue tie-break", () => {
    expect(optionEligible("WEEKLY_BELL", true)).toBe(true);
    expect(optionEligible("WEEKLY_BELL", false)).toBe(false);
    expect(optionEligible("WEEKLY_BELL", null)).toBe(false);
    expect(optionEligible("ONE_OFF", null)).toBe(true);
    expect(optionEligible("ONE_OFF", false)).toBe(false);

    const pending = {
      optionId: "pending",
      voteCount: 5,
      firstVoteAt: "2026-10-06 08:00:00",
      lastVoteAt: "2026-10-06 08:00:00",
      eligible: false,
    };
    const older = {
      optionId: "older",
      voteCount: 2,
      firstVoteAt: "2026-10-06 09:00:00",
      lastVoteAt: "2026-10-06 09:00:00",
      eligible: true,
    };
    const newer = {
      optionId: "newer",
      voteCount: 2,
      firstVoteAt: "2026-10-06 10:00:00",
      lastVoteAt: "2026-10-06 10:00:00",
      eligible: true,
    };
    expect(selectPollWinner([pending, newer, older], "oldest_vote")).toBe("older");
    expect(selectPollWinner([pending, newer, older], "newest_vote")).toBe("newer");
    expect(selectPollWinner([pending], "oldest_vote")).toBeNull();
  });
});

describe("poll storage", () => {
  const created: IDatabase[] = [];

  afterEach(() => {
    for (const database of created.splice(0)) {
      database.close();
    }
  });

  function layer() {
    const database = openDatabase(":memory:");
    created.push(database);
    return { database, services: DataLayerFactory.create(database) };
  }

  it("seeds one active Monday–Friday poll and replaces a vote in place", () => {
    const { database, services } = layer();
    const monday = new Date(2026, 9, 5, 12, 0, 0);
    const first = services.pollService.ensureRecurringWeeklyBellPolls(monday);
    const second = services.pollService.ensureRecurringWeeklyBellPolls(monday);
    expect(first).toHaveLength(1);
    expect(first[0]?.isActive).toBe(true);
    expect(first[0]?.startDate).toBe("2026-10-05");
    expect(first[0]?.endDate).toBe("2026-10-09");
    expect(second.map((poll) => poll.id)).toEqual(first.map((poll) => poll.id));

    const userId = services.userService.create("voter@zsi.kielce.pl", "hash", false);
    const alpha = services.bellService.create({
      title: "Alpha",
      artist: "A",
      youtubeUrl: "https://youtu.be/aaaaaaaaaaa",
      isApproved: true,
      requestedById: userId,
    });
    const beta = services.bellService.create({
      title: "Beta",
      artist: "B",
      youtubeUrl: "https://youtu.be/bbbbbbbbbbb",
      isApproved: true,
    });
    expect(alpha.startTimeSec).toBe(0);
    expect(alpha.endTimeSec).toBe(30);
    const pollId = first[0]!.id;
    services.pollService.adminAddOption(pollId, { bellId: alpha.id }, userId, "oldest_vote");
    const withBeta = services.pollService.adminAddOption(pollId, { bellId: beta.id }, userId, "oldest_vote");
    const alphaOption = withBeta.options.find((option) => option.bellId === alpha.id);
    const betaOption = withBeta.options.find((option) => option.bellId === beta.id);
    expect(alphaOption?.eligible).toBe(true);
    expect(betaOption?.eligible).toBe(true);

    services.pollService.vote(pollId, userId, alphaOption!.id, monday, "oldest_vote");
    const changed = services.pollService.vote(pollId, userId, betaOption!.id, monday, "oldest_vote");
    expect(changed.myOptionId).toBe(betaOption!.id);
    expect(services.pollService.results(pollId, userId, "oldest_vote").options.map((option) => option.voteCount)).toEqual([
      0, 1,
    ]);
    expect(database.prepare<{ c: number }>("SELECT COUNT(*) AS c FROM poll_votes WHERE poll_id = ?").get(pollId)?.c).toBe(1);
    expect(() =>
      database
        .prepare("INSERT INTO poll_votes (id, poll_id, user_id, poll_option_id) VALUES (?, ?, ?, ?)")
        .run("extra-vote", pollId, userId, alphaOption!.id),
    ).toThrow(/UNIQUE/);
  });

  it("keeps Friday's poll active and next week ready but closed", () => {
    const { services } = layer();
    const polls = services.pollService.ensureRecurringWeeklyBellPolls(new Date(2026, 9, 9, 21, 0, 0));
    expect(polls.map((poll) => ({ startDate: poll.startDate, isActive: poll.isActive }))).toEqual([
      { startDate: "2026-10-05", isActive: true },
      { startDate: "2026-10-12", isActive: false },
    ]);
  });

  it("ignores unapproved bells until approval", () => {
    const { services } = layer();
    const at = new Date(2026, 9, 6, 12, 0, 0);
    const poll = services.pollService.ensureRecurringWeeklyBellPolls(at)[0];
    expect(poll).toBeDefined();
    const asker = services.userService.create("asker@zsi.kielce.pl", "hash", false);
    const approved = services.bellService.create({
      title: "Approved",
      artist: "A",
      youtubeUrl: "https://youtu.be/ccccccccccc",
      isApproved: true,
    });
    const pending = services.bellService.create({
      title: "Pending",
      artist: "B",
      youtubeUrl: "https://youtu.be/ddddddddddd",
      isApproved: false,
      requestedById: asker,
    });
    services.pollService.adminAddOption(poll!.id, { bellId: approved.id }, null, "oldest_vote");
    const listed = services.pollService.adminAddOption(poll!.id, { bellId: pending.id }, null, "oldest_vote");
    const approvedOption = listed.options.find((option) => option.bellId === approved.id);
    const pendingOption = listed.options.find((option) => option.bellId === pending.id);
    expect(pendingOption?.eligible).toBe(false);
    const voterA = services.userService.create("a@zsi.kielce.pl", "hash", false);
    const voterB = services.userService.create("b@zsi.kielce.pl", "hash", false);
    const voterC = services.userService.create("c@zsi.kielce.pl", "hash", false);
    services.pollService.vote(poll!.id, voterA, approvedOption!.id, at, "oldest_vote");
    services.pollService.vote(poll!.id, voterB, pendingOption!.id, at, "oldest_vote");
    services.pollService.vote(poll!.id, voterC, pendingOption!.id, at, "oldest_vote");
    expect(services.pollService.results(poll!.id, null, "oldest_vote").winnerOptionId).toBe(approvedOption!.id);

    const approvedBell = services.bellService.approve(pending.id);
    expect(approvedBell.notifyEmails).toEqual(expect.arrayContaining(["asker@zsi.kielce.pl", "b@zsi.kielce.pl", "c@zsi.kielce.pl"]));
    expect(services.pollService.results(poll!.id, null, "oldest_vote").winnerOptionId).toBe(pendingOption!.id);
    expect(() => services.pollService.vote(poll!.id, voterA, approvedOption!.id, new Date(2026, 9, 10, 12, 0, 0), "oldest_vote")).toThrow(
      PollActionError,
    );
  });

  it("breaks an eligible tie with the configured vote mode", () => {
    const { database, services } = layer();
    const at = new Date(2026, 9, 6, 12, 0, 0);
    const created = services.pollService.create(
      {
        title: "Wybór",
        type: "ONE_OFF",
        startDate: "2026-10-05",
        endDate: "2026-10-09",
        options: [
          { title: "Pierwszy", youtubeUrl: "https://youtu.be/eeeeeeeeeee", startTimeSec: 5, endTimeSec: 20 },
          { title: "Drugi", youtubeUrl: "https://youtu.be/fffffffffff" },
        ],
      },
      "oldest_vote",
    );
    expect(created.options[0]).toMatchObject({ startTimeSec: 5, endTimeSec: 20, eligible: true, isApproved: true });
    expect(created.options[1]).toMatchObject({ startTimeSec: 0, endTimeSec: 30, eligible: true });
    const [first, second] = created.options;
    const userA = services.userService.create("tie-a@zsi.kielce.pl", "hash", false);
    const userB = services.userService.create("tie-b@zsi.kielce.pl", "hash", false);
    services.pollService.vote(created.id, userA, first!.id, at, "oldest_vote");
    services.pollService.vote(created.id, userB, second!.id, at, "oldest_vote");
    database.prepare("UPDATE poll_votes SET created_at = ? WHERE user_id = ?").run("2026-10-06 09:00:00", userA);
    database.prepare("UPDATE poll_votes SET created_at = ? WHERE user_id = ?").run("2026-10-06 11:00:00", userB);
    expect(services.pollService.results(created.id, null, "oldest_vote").winnerOptionId).toBe(first!.id);
    expect(services.pollService.results(created.id, null, "newest_vote").winnerOptionId).toBe(second!.id);
  });
});
