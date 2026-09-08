import { Router } from "express";
import type { PlayController } from "../controllers/playController.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createPlayRouter(controller: PlayController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/").get(auth.authenticate, controller.getHistory);
  return router;
}
