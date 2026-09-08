import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : "Internal error";
  console.error(err);
  if (response.headersSent) {
    return;
  }
  response.status(500).json({ message });
}
