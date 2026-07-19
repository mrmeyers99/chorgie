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

function makeExpiredAdminModeToken() {
  return jwt.sign(
    { sub: "user-uuid", householdId: "household-uuid", type: "admin" },
    process.env.JWT_SECRET as string,
    { expiresIn: -1 },
  );
}

describe("GET /kids", () => {
  beforeEach(async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it("returns kid profiles for the household", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: "kid-1",
          enc_display_name: "enc-name",
          avatar_id: "corgi-1",
          sort_order: 0,
          balance: "0.00",
          is_active: true,
          created_at: "2026-05-25T00:00:00.000Z",
        },
      ],
    });

    const res = await request(app)
      .get("/kids")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.kids).toHaveLength(1);
  });
});

describe("POST /kids", () => {
  beforeEach(async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it("requires admin mode token", async () => {
    const res = await request(app)
      .post("/kids")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ enc_display_name: "enc-name", avatar_id: "corgi-1" });

    expect(res.status).toBe(403);
  });

  it("creates a kid profile with admin mode", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: "kid-1",
          enc_display_name: "enc-name",
          avatar_id: "corgi-1",
          sort_order: 0,
          balance: "0.00",
          is_active: true,
          created_at: "2026-05-25T00:00:00.000Z",
        },
      ],
    });

    const res = await request(app)
      .post("/kids")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({ enc_display_name: "enc-name", avatar_id: "corgi-1" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("kid-1");
  });

  it("rejects malformed admin mode token", async () => {
    const res = await request(app)
      .post("/kids")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", "not-a-jwt")
      .send({ enc_display_name: "enc-name", avatar_id: "corgi-1" });

    expect(res.status).toBe(403);
  });

  it("rejects expired admin mode token", async () => {
    const res = await request(app)
      .post("/kids")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeExpiredAdminModeToken())
      .send({ enc_display_name: "enc-name", avatar_id: "corgi-1" });

    expect(res.status).toBe(403);
  });

  it("rejects admin mode token with wrong user or household claims", async () => {
    const res = await request(app)
      .post("/kids")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set(
        "x-admin-mode-token",
        jwt.sign(
          {
            sub: "different-user",
            householdId: "different-household",
            type: "admin",
          },
          process.env.JWT_SECRET as string,
          { expiresIn: "10m" },
        ),
      )
      .send({ enc_display_name: "enc-name", avatar_id: "corgi-1" });

    expect(res.status).toBe(403);
  });

  it("rejects non-admin token in admin mode header", async () => {
    const res = await request(app)
      .post("/kids")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set(
        "x-admin-mode-token",
        jwt.sign(
          { sub: "user-uuid", householdId: "household-uuid", type: "refresh" },
          process.env.JWT_SECRET as string,
          { expiresIn: "10m" },
        ),
      )
      .send({ enc_display_name: "enc-name", avatar_id: "corgi-1" });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /kids/:id", () => {
  beforeEach(async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it("requires admin mode token", async () => {
    const res = await request(app)
      .delete("/kids/kid-1")
      .set("Authorization", "Bearer " + makeAccessToken());

    expect(res.status).toBe(403);
  });

  it("deactivates a kid profile with admin mode", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: "kid-1" }] });

    const res = await request(app)
      .delete("/kids/kid-1")
      .set("Authorization", "Bearer " + makeAccessToken())
      .set("x-admin-mode-token", makeAdminModeToken());

    expect(res.status).toBe(204);
  });

  it("returns 404 when kid not found", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete("/kids/nonexistent")
      .set("Authorization", "Bearer " + makeAccessToken())
      .set("x-admin-mode-token", makeAdminModeToken());

    expect(res.status).toBe(404);
  });
});

describe("PATCH /kids/:id", () => {
  beforeEach(async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it("updates a kid profile with admin mode", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: "kid-1",
          enc_display_name: "enc-name-2",
          avatar_id: "corgi-2",
          sort_order: 1,
          balance: "1.25",
          is_active: true,
          created_at: "2026-05-25T00:00:00.000Z",
        },
      ],
    });

    const res = await request(app)
      .patch("/kids/kid-1")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({ avatar_id: "corgi-2", sort_order: 1 });

    expect(res.status).toBe(200);
    expect(res.body.avatar_id).toBe("corgi-2");
  });
});

describe("GET /kids/:id/history", () => {
  const kidId = "11111111-1111-1111-1111-111111111111";

  function decodeCursor(cursor: string) {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const sepIndex = decoded.lastIndexOf("|");
    return {
      occurredAt: decoded.slice(0, sepIndex),
      id: decoded.slice(sepIndex + 1),
    };
  }

  beforeEach(async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/kids/kid-1/history");

    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid kid UUID format", async () => {
    const res = await request(app)
      .get("/kids/not-a-uuid/history")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid kid ID format.");
  });

  it.each(["0", "101", "abc", "-1"])(
    "returns 400 for invalid limit=%s",
    async (limit) => {
      const res = await request(app)
        .get(`/kids/${kidId}/history?limit=${limit}`)
        .set("Authorization", `Bearer ${makeAccessToken()}`);

      expect(res.status).toBe(400);
    },
  );

  it("returns 400 for an undecodable cursor", async () => {
    const res = await request(app)
      .get(`/kids/${kidId}/history?cursor=not-valid-base64url!!`)
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid cursor.");
  });

  it("returns 404 when kid not found in household", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/kids/00000000-0000-0000-0000-000000000000/history")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Kid profile not found.");
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it("returns merged completions and payouts in the order the query gives them", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: kidId }] });
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: "payout-1",
          type: "payout",
          occurred_at: "2026-05-27T00:00:00.000Z",
          amount: "3.00",
          chore_id: null,
          chore_name: null,
          enc_notes: "enc-cash",
        },
        {
          id: "completion-2",
          type: "completion",
          occurred_at: "2026-05-26T00:00:00.000Z",
          amount: "5.00",
          chore_id: "chore-1",
          chore_name: "enc-chore-2",
          enc_notes: null,
        },
        {
          id: "completion-1",
          type: "completion",
          occurred_at: "2026-05-25T00:00:00.000Z",
          amount: "2.50",
          chore_id: "chore-1",
          chore_name: "enc-chore-1",
          enc_notes: null,
        },
      ],
    });

    const res = await request(app)
      .get(`/kids/${kidId}/history`)
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.entries[0].id).toBe("payout-1");
    expect(res.body.entries[1].id).toBe("completion-2");
    expect(res.body.entries[2].id).toBe("completion-1");
    expect(res.body.next_cursor).toBeNull();
  });

  it("uses default limit and no cursor filter on the first page", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: kidId }] });
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/kids/${kidId}/history`)
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      kidId,
      "household-uuid",
      null,
      null,
      21,
    ]);
  });

  it("passes decoded cursor values through to the query for a subsequent page", async () => {
    const mockClient = await getMockClient();
    const cursorId = "99999999-9999-9999-9999-999999999999";
    const cursor = Buffer.from(`2026-05-20T00:00:00.000Z|${cursorId}`).toString(
      "base64url",
    );
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: kidId }] });
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/kids/${kidId}/history?cursor=${cursor}`)
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      kidId,
      "household-uuid",
      "2026-05-20T00:00:00.000Z",
      cursorId,
      21,
    ]);
  });

  it("sets next_cursor and trims the extra row when more results exist", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: kidId }] });
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: "completion-3",
          type: "completion",
          occurred_at: "2026-05-27T00:00:00.000Z",
          amount: "1.00",
          chore_id: "chore-1",
          chore_name: "enc-chore-3",
          enc_notes: null,
        },
        {
          id: "completion-2",
          type: "completion",
          occurred_at: "2026-05-26T00:00:00.000Z",
          amount: "5.00",
          chore_id: "chore-1",
          chore_name: "enc-chore-2",
          enc_notes: null,
        },
      ],
    });

    const res = await request(app)
      .get(`/kids/${kidId}/history?limit=1`)
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].id).toBe("completion-3");
    expect(res.body.next_cursor).not.toBeNull();
    expect(decodeCursor(res.body.next_cursor)).toEqual({
      occurredAt: "2026-05-27T00:00:00.000Z",
      id: "completion-3",
    });
  });

  it("leaves next_cursor null when the result fits within the limit", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: kidId }] });
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: "completion-1",
          type: "completion",
          occurred_at: "2026-05-25T00:00:00.000Z",
          amount: "2.50",
          chore_id: "chore-1",
          chore_name: "enc-chore-1",
          enc_notes: null,
        },
      ],
    });

    const res = await request(app)
      .get(`/kids/${kidId}/history?limit=5`)
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.next_cursor).toBeNull();
  });
});
