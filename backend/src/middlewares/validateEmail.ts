import type { NextFunction, Request, RequestHandler, Response } from "express";
import { allowedEmailDomainMessage, ErrorMessages } from "../constants/errorMessages.js";

export function createSchoolEmailValidator(domain: string): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const mail = String(request.body?.email || "")
      .trim()
      .toLowerCase();
    if (!mail) {
      response.status(400).json({ message: ErrorMessages.emailRequired });
      return;
    }
    if (!mail.endsWith("@" + domain)) {
      response.status(400).json({ message: allowedEmailDomainMessage(domain) });
      return;
    }
    if (mail.includes("+")) {
      response.status(400).json({ message: ErrorMessages.plusInEmail });
      return;
    }
    request.body = { ...request.body, email: mail };
    next();
  };
}
