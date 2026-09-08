import { Router } from "express";
import type { PlaylistController } from "../controllers/playlistController.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createPlaylistRouter(controller: PlaylistController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/:id").get(auth.authenticate, controller.getPublicById);
  return router;
}

export function createAdminPlaylistRouter(controller: PlaylistController, auth: AuthMiddleware): Router {
  const router = Router();
  router
    .route("/")
    .get(auth.authenticate, auth.authorizeAdmin, controller.listAdmin)
    .post(auth.authenticate, auth.authorizeAdmin, asyncHandler(controller.create));
  router.route("/:id/sync").post(auth.authenticate, auth.authorizeAdmin, asyncHandler(controller.sync));
  router.route("/:id/songs").post(auth.authenticate, auth.authorizeAdmin, controller.addSong);
  router
    .route("/:playlistId/songs/:songId")
    .delete(auth.authenticate, auth.authorizeAdmin, controller.removeSong);
  router
    .route("/:id")
    .get(auth.authenticate, auth.authorizeAdmin, controller.getAdminById)
    .patch(auth.authenticate, auth.authorizeAdmin, controller.update)
    .delete(auth.authenticate, auth.authorizeAdmin, controller.delete);
  return router;
}
