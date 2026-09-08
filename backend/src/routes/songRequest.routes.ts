import { Router } from "express";
import type { SongRequestController } from "../controllers/songRequestController.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createSongRequestRouter(controller: SongRequestController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/").get(auth.authenticate, controller.list);
  router.route("/:songId/bump").post(auth.authenticate, controller.bump);
  return router;
}
