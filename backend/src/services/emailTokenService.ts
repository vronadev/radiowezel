import type { EmailToken } from "../@types/models.js";
import type { EmailTokenRepository } from "../repositories/emailTokenRepository.js";

export class EmailTokenService {
  constructor(private readonly emailTokenRepository: EmailTokenRepository) {}

  create(email: string, type: "register" | "login", ttlMs = 60 * 60 * 1000): string {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.emailTokenRepository.insert(token, email, type, expiresAt);
    return token;
  }

  consumeValid(token: string): EmailToken | undefined {
    const row = this.emailTokenRepository.findValid(token);
    if (!row) {
      return undefined;
    }
    this.emailTokenRepository.delete(token);
    return row;
  }
}
