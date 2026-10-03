import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { loadConfig } from "../../src/config/loadConfig.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";

const password = "test-only-password";
const hash = bcrypt.hashSync(password, 10);

function mockConfig(values: Record<string, unknown>) {
  vi.spyOn(fs, "readFileSync").mockReturnValue(
    JSON.stringify({
      jwtSecret: "test-only-secret",
      ...values,
    }),
  );
}

describe("admin password configuration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["test-only-password", ""])(
    "rejects the old adminPassword setting, including an empty value",
    (adminPassword) => {
      mockConfig({ adminPassword });

      expect(() => loadConfig()).toThrow(
        "adminPassword is no longer supported",
      );
    },
  );

  it.each([123, null, true, {}, []])(
    "rejects a non-string adminPasswordHash: %j",
    (adminPasswordHash) => {
      mockConfig({ adminPasswordHash });

      expect(() => loadConfig()).toThrow(
        "adminPasswordHash in config.json must be a string",
      );
    },
  );

  it.each([
    "test-only-password",
    hash.slice(0, -1),
    `${hash}x`,
    `${hash.slice(0, -1)}!`,
    hash.replace(/^\$2[aby]\$/, "$2x$"),
    hash.replace("$10$", "$03$"),
    hash.replace("$10$", "$32$"),
  ])("rejects a malformed bcrypt hash: %s", (adminPasswordHash) => {
    mockConfig({ adminPasswordHash });

    expect(() => loadConfig()).toThrow(
      "adminPasswordHash in config.json is not a valid bcrypt hash",
    );
  });

  it.each([undefined, ""])(
    "allows an absent or empty adminPasswordHash: %s",
    (adminPasswordHash) => {
      mockConfig({ adminPasswordHash });

      expect(loadConfig().adminPasswordHash).toBe(adminPasswordHash);
    },
  );

  it.each(["2a", "2b", "2y"])(
    "accepts the supported %s bcrypt prefix unchanged",
    (prefix) => {
      const configuredHash = hash.replace(/^\$2[aby]\$/, `$${prefix}$`);
      mockConfig({ adminPasswordHash: configuredHash });

      const config = loadConfig();

      expect(config.adminPasswordHash).toBe(configuredHash);
      expect(bcrypt.compareSync(password, configuredHash)).toBe(true);
      expect(bcrypt.compareSync("wrong-password", configuredHash)).toBe(false);
    },
  );

  it.each([false, true])(
    "stores the configured hash for an admin; existing user: %s",
    (existingUser) => {
      const database = openDatabase(":memory:");

      try {
        const { userService } = DataLayerFactory.create(database);
        const email = "admin@example.test";

        const existingId = existingUser
          ? userService.create(
              email,
              bcrypt.hashSync("old-test-password", 4),
              false,
            )
          : undefined;

        mockConfig({
          adminEmail: email,
          adminPasswordHash: hash,
        });

        const config = loadConfig();

        userService.ensureAdminUser(
          config.adminEmail!,
          config.adminPasswordHash!,
        );

        const user = userService.findByEmail(email);

        expect(user).toBeDefined();
        expect(user?.isAdmin).toBe(true);
        expect(user?.passwordHash).toBe(hash);

        if (existingUser) {
          expect(user?.id).toBe(existingId);
        }

        expect(bcrypt.compareSync(password, user!.passwordHash)).toBe(true);
        expect(
          bcrypt.compareSync("wrong-password", user!.passwordHash),
        ).toBe(false);
      } finally {
        database.close();
      }
    },
  );
});