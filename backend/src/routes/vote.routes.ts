import { Router } from "express";
import type { VoteController } from "../controllers/voteController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createVoteRouter(controller: VoteController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/").post(auth.authenticate, asyncHandler(controller.vote));
  router.route("/quota").get(auth.authenticate, controller.getQuota);
  return router;
}
