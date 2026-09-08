import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import { ControllerFactory } from "./factories/controllerFactory.js";
import type { Application } from "./factories/applicationFactory.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { notFound } from "./middlewares/notFound.js";
import { createSchoolEmailValidator } from "./middlewares/validateEmail.js";
import { createApiRouter } from "./routes/index.js";
import { mountFrontendStatic } from "./http/frontendStatic.js";

export function createApp(application: Application): Express {
  const app = express();
  app.disable("etag");
  app.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(cookieParser());
  app.use(express.json());
  app.use(
    cors({
      origin: application.config.frontendOrigins,
      credentials: true,
    }),
  );

  const controllers = ControllerFactory.create(application);
  const requireSchoolEmail = createSchoolEmailValidator(application.config.allowedEmailDomain);

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      phase: 7,
      effectivePlaylistId: application.dataLayer.playlistService.getEffectivePlaylistId(),
      paused: application.player.getStatus().paused,
    });
  });

  app.use("/api", createApiRouter(application.auth, controllers, requireSchoolEmail));
  mountFrontendStatic(app, application.config.frontendDir);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
