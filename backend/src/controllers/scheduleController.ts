import type { Request, Response } from "express";
import type { AppConfig } from "../@types/models.js";
import type { QueueManager } from "../services/queueManager.js";
import type { ScheduleService } from "../services/scheduleService.js";
import type { SettingsService } from "../services/settingsService.js";

export class ScheduleController {
  constructor(private readonly config: AppConfig) {}

  getBreakSchedule = (_request: Request, response: Response): void => {
    const schedule = this.config.schedule;
    response.json({
      slots: schedule.slots || [],
      bellOffsetSeconds: schedule.bellOffsetSeconds ?? 30,
      fadeOutSecondsBeforeEnd: schedule.fadeOutSecondsBeforeEnd ?? 5,
    });
  };
}

export class PlaylistScheduleController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly scheduleService: ScheduleService,
    private readonly queueManager: QueueManager,
  ) {}

  get = (_request: Request, response: Response): void => {
    response.json({
      activePlaylistId: this.settingsService.getActivePlaylistId(),
      cyclic: this.scheduleService.listCyclic(),
      oneOff: this.scheduleService.listOneOff(),
    });
  };

  patch = (request: Request, response: Response): void => {
    const { activePlaylistId, cyclic, oneOff } = request.body || {};
    if (typeof activePlaylistId === "string" || activePlaylistId === null) {
      this.settingsService.setActivePlaylistId(activePlaylistId);
    }
    if (Array.isArray(cyclic)) {
      this.scheduleService.replaceCyclic(
        cyclic.map((item: { playlistId?: string; dayOfWeek?: unknown }) => ({
          playlistId: String(item.playlistId || ""),
          dayOfWeek: parseInt(String(item.dayOfWeek), 10),
        })),
      );
    }
    if (Array.isArray(oneOff)) {
      this.scheduleService.replaceOneOff(
        oneOff.map((item: { playlistId?: string; date?: string }) => ({
          playlistId: String(item.playlistId || ""),
          date: String(item.date || ""),
        })),
      );
    }
    this.queueManager.refreshQueueFile();
    response.json({
      activePlaylistId: this.settingsService.getActivePlaylistId(),
      cyclic: this.scheduleService.listCyclic(),
      oneOff: this.scheduleService.listOneOff(),
    });
  };
}
