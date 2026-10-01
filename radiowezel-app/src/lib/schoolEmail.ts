import { ALLOWED_EMAIL_DOMAIN } from "@/types/api";

export function schoolEmailDomain(): string {
  const fromEnv = import.meta.env?.VITE_ALLOWED_EMAIL_DOMAIN;
  const raw = typeof fromEnv === "string" && fromEnv.trim() ? fromEnv : ALLOWED_EMAIL_DOMAIN;
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function ghostDomainText(value: string, domain = schoolEmailDomain()): string {
  if (!value) {
    return "";
  }
  const at = value.indexOf("@");
  if (at === -1) {
    return `@${domain}`;
  }
  if (value.indexOf("@", at + 1) !== -1) {
    return "";
  }
  const typedDomain = value.slice(at + 1);
  if (domain.startsWith(typedDomain.toLowerCase())) {
    return domain.slice(typedDomain.length);
  }
  return "";
}

export type ResolvedSchoolEmail =
  | { ok: true; email: string }
  | { ok: false; reason: "empty" | "plus" | "invalid-domain" };

export function resolveSchoolEmail(input: string, domain = schoolEmailDomain()): ResolvedSchoolEmail {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.includes("+")) {
    return { ok: false, reason: "plus" };
  }
  const at = trimmed.indexOf("@");
  if (at === -1) {
    return { ok: true, email: `${trimmed}@${domain}` };
  }
  if (trimmed.toLowerCase().endsWith(`@${domain}`)) {
    return { ok: true, email: trimmed };
  }
  return { ok: false, reason: "invalid-domain" };
}
