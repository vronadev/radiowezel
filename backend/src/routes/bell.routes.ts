import { Router } from "express";
import type { BellController } from "../controllers/bellController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createBellRouter(controller: BellController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/").get(auth.authenticate, controller.listApproved);
  router.route("/request").post(auth.authenticate, asyncHandler(controller.request));
  return router;
}

export function createAdminBellRouter(controller: BellController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/pending").get(auth.authenticate, auth.authorizeAdmin, controller.listPending);
  router.route("/:id/approve").patch(auth.authenticate, auth.authorizeAdmin, asyncHandler(controller.approve));
  return router;
}
