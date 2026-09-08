import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import bcrypt from "bcryptjs";
import { createApp } from "./app.js";
import { loadConfig } from "./config/loadConfig.js";
import { ApplicationFactory } from "./factories/applicationFactory.js";

const config = loadConfig();
const application = ApplicationFactory.create(config);

if (config.adminEmail && config.adminPassword) {
  const hash = bcrypt.hashSync(config.adminPassword, 10);
  application.dataLayer.userService.ensureAdminUser(config.adminEmail, hash);
}

const app = createApp(application);
const server = http.createServer(app);
application.realtime.attach(server);

server.listen(config.port, () => {
  const hasUi = fs.existsSync(path.join(config.frontendDir, "index.html"));
  console.log(
    `Radiowęzeł on http://localhost:${config.port} (${hasUi ? "UI+API" : "API"}) (db: ${config.dbPath})`,
  );
  application.queueManager.refreshQueueFile();
  application.verification.recover();
  application.player.play();
});
