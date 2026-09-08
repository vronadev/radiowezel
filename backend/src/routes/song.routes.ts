import { Router } from "express";
import type { SongController } from "../controllers/songController.js";
import type { AuthMiddleware } from "../middlewares/auth.js";

export function createSongRouter(controller: SongController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/library").get(auth.authenticate, controller.getLibrary);
  router.route("/ranking").get(auth.authenticate, controller.getRanking);
  router.route("/:id/file").get(auth.authenticate, controller.getFile);
  return router;
}

export function createAdminSongRouter(controller: SongController, auth: AuthMiddleware): Router {
  const router = Router();
  router.route("/pending").get(auth.authenticate, auth.authorizeAdmin, controller.listPending);
  router.route("/download-queue").get(auth.authenticate, auth.authorizeAdmin, controller.getDownloadQueue);
  router.route("/:id/download-status").get(auth.authenticate, auth.authorizeAdmin, controller.getDownloadStatus);
  router.route("/:id/permanent").delete(auth.authenticate, auth.authorizeAdmin, controller.deletePermanent);
  router.route("/:id/queue-votes").patch(auth.authenticate, auth.authorizeAdmin, controller.setQueueVotes);
  router.route("/:id/verify").post(auth.authenticate, auth.authorizeAdmin, controller.verify);
  router.route("/:id").delete(auth.authenticate, auth.authorizeAdmin, controller.deletePending);
  return router;
}
