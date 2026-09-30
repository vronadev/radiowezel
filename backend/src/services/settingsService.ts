import type { VoteQuota } from "../@types/models.js";
import { parseActivePlaybackDays } from "../config/activePlaybackDays.js";
import { SettingsKeys } from "../constants/settingsKeys.js";
import type { SettingsRepository } from "../repositories/settingsRepository.js";

export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  getSetting(key: string, defaultValue: string): string {
    return this.settingsRepository.get(key) ?? defaultValue;
  }

  setSetting(key: string, value: string): void {
    this.settingsRepository.set(key, value);
  }

  getVoteQuota(): VoteQuota {
    const perUser = parseInt(this.getSetting(SettingsKeys.voteQuotaPerUser, "5"), 10) || 5;
    const periodHours = parseInt(this.getSetting(SettingsKeys.voteQuotaPeriodHours, "24"), 10) || 24;
    return { perUser, periodHours };
  }

  setVoteQuotaPerUser(value: number): void {
    this.setSetting(SettingsKeys.voteQuotaPerUser, String(value));
  }

  setVoteQuotaPeriodHours(value: number): void {
    this.setSetting(SettingsKeys.voteQuotaPeriodHours, String(value));
  }

  getActivePlaylistId(): string | null {
    return this.getSetting(SettingsKeys.activePlaylistId, "") || null;
  }

  setActivePlaylistId(playlistId: string | null): void {
    this.setSetting(SettingsKeys.activePlaylistId, playlistId ?? "");
  }

  getActivePlaybackDays(fallback: number[]): number[] {
    const raw = this.settingsRepository.get(SettingsKeys.activePlaybackDays);
    if (raw == null || raw.trim() === "") {
      return [...fallback];
    }
    return parseActivePlaybackDays(raw) ?? [...fallback];
  }

  setActivePlaybackDays(days: number[]): void {
    const parsed = parseActivePlaybackDays(days) ?? [];
    this.setSetting(SettingsKeys.activePlaybackDays, parsed.join(","));
  }
}
