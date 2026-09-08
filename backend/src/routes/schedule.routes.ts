import { Router } from "express";
import type { PlaylistScheduleController, ScheduleController } from "../controllers/scheduleController.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createScheduleRouter(controller: ScheduleController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/").get(auth.authenticate, controller.getBreakSchedule);
  return router;
}

export function createPlaylistScheduleRouter(
  controller: PlaylistScheduleController,
  auth: AuthMiddleware,
): Router {
  const router = Router();
  router
    .route("/")
    .get(auth.authenticate, auth.authorizeAdmin, controller.get)
    .patch(auth.authenticate, auth.authorizeAdmin, controller.patch);
  return router;
}
