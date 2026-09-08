import type { EmailToken } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface EmailTokenRow {
  token: string;
  email: string;
  type: "register" | "login";
  expires_at: string;
  created_at: string;
}

function mapToken(row: EmailTokenRow): EmailToken {
  return {
    token: row.token,
    email: row.email,
    type: row.type,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export class EmailTokenRepository {
  constructor(private readonly database: IDatabase) {}

  insert(token: string, email: string, type: "register" | "login", expiresAt: string): void {
    this.database
      .prepare("INSERT INTO email_tokens (token, email, type, expires_at) VALUES (?, ?, ?, ?)")
      .run(token, email, type, expiresAt);
  }

  findValid(token: string): EmailToken | undefined {
    const row = this.database
      .prepare<EmailTokenRow>("SELECT * FROM email_tokens WHERE token = ? AND expires_at > datetime('now')")
      .get(token);
    return row ? mapToken(row) : undefined;
  }

  delete(token: string): void {
    this.database.prepare("DELETE FROM email_tokens WHERE token = ?").run(token);
  }
}
