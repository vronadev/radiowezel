import type { Response } from "express";
import { PollActionError } from "../services/pollActionError.js";

export function sendPollError(error: unknown, response: Response): void {
  if (error instanceof PollActionError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  throw error;
}
