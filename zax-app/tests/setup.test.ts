import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  configurationErrors,
  verifyDatabase,
  verifyPython,
} from "../scripts/verify-setup";
import { migrateDatabase } from "../server/_core/migrate";

const mocks = vi.hoisted(() => ({
  createConnection: vi.fn(),
  drizzle: vi.fn(),
  migrate: vi.fn(),
  spawnSync: vi.fn(),
}));
vi.mock("mysql2/promise", () => ({
  default: { createConnection: mocks.createConnection },
}));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("drizzle-orm/mysql2/migrator", () => ({ migrate: mocks.migrate }));
vi.mock("node:child_process", () => ({ spawnSync: mocks.spawnSync }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

const valid = {
  DATABASE_URL: "mysql://localhost/zax",
  MANUS_PROJECT_ID: "test-project",
  MANUS_OAUTH_API_URL: "https://auth.example.test",
  MANUS_OAUTH_PORTAL_URL: "https://portal.example.test",
  MANUS_JWT_SECRET: "a".repeat(64),
  OWNER_OPEN_ID: "test-owner",
};

describe("setup configuration", () => {
  it("accepts canonical and legacy server configuration", () => {
    expect(configurationErrors(valid)).toEqual([]);
    const {
      MANUS_PROJECT_ID,
      MANUS_JWT_SECRET,
      MANUS_OAUTH_API_URL,
      MANUS_OAUTH_PORTAL_URL,
      ...rest
    } = valid;
    expect(
      configurationErrors({
        ...rest,
        VITE_APP_ID: MANUS_PROJECT_ID,
        JWT_SECRET: MANUS_JWT_SECRET,
        OAUTH_SERVER_URL: MANUS_OAUTH_API_URL,
        VITE_OAUTH_PORTAL_URL: MANUS_OAUTH_PORTAL_URL,
      }),
    ).toEqual([]);
  });

  it("reports every missing required setting and rejects short secrets", () => {
    expect(configurationErrors({})).toHaveLength(6);
    expect(
      configurationErrors({ ...valid, MANUS_JWT_SECRET: "short" }),
    ).toEqual(["MANUS_JWT_SECRET must contain at least 32 bytes."]);
    expect(configurationErrors({ ...valid, MANUS_PROJECT_ID: " " })).toContain(
      "MANUS_PROJECT_ID is required.",
    );
  });

  it.each([
    ["DATABASE_URL", "sqlite:local.db"],
    ["DATABASE_URL", "mysql://localhost"],
    ["MANUS_OAUTH_API_URL", "http://auth.example.test"],
    ["MANUS_OAUTH_PORTAL_URL", "******auth.example.test"],
    ["EXPO_PUBLIC_API_BASE_URL", "not-a-url"],
    ["PORT", "3000oops"],
    ["PORT", "65536"],
    ["PORT", "0"],
    ["BUILT_IN_FORGE_API_KEY", "test-only"],
  ])("rejects invalid %s without printing its value", (name, value) => {
    const errors = configurationErrors({ ...valid, [name]: value });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).not.toContain(value);
  });

  it("permits loopback development and same-origin production API URLs", () => {
    expect(
      configurationErrors({
        ...valid,
        EXPO_PUBLIC_API_BASE_URL: "http://localhost:3000",
      }),
    ).toEqual([]);
    expect(
      configurationErrors({ ...valid, EXPO_PUBLIC_API_BASE_URL: "" }),
    ).toEqual([]);
  });

  it("keeps every required canonical setting in the environment template", () => {
    const template = readFileSync(".env.example", "utf8");
    for (const name of Object.keys(valid)) {
      expect(template).toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});

describe("database initialization", () => {
  it("requires a database URL before connecting", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(migrateDatabase()).rejects.toThrow("DATABASE_URL");
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it("locks migrations, uses the committed migration directory, and closes the connection", async () => {
    const connection = {
      query: vi.fn().mockResolvedValue([[{ acquired: 1 }]]),
      end: vi.fn(),
    };
    mocks.createConnection.mockResolvedValue(connection);
    mocks.drizzle.mockReturnValue("database");
    await migrateDatabase(valid.DATABASE_URL);
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining("GET_LOCK"),
    );
    expect(mocks.migrate).toHaveBeenCalledWith("database", {
      migrationsFolder: expect.stringMatching(/[/\\]drizzle$/),
    });
    expect(connection.end).toHaveBeenCalledOnce();
  });

  it("fails closed and releases the connection when migrations fail", async () => {
    const connection = {
      query: vi.fn().mockResolvedValue([[{ acquired: 1 }]]),
      end: vi.fn(),
    };
    mocks.createConnection.mockResolvedValue(connection);
    mocks.migrate.mockRejectedValue(new Error("DDL failed"));
    await expect(migrateDatabase(valid.DATABASE_URL)).rejects.toThrow(
      "DDL failed",
    );
    expect(connection.end).toHaveBeenCalledOnce();
  });

  it("does not migrate without the lock", async () => {
    const connection = {
      query: vi.fn().mockResolvedValue([[{ acquired: 0 }]]),
      end: vi.fn(),
    };
    mocks.createConnection.mockResolvedValue(connection);
    await expect(migrateDatabase(valid.DATABASE_URL)).rejects.toThrow(
      "migration lock",
    );
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(connection.end).toHaveBeenCalledOnce();
  });

  it("rejects an empty migration history and closes the verification connection", async () => {
    const connection = { query: vi.fn().mockResolvedValue([[]]), end: vi.fn() };
    mocks.createConnection.mockResolvedValue(connection);
    await expect(verifyDatabase()).rejects.toThrow(
      "Missing or changed migrations",
    );
    expect(connection.end).toHaveBeenCalledOnce();
  });
});

describe("Python verification", () => {
  it("uses the same executable as the server and imports all workers", () => {
    vi.stubEnv("PYTHON_EXECUTABLE", "/custom/python");
    mocks.spawnSync.mockReturnValue({ status: 0 });
    verifyPython();
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      "/custom/python",
      [
        "-c",
        expect.stringContaining(
          "import pattern_indexer, research_engine, orderbook_research",
        ),
      ],
      expect.objectContaining({ timeout: 60000 }),
    );
  });

  it("fails for missing dependencies or an unavailable Python runtime", () => {
    mocks.spawnSync.mockReturnValue({ status: 1 });
    expect(verifyPython).toThrow("Python 3.11+ workers unavailable");
    mocks.spawnSync.mockReturnValue({
      error: new Error("ENOENT"),
      status: null,
    });
    expect(verifyPython).toThrow("Python 3.11+ workers unavailable");
  });
});
