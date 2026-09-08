import { Router } from "express";
import type { PlayerController } from "../controllers/playerController.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createPlayerRouter(controller: PlayerController, auth: AuthMiddleware): Router {
  const router = Router();
  router
    .route("/")
    .get(auth.authenticate, auth.authorizeAdmin, controller.getStatus)
    .patch(auth.authenticate, auth.authorizeAdmin, controller.patchStatus);
  router.route("/skip").post(auth.authenticate, auth.authorizeAdmin, controller.skip);
  return router;
}
