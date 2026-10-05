import { Router } from "express";
import type { PollController } from "../controllers/pollController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createPollRouter(controller: PollController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/active").get(auth.authenticate, controller.listActive);
  router.route("/:id/vote").post(auth.authenticate, controller.vote);
  router.route("/:id/vote").delete(auth.authenticate, controller.clearVote);
  router.route("/:id/options").post(auth.authenticate, asyncHandler(controller.addOption));
  return router;
}

export function createAdminPollRouter(controller: PollController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/").get(auth.authenticate, auth.authorizeAdmin, controller.list);
  router.route("/").post(auth.authenticate, auth.authorizeAdmin, controller.create);
  router.route("/:id/results").get(auth.authenticate, auth.authorizeAdmin, controller.results);
  router.route("/:id").patch(auth.authenticate, auth.authorizeAdmin, controller.update);
  router.route("/:id/options").post(auth.authenticate, auth.authorizeAdmin, asyncHandler(controller.adminAddOption));
  router.route("/:id/options/:optionId").delete(auth.authenticate, auth.authorizeAdmin, controller.removeOption);
  return router;
}
