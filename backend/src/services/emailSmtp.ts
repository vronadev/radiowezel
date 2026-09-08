import nodemailer from "nodemailer";
import type { SmtpConfig } from "../@types/models.js";
import type { IEmailService, SendMailPayload } from "../interfaces/IEmailService.js";
import { logEvent } from "./logger.js";

export interface MailTransporter {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<unknown>;
}

export type TransportFactory = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
}) => MailTransporter;

export class EmailSMTP implements IEmailService {
  private readonly transporter: MailTransporter | null;
  private readonly fromEmail: string;

  constructor(
    smtp: SmtpConfig,
    createTransport: TransportFactory = (options) => nodemailer.createTransport(options),
  ) {
    this.fromEmail = smtp.from || "zsiradio.system@gmail.com";
    if (!smtp.host) {
      this.transporter = null;
      return;
    }
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: smtp.secure === true,
      auth: smtp.user
        ? {
            user: smtp.user || "",
            pass: smtp.pass || "",
          }
        : undefined,
    });
  }

  async sendMail(payload: SendMailPayload): Promise<void> {
    if (!this.transporter) {
      logEvent("email", "skipped_unconfigured", { to: payload.to, subject: payload.subject });
      return;
    }
    await this.transporter.sendMail({
      from: this.fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    logEvent("email", "sent", { to: payload.to, subject: payload.subject });
  }

  async sendSongApproved(email: string, songTitle: string, voteUrl: string): Promise<void> {
    const subject = `Twoja piosenka ${songTitle} została zatwierdzona - Zagłosuj na nią teraz!`;
    const html = `
    <p>Cześć,</p>
    <p>Twoja piosenka <strong>${escapeHtml(songTitle)}</strong> została zatwierdzona.</p>
    <p>Zagłosuj na nią teraz: <a href="${voteUrl}">${voteUrl}</a></p>
  `;
    await this.sendMail({ to: email, subject, html, text: `${subject}\n${voteUrl}` });
  }

  async sendMagicLink(
    email: string,
    token: string,
    type: "register" | "login",
    baseUrl: string,
  ): Promise<void> {
    const verifyUrl = `${baseUrl.replace(/\/$/, "")}/auth/verify?token=${encodeURIComponent(token)}`;
    const isRegister = type === "register";
    const subject = isRegister ? "Potwierdź rejestrację – ZSI Radio" : "Link do logowania – ZSI Radio";
    const html = `
    <p>Cześć,</p>
    <p>${isRegister ? "Kliknij poniższy link, aby potwierdzić rejestrację i zalogować się:" : "Kliknij poniższy link, aby zalogować się do ZSI Radio:"}</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>Link jest ważny 1 godzinę.</p>
    <p>Jeśli to nie Ty, zignoruj tę wiadomość.</p>
  `;
    await this.sendMail({ to: email, subject, html, text: verifyUrl });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
