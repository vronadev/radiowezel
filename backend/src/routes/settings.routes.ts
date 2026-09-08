import { Router } from "express";
import type { SettingsController } from "../controllers/settingsController.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createSettingsRouter(controller: SettingsController, auth: AuthMiddleware): Router {
  const router = Router();
  router
    .route("/")
    .get(auth.authenticate, auth.authorizeAdmin, controller.get)
    .patch(auth.authenticate, auth.authorizeAdmin, controller.patch);
  return router;
}
