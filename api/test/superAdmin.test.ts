import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";

vi.mock("../src/db.js", () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return {
    pool: {
      connect: vi.fn(() => Promise.resolve(mockClient)),
      query: vi.fn(),
    },
    connectToDatabase: vi.fn(),
    _mockClient: mockClient,
  };
});

process.env.JWT_SECRET = "test-secret-for-unit-tests";

async function getMockClient() {
  const mod = await import("../src/db.js");
  // @ts-expect-error accessing internal mock
  return mod._mockClient as {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
}

function makeAccessToken() {
  return jwt.sign(
    { sub: "user-uuid", householdId: "household-uuid" },
    process.env.JWT_SECRET as string,
    { expiresIn: "15m" },
  );
}

function makeAdminModeToken() {
  return jwt.sign(
    { sub: "user-uuid", householdId: "household-uuid", type: "admin" },
    process.env.JWT_SECRET as string,
    { expiresIn: "10m" },
  );
}

describe("GET /super-admin/households", () => {
  beforeEach(async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it("returns 401 without an access token", async () => {
    const res = await request(app).get("/super-admin/households");
    expect(res.status).toBe(401);
  });

  it("returns 403 without an admin-mode token", async () => {
    const mockClient = await getMockClient();
    const res = await request(app)
      .get("/super-admin/households")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(403);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a super admin", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({
      rows: [{ is_super_admin: false }],
    });

    const res = await request(app)
      .get("/super-admin/households")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/super admin/i);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [
      "user-uuid",
      "household-uuid",
    ]);
  });

  it("returns 403 when the user row no longer exists", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/super-admin/households")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken());

    expect(res.status).toBe(403);
  });

  it("lists every household with its completion count for a super admin", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ is_super_admin: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "household-b",
            created_at: new Date("2026-02-01T00:00:00.000Z"),
            timezone: "Europe/London",
            completion_count: "0",
          },
          {
            id: "household-a",
            created_at: new Date("2026-01-01T00:00:00.000Z"),
            timezone: "America/Chicago",
            completion_count: "42",
          },
        ],
      });

    const res = await request(app)
      .get("/super-admin/households")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      households: [
        {
          id: "household-b",
          created_at: "2026-02-01T00:00:00.000Z",
          timezone: "Europe/London",
          completion_count: 0,
        },
        {
          id: "household-a",
          created_at: "2026-01-01T00:00:00.000Z",
          timezone: "America/Chicago",
          completion_count: 42,
        },
      ],
    });
    const listQuery = mockClient.query.mock.calls[1][0] as string;
    expect(listQuery).toMatch(/LEFT JOIN chore_completions/);
    expect(mockClient.release).toHaveBeenCalledTimes(2);
  });
});
