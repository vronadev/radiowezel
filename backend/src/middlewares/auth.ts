import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ErrorMessages } from "../constants/errorMessages.js";
import type { UserService } from "../services/userService.js";

interface JwtPayload {
  id: string;
}

export class AuthMiddleware {
  constructor(
    private readonly userService: UserService,
    private readonly jwtSecret: string,
    private readonly playerKey?: string,
  ) {}

  authenticate = (request: Request, response: Response, next: NextFunction): void => {
    const token =
      request.cookies?.jwt ||
      (request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.slice(7)
        : null);

    if (!token) {
      console.log("Auth failed: no token provided");
      response.status(401).json({ message: ErrorMessages.missingToken });
      return;
    }

    try {
      const payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
      const user = this.userService.findPublicById(payload.id);
      if (!user) {
        response.status(401).json({ message: ErrorMessages.sessionExpired });
        return;
      }
      request.user = user;
      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Auth error:", message);
      response.status(401).json({ message: ErrorMessages.invalidToken });
    }
  };

  authorizeAdmin = (request: Request, response: Response, next: NextFunction): void => {
    if (!request.user?.isAdmin) {
      response.status(403).json({ message: ErrorMessages.forbidden });
      return;
    }
    next();
  };

  authorizePlayer = (request: Request, response: Response, next: NextFunction): void => {
    const headerKey = request.headers["x-player-key"];
    const queryKey = typeof request.query.playerKey === "string" ? request.query.playerKey : undefined;
    const key = (Array.isArray(headerKey) ? headerKey[0] : headerKey) || queryKey;
    if (this.playerKey && key !== this.playerKey) {
      response.status(401).json({ message: "Invalid player key" });
      return;
    }
    next();
  };
}
