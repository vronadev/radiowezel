import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { mountFrontendStatic } from "../../src/http/frontendStatic.js";

async function listen(app: express.Express): Promise<{ server: http.Server; baseUrl: string }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected tcp address");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("frontend static mount", () => {
  const dirs: string[] = [];
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves the Vite index and SPA fallback without touching /api JSON 404s", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-static-"));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>app</title>");
    fs.writeFileSync(path.join(dir, "asset.txt"), "asset-body");

    const app = express();
    app.get("/health", (_request, response) => {
      response.json({ status: "ok", phase: 6 });
    });
    app.use("/api", (_request, response) => {
      response.status(404).json({ message: "Not found" });
    });
    expect(mountFrontendStatic(app, dir)).toBe(true);
    app.use((_request, response) => {
      response.status(404).json({ message: "Not found" });
    });

    const { server, baseUrl } = await listen(app);
    servers.push(server);

    const home = await fetch(`${baseUrl}/vote`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("<title>app</title>");

    const asset = await fetch(`${baseUrl}/asset.txt`);
    expect(await asset.text()).toBe("asset-body");

    const health = await fetch(`${baseUrl}/health`);
    expect(await health.json()).toEqual({ status: "ok", phase: 6 });

    const missingApi = await fetch(`${baseUrl}/api/missing`);
    expect(missingApi.status).toBe(404);
    expect(await missingApi.json()).toEqual({ message: "Not found" });
  });

  it("does nothing when the frontend build is absent", () => {
    const app = express();
    expect(mountFrontendStatic(app, path.join(os.tmpdir(), "no-frontend-build"))).toBe(false);
  });
});
