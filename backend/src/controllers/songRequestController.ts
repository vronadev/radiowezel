import type { Request, Response } from "express";
import { ErrorMessages } from "../constants/errorMessages.js";
import { routeParam } from "../middlewares/routeParam.js";
import type { SongRequestService } from "../services/songRequestService.js";
import type { SongService } from "../services/songService.js";
import type { IRealtimeHub } from "../realtime/events.js";

export class SongRequestController {
  constructor(
    private readonly songRequestService: SongRequestService,
    private readonly songService: SongService,
    private readonly realtime?: IRealtimeHub,
  ) {}

  list = (_request: Request, response: Response): void => {
    response.json({
      requests: this.songRequestService.listAggregates(),
    });
  };

  bump = (request: Request, response: Response): void => {
    const songId = routeParam(request, "songId");
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ message: ErrorMessages.invalidToken });
      return;
    }
    const song = this.songService.getById(songId);
    if (!song) {
      response.status(404).json({ message: ErrorMessages.songNotFound });
      return;
    }
    if (song.status === "verified") {
      response.status(400).json({ message: ErrorMessages.alreadyVerified });
      return;
    }
    const added = this.songRequestService.add(userId, songId, song.youtubeUrl);
    this.realtime?.publish({ event: "requests:updated", songId, title: song.title });
    response.json({ success: true, added });
  };
}
