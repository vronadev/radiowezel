import { Router } from "express";
import type { RequestHandler } from "express";
import type { AuthController } from "../controllers/authController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createAuthRouter(
  controller: AuthController,
  auth: AuthMiddleware,
  requireSchoolEmail: RequestHandler,
): Router {
  const router = Router();
  router.route("/register").post(requireSchoolEmail, asyncHandler(controller.register));
  router.route("/send-magic-link").post(requireSchoolEmail, asyncHandler(controller.sendMagicLink));
  router.route("/verify").get(controller.verify);
  router.route("/login").post(controller.login);
  router.route("/logout").post(controller.logout);
  router.route("/me").get(auth.authenticate, controller.me);
  return router;
}
