import type { CookieOptions } from "express";

function originIsHttps(frontendOrigin: string): boolean {
  try {
    return new URL(frontendOrigin).protocol === "https:";
  } catch {
    return frontendOrigin.trim().toLowerCase().startsWith("https:");
  }
}

export function jwtCookieOptions(frontendOrigin: string): CookieOptions {
  return {
    httpOnly: true,
    secure: originIsHttps(frontendOrigin),
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function jwtClearCookieOptions(frontendOrigin: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: originIsHttps(frontendOrigin),
  };
}
