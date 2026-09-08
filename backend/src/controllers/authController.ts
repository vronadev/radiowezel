import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { jwtClearCookieOptions, jwtCookieOptions } from "../constants/authCookies.js";
import { allowedEmailDomainMessage, ErrorMessages } from "../constants/errorMessages.js";
import type { AppConfig } from "../@types/models.js";
import type { EmailSMTP } from "../services/emailSmtp.js";
import type { EmailTokenService } from "../services/emailTokenService.js";
import type { UserService } from "../services/userService.js";

export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly emailTokenService: EmailTokenService,
    private readonly email: EmailSMTP,
    private readonly config: AppConfig,
  ) {}

  register = async (request: Request, response: Response): Promise<void> => {
    const mail = String(request.body?.email || "");
    let user = this.userService.findByEmail(mail);
    if (!user) {
      const hash = bcrypt.hashSync(crypto.randomUUID(), 10);
      const isAdmin = this.config.adminEmails.includes(mail);
      this.userService.create(mail, hash, isAdmin);
    }
    const token = this.emailTokenService.create(mail, "register");
    await this.email.sendMagicLink(mail, token, "register", this.config.frontendOrigin).catch((err: unknown) => {
      console.error("Send email error:", err);
    });
    response.status(201).json({
      success: true,
      message: "Wysłano link weryfikacyjny na adres e-mail. Kliknij go, aby się zalogować.",
    });
  };

  sendMagicLink = async (request: Request, response: Response): Promise<void> => {
    const mail = String(request.body?.email || "");
    const user = this.userService.findByEmail(mail);
    if (!user) {
      response.status(404).json({ message: ErrorMessages.accountNotFound });
      return;
    }
    const token = this.emailTokenService.create(mail, "login");
    await this.email.sendMagicLink(mail, token, "login", this.config.frontendOrigin).catch((err: unknown) => {
      console.error("Send email error:", err);
    });
    response.json({ success: true, message: "Wysłano link do logowania na adres e-mail." });
  };

  verify = (request: Request, response: Response): void => {
    const { token } = request.query;
    if (!token || typeof token !== "string") {
      response.status(400).json({ message: ErrorMessages.missingToken });
      return;
    }
    const row = this.emailTokenService.consumeValid(token);
    if (!row) {
      response.status(400).json({ message: ErrorMessages.linkExpired });
      return;
    }
    const user = this.userService.findByEmail(row.email);
    if (!user) {
      response.status(400).json({ message: ErrorMessages.userNotFound });
      return;
    }
    const isAdmin = user.isAdmin || this.config.adminEmails.includes(user.email);
    const jwtToken = jwt.sign({ id: user.id, email: user.email, isAdmin }, this.config.jwtSecret, {
      expiresIn: "7d",
    });
    response.cookie("jwt", jwtToken, jwtCookieOptions(this.config.frontendOrigin));
    response.json({ token: jwtToken });
  };

  login = (request: Request, response: Response): void => {
    const { email, password } = request.body || {};
    if (!email || !password) {
      response.status(400).json({ message: ErrorMessages.emailAndPasswordRequired });
      return;
    }
    const domain = this.config.allowedEmailDomain;
    if (!String(email).endsWith("@" + domain)) {
      response.status(400).json({ message: allowedEmailDomainMessage(domain) });
      return;
    }
    const user = this.userService.findByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      response.status(401).json({ message: ErrorMessages.invalidCredentials });
      return;
    }
    const isAdmin = user.isAdmin || this.config.adminEmails.includes(email);
    if (!user.isAdmin && isAdmin) {
      this.userService.setAdmin(user.id, true);
    }
    const token = jwt.sign({ id: user.id, email: user.email, isAdmin }, this.config.jwtSecret, { expiresIn: "7d" });
    response.cookie("jwt", token, jwtCookieOptions(this.config.frontendOrigin));
    response.json({ token });
  };

  logout = (_request: Request, response: Response): void => {
    response.clearCookie("jwt", jwtClearCookieOptions(this.config.frontendOrigin));
    response.json({ success: true });
  };

  me = (request: Request, response: Response): void => {
    response.json({
      user: {
        id: request.user?.id,
        email: request.user?.email,
        isAdmin: request.user?.isAdmin,
      },
    });
  };
}
