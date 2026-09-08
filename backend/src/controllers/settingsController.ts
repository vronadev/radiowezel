import type { Request, Response } from "express";
import type { SettingsService } from "../services/settingsService.js";

export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  get = (_request: Request, response: Response): void => {
    const quota = this.settingsService.getVoteQuota();
    response.json({
      voteQuotaPerUser: quota.perUser,
      voteQuotaPeriodHours: quota.periodHours,
    });
  };

  patch = (request: Request, response: Response): void => {
    const { voteQuotaPerUser, voteQuotaPeriodHours } = request.body || {};
    if (voteQuotaPerUser != null) {
      const value = Math.max(1, Math.min(100, parseInt(String(voteQuotaPerUser), 10) || 5));
      this.settingsService.setVoteQuotaPerUser(value);
    }
    if (voteQuotaPeriodHours != null) {
      const value = Math.max(1, Math.min(168, parseInt(String(voteQuotaPeriodHours), 10) || 24));
      this.settingsService.setVoteQuotaPeriodHours(value);
    }
    const quota = this.settingsService.getVoteQuota();
    response.json({
      voteQuotaPerUser: quota.perUser,
      voteQuotaPeriodHours: quota.periodHours,
    });
  };
}
