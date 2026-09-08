export interface SendMailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface IEmailService {
  sendMail(payload: SendMailPayload): Promise<void>;
  sendMagicLink(email: string, token: string, type: "register" | "login", baseUrl: string): Promise<void>;
  sendSongApproved(email: string, songTitle: string, voteUrl: string): Promise<void>;
}
