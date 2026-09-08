import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { parsePlayHistoryLog } from "../services/playHistoryService.js";

export class PlayController {
  constructor(private readonly dataDir: string) {}

  getHistory = (_request: Request, response: Response): void => {
    const filePath = path.join(this.dataDir, "played-songs.log");
    let contents = "";
    try {
      contents = fs.readFileSync(filePath, "utf8");
    } catch {
      contents = "";
    }
    response.json({ plays: parsePlayHistoryLog(contents, new Date()) });
  };
}
