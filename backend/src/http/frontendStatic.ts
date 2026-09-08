import fs from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";

export function mountFrontendStatic(app: Express, frontendDir: string | undefined): boolean {
  if (!frontendDir) {
    return false;
  }
  const indexFile = path.join(frontendDir, "index.html");
  if (!fs.existsSync(indexFile)) {
    return false;
  }

  app.use(express.static(frontendDir, { index: false }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      next();
      return;
    }
    if (request.path.startsWith("/api") || request.path === "/health" || request.path === "/ws") {
      next();
      return;
    }
    response.sendFile(indexFile);
  });
  return true;
}
