import { describe, expect, it } from "vitest";
import { jwtClearCookieOptions, jwtCookieOptions } from "../../src/constants/authCookies.js";

describe("jwt cookie flags", () => {
  it("sets httpOnly and Secure when the frontend origin is https", () => {
    expect(jwtCookieOptions("https://radio.vrona.dev")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    expect(jwtClearCookieOptions("https://radio.vrona.dev").secure).toBe(true);
  });

  it("keeps httpOnly without Secure when the frontend origin is http", () => {
    expect(jwtCookieOptions("http://localhost")).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
    expect(jwtClearCookieOptions("http://10.1.0.5").secure).toBe(false);
  });
});
