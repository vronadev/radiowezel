import { Router } from "express";
import type { RequestHandler } from "express";
import type { AuthMiddleware } from "../middlewares/auth.js";
import type { Controllers } from "../factories/controllerFactory.js";
import { createAuthRouter } from "./auth.routes.js";
import { createAdminPlaylistRouter, createPlaylistRouter } from "./playlist.routes.js";
import { createPlayerRouter } from "./player.routes.js";
import { createAdminQueueRouter, createPublicQueueRouter, createQueueRouter } from "./queue.routes.js";
import { createPlaylistScheduleRouter, createScheduleRouter } from "./schedule.routes.js";
import { createSettingsRouter } from "./settings.routes.js";
import { createAdminSongRouter, createSongRouter } from "./song.routes.js";
import { createVoteRouter } from "./vote.routes.js";
import { createSongRequestRouter } from "./songRequest.routes.js";
import { createPlayRouter } from "./play.routes.js";

export function createApiRouter(
  auth: AuthMiddleware,
  controllers: Controllers,
  requireSchoolEmail: RequestHandler,
): Router {
  const router = Router();

  router.use("/auth", createAuthRouter(controllers.auth, auth, requireSchoolEmail));
  router.use("/public", createPublicQueueRouter(controllers.queue));
  router.use("/queue", createQueueRouter(controllers.queue, auth));
  router.route("/effective-playlist").get(auth.authenticate, controllers.playlist.getEffective);
  router.use("/songs", createSongRouter(controllers.song, auth));
  router.use("/playlists", createPlaylistRouter(controllers.playlist, auth));
  router.use("/vote", createVoteRouter(controllers.vote, auth));
  router.use("/song-requests", createSongRequestRouter(controllers.songRequest, auth));
  router.use("/plays", createPlayRouter(controllers.play, auth));
  router.use("/schedule", createScheduleRouter(controllers.schedule, auth));
  router.use("/admin/player", createPlayerRouter(controllers.player, auth));
  router.use("/admin/settings", createSettingsRouter(controllers.settings, auth));
  router.use("/admin/songs", createAdminSongRouter(controllers.song, auth));
  router.use("/admin/queue", createAdminQueueRouter(controllers.queue, auth));
  router.use("/admin/playlists", createAdminPlaylistRouter(controllers.playlist, auth));
  router.use("/admin/playlist-schedule", createPlaylistScheduleRouter(controllers.playlistSchedule, auth));

  return router;
}
