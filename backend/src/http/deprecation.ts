import type { Response } from "express";
import { logEvent } from "../services/logger.js";

/** Marks a response whose route is still served, and records which call to use instead. */
export function markDeprecatedRoute(response: Response, route: string, replacement: string): void {
  response.setHeader("Deprecation", "true");
  logEvent("http", "deprecated_route", { route, replacement });
}
