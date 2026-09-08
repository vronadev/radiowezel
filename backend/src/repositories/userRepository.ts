import type { PublicUser, User } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  is_admin: number;
  created_at: string;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  };
}

export class UserRepository {
  constructor(private readonly database: IDatabase) {}

  findById(id: string): User | undefined {
    const row = this.database.prepare<UserRow>("SELECT * FROM users WHERE id = ?").get(id);
    return row ? mapUser(row) : undefined;
  }

  findPublicById(id: string): PublicUser | undefined {
    const row = this.database
      .prepare<{ id: string; email: string; is_admin: number }>("SELECT id, email, is_admin FROM users WHERE id = ?")
      .get(id);
    if (!row) {
      return undefined;
    }
    return { id: row.id, email: row.email, isAdmin: row.is_admin === 1 };
  }

  findByEmail(email: string): User | undefined {
    const row = this.database.prepare<UserRow>("SELECT * FROM users WHERE email = ?").get(email);
    return row ? mapUser(row) : undefined;
  }

  insert(id: string, email: string, passwordHash: string, isAdmin: boolean): void {
    this.database
      .prepare("INSERT INTO users (id, email, passwordHash, is_admin) VALUES (?, ?, ?, ?)")
      .run(id, email, passwordHash, isAdmin ? 1 : 0);
  }

  updatePasswordAndPromoteAdmin(id: string, passwordHash: string): void {
    this.database.prepare("UPDATE users SET passwordHash = ?, is_admin = 1 WHERE id = ?").run(passwordHash, id);
  }

  setAdmin(id: string, isAdmin: boolean): void {
    this.database.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, id);
  }
}
