import { describe, expect, it, vi } from "vitest";
import { EmailSMTP } from "../../src/services/emailSmtp.js";

describe("EmailSMTP", () => {
  it("creates a transport with SMTP auth and sends a login magic link", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const createTransport = vi.fn().mockReturnValue({ sendMail });
    const email = new EmailSMTP(
      {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        user: "radio",
        pass: "secret",
        from: "radio@example.com",
      },
      createTransport,
    );

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "radio", pass: "secret" },
    });

    await email.sendMagicLink("user@zsi.kielce.pl", "token-1", "login", "http://localhost/");
    const payload = sendMail.mock.calls[0]?.[0] as { to: string; subject: string; text: string; from: string; html: string };
    expect(payload.from).toBe("radio@example.com");
    expect(payload.to).toBe("user@zsi.kielce.pl");
    expect(payload.subject).toContain("logowania");
    expect(payload.text).toBe("http://localhost/auth/verify?token=token-1");
    expect(payload.html).toContain("token-1");
  });

  it("sends a registration magic link with the register subject", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const email = new EmailSMTP(
      { host: "smtp.example.com", port: 465, secure: true, from: "from@example.com" },
      () => ({ sendMail }),
    );
    await email.sendMagicLink("user@zsi.kielce.pl", "abc", "register", "https://radio.example/");
    const payload = sendMail.mock.calls[0]?.[0] as { subject: string; text: string };
    expect(payload.subject).toContain("rejestrację");
    expect(payload.text).toBe("https://radio.example/auth/verify?token=abc");
  });

  it("sends a song-approved notification with the required subject", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const email = new EmailSMTP(
      { host: "smtp.example.com", port: 587, secure: false, from: "from@example.com" },
      () => ({ sendMail }),
    );
    await email.sendSongApproved("user@zsi.kielce.pl", "Hit", "http://localhost/vote");
    const payload = sendMail.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
    expect(payload.to).toBe("user@zsi.kielce.pl");
    expect(payload.subject).toBe("Twoja piosenka Hit została zatwierdzona - Zagłosuj na nią teraz!");
    expect(payload.text).toContain("http://localhost/vote");
  });

  it("does not send when SMTP host is missing", async () => {
    const sendMail = vi.fn();
    const email = new EmailSMTP({ port: 587, secure: false }, () => ({ sendMail }));
    await email.sendMail({ to: "a@b.c", subject: "x", text: "y" });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
