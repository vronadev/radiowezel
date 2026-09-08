import type { Request, Response } from "express";
import type { PlayerFFMPEG } from "../services/playerFfmpeg.js";
import type { IRealtimeHub } from "../realtime/events.js";

export class PlayerController {
  constructor(
    private readonly player: PlayerFFMPEG,
    private readonly realtime?: IRealtimeHub,
  ) {}

  getStatus = (_request: Request, response: Response): void => {
    response.json({ paused: this.player.getStatus().paused });
  };

  patchStatus = (request: Request, response: Response): void => {
    const { paused } = request.body || {};
    if (typeof paused === "boolean") {
      this.player.pause(paused);
    }
    const status = this.player.getStatus();
    this.realtime?.publish({ event: "player:updated", paused: status.paused });
    response.json({ paused: status.paused });
  };

  skip = (_request: Request, response: Response): void => {
    this.player.skip();
    this.realtime?.publish({ event: "queue:updated" });
    response.json({ success: true });
  };
}
