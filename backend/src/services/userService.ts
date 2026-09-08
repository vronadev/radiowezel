import type { PublicUser, User } from "../@types/models.js";
import type { UserRepository } from "../repositories/userRepository.js";

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  findById(id: string): User | undefined {
    return this.userRepository.findById(id);
  }

  findPublicById(id: string): PublicUser | undefined {
    return this.userRepository.findPublicById(id);
  }

  findByEmail(email: string): User | undefined {
    return this.userRepository.findByEmail(email);
  }

  create(email: string, passwordHash: string, isAdmin: boolean): string {
    const id = crypto.randomUUID();
    this.userRepository.insert(id, email, passwordHash, isAdmin);
    return id;
  }

  ensureAdminUser(email: string, passwordHash: string): void {
    const existing = this.userRepository.findByEmail(email);
    if (existing) {
      this.userRepository.updatePasswordAndPromoteAdmin(existing.id, passwordHash);
      return;
    }
    this.create(email, passwordHash, true);
  }

  setAdmin(id: string, isAdmin: boolean): void {
    this.userRepository.setAdmin(id, isAdmin);
  }
}
