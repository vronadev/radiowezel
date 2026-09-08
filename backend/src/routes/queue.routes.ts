import { Router } from "express";
import type { QueueController } from "../controllers/queueController.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createQueueRouter(controller: QueueController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/").get(auth.authenticate, controller.getQueue);
  router.route("/now-playing").get(auth.authenticate, controller.getNowPlaying);
  return router;
}

export function createPublicQueueRouter(controller: QueueController): Router {
  const router = Router();
  router.route("/queue").get(controller.getPublicQueue);
  return router;
}

export function createAdminQueueRouter(controller: QueueController, auth: AuthMiddleware): Router {
  const router = Router();
  router
    .route("/songs/:songId")
    .delete(auth.authenticate, auth.authorizeAdmin, controller.removeFromQueue);
  return router;
}
