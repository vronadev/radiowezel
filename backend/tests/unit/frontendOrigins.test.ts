import { describe, expect, it } from "vitest";
import { parseFrontendOrigins } from "../../src/http/frontendOrigins.js";

describe("parseFrontendOrigins", () => {
  it("adds localhost aliases for a LAN origin on port 80", () => {
    const parsed = parseFrontendOrigins("http://10.1.0.5");
    expect(parsed.primary).toBe("http://10.1.0.5");
    expect(parsed.allowed).toEqual(
      expect.arrayContaining(["http://10.1.0.5", "http://localhost", "http://127.0.0.1", "http://[::1]"]),
    );
  });

  it("adds localhost aliases that keep a non-default port", () => {
    const parsed = parseFrontendOrigins("http://10.1.0.5:3001");
    expect(parsed.allowed).toEqual(
      expect.arrayContaining([
        "http://10.1.0.5:3001",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://[::1]:3001",
      ]),
    );
  });
});
