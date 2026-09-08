import type { Request, Response } from "express";
import type { PlayerFFMPEG } from "../services/playerFfmpeg.js";
import type { QueueManager } from "../services/queueManager.js";
import { routeParam } from "../middlewares/routeParam.js";

export class QueueController {
  constructor(
    private readonly queueManager: QueueManager,
    private readonly player: PlayerFFMPEG,
  ) {}

  getQueue = (_request: Request, response: Response): void => {
    response.json(this.queueManager.getQueuePayload(this.player.getStatus().nowPlaying));
  };

  getPublicQueue = (_request: Request, response: Response): void => {
    response.json(this.queueManager.getQueuePayload(this.player.getStatus().nowPlaying));
  };

  getNowPlaying = (_request: Request, response: Response): void => {
    response.json({ nowPlaying: this.player.getStatus().nowPlaying });
  };

  removeFromQueue = (request: Request, response: Response): void => {
    this.queueManager.removeQueuedSong(routeParam(request, "songId"));
    response.json({ success: true });
  };
}
