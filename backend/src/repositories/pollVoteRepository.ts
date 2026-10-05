import type { PollVote } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface PollVoteRow {
  id: string;
  poll_id: string;
  user_id: string;
  poll_option_id: string;
  created_at: string;
}

interface AggregateRow {
  poll_option_id: string;
  c: number;
  first_at: string | null;
  last_at: string | null;
}

export interface PollVoteAggregate {
  pollOptionId: string;
  count: number;
  firstVoteAt: string;
  lastVoteAt: string;
}

function mapVote(row: PollVoteRow): PollVote {
  return {
    id: row.id,
    pollId: row.poll_id,
    userId: row.user_id,
    pollOptionId: row.poll_option_id,
    createdAt: row.created_at,
  };
}

export class PollVoteRepository {
  constructor(private readonly database: IDatabase) {}

  upsert(vote: { id: string; pollId: string; userId: string; pollOptionId: string }): void {
    this.database
      .prepare(
        `INSERT INTO poll_votes (id, poll_id, user_id, poll_option_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(poll_id, user_id) DO UPDATE SET
           poll_option_id = excluded.poll_option_id,
           created_at = datetime('now')`,
      )
      .run(vote.id, vote.pollId, vote.userId, vote.pollOptionId);
  }

  deleteByPollAndUser(pollId: string, userId: string): void {
    this.database.prepare("DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?").run(pollId, userId);
  }

  findByPollAndUser(pollId: string, userId: string): PollVote | undefined {
    const row = this.database
      .prepare<PollVoteRow>("SELECT * FROM poll_votes WHERE poll_id = ? AND user_id = ?")
      .get(pollId, userId);
    return row ? mapVote(row) : undefined;
  }

  countByPoll(pollId: string): number {
    const row = this.database.prepare<{ c: number }>("SELECT COUNT(*) AS c FROM poll_votes WHERE poll_id = ?").get(pollId);
    return row?.c ?? 0;
  }

  aggregates(pollId: string): PollVoteAggregate[] {
    return this.database
      .prepare<AggregateRow>(
        `SELECT poll_option_id, COUNT(*) AS c, MIN(created_at) AS first_at, MAX(created_at) AS last_at
         FROM poll_votes
         WHERE poll_id = ?
         GROUP BY poll_option_id`,
      )
      .all(pollId)
      .map((row) => ({
        pollOptionId: row.poll_option_id,
        count: row.c,
        firstVoteAt: row.first_at ?? "",
        lastVoteAt: row.last_at ?? "",
      }));
  }

  listVoterEmailsByBellId(bellId: string): string[] {
    return this.database
      .prepare<{ email: string }>(
        `SELECT DISTINCT u.email AS email
         FROM poll_votes v
         JOIN poll_options o ON o.id = v.poll_option_id
         JOIN users u ON u.id = v.user_id
         WHERE o.bell_id = ?`,
      )
      .all(bellId)
      .map((row) => row.email);
  }
}
