import type { Request, Response } from "express";
import { ErrorMessages } from "../constants/errorMessages.js";

export function notFound(_request: Request, response: Response): void {
  response.status(404).json({ message: ErrorMessages.notFound });
}
