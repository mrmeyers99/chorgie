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

const userId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const householdId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const kidId = "c47ac10b-58cc-4372-a567-0e02b2c3d479";
const requestId = "d47ac10b-58cc-4372-a567-0e02b2c3d479";

async function getMockClient() {
  const mod = await import("../src/db.js");
  // @ts-expect-error accessing internal mock
  return mod._mockClient as {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
}

function makeAccessToken() {
  return jwt.sign({ sub: userId, householdId }, process.env.JWT_SECRET!, {
    expiresIn: "15m",
  });
}

function makeAdminModeToken() {
  return jwt.sign(
    { sub: userId, householdId, type: "admin" },
    process.env.JWT_SECRET!,
    { expiresIn: "10m" },
  );
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    household_id: householdId,
    kid_id: kidId,
    enc_name: "enc-raked-leaves",
    requested_amount: "2.50",
    status: "pending",
    approved_amount: null,
    created_at: "2026-11-20T00:00:00.000Z",
    resolved_at: null,
    ...overrides,
  };
}

beforeEach(async () => {
  const mockClient = await getMockClient();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

describe("POST /chore-requests", () => {
  it("requires authentication", async () => {
    const res = await request(app)
      .post("/chore-requests")
      .send({ kid_id: kidId, enc_name: "enc" });
    expect(res.status).toBe(401);
  });

  it("creates a pending request without admin mode", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: kidId }] }) // kid check
      .mockResolvedValueOnce({ rows: [pendingRow()] }); // insert

    const res = await request(app)
      .post("/chore-requests")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({
        kid_id: kidId,
        enc_name: "enc-raked-leaves",
        requested_amount: 2.5,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO chore_requests"),
      [householdId, kidId, "enc-raked-leaves", 2.5],
    );
  });

  it("stores a null requested_amount when the kid leaves it blank", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: kidId }] })
      .mockResolvedValueOnce({
        rows: [pendingRow({ requested_amount: null })],
      });

    const res = await request(app)
      .post("/chore-requests")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ kid_id: kidId, enc_name: "enc-raked-leaves" });

    expect(res.status).toBe(201);
    expect(mockClient.query.mock.calls[1][1][3]).toBeNull();
  });

  it("rounds requested_amount to cents", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: kidId }] })
      .mockResolvedValueOnce({ rows: [pendingRow()] });

    await request(app)
      .post("/chore-requests")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ kid_id: kidId, enc_name: "enc", requested_amount: 1.239 });

    expect(mockClient.query.mock.calls[1][1][3]).toBe(1.24);
  });

  it("rejects a negative amount", async () => {
    const res = await request(app)
      .post("/chore-requests")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ kid_id: kidId, enc_name: "enc", requested_amount: -1 });
    expect(res.status).toBe(400);
  });

  it("rejects a missing name", async () => {
    const res = await request(app)
      .post("/chore-requests")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ kid_id: kidId, enc_name: "" });
    expect(res.status).toBe(400);
  });

  it("rejects a kid outside the household or inactive", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/chore-requests")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ kid_id: kidId, enc_name: "enc" });

    expect(res.status).toBe(400);
    expect(mockClient.query.mock.calls[0][1]).toEqual([kidId, householdId]);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });
});

describe("GET /chore-requests", () => {
  it("defaults to pending requests scoped to the household", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [pendingRow()] });

    const res = await request(app)
      .get("/chore-requests")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(mockClient.query.mock.calls[0][1]).toEqual([
      householdId,
      "pending",
      null,
    ]);
  });

  it("filters by status and kid", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/chore-requests?status=approved&kid_id=${kidId}`)
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(mockClient.query.mock.calls[0][1]).toEqual([
      householdId,
      "approved",
      kidId,
    ]);
  });

  it("rejects an unknown status", async () => {
    const res = await request(app)
      .get("/chore-requests?status=bogus")
      .set("Authorization", `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(400);
  });
});

describe("POST /chore-requests/:id/approve", () => {
  it("requires admin mode", async () => {
    const res = await request(app)
      .post(`/chore-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("credits the requested amount when no override is given", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [pendingRow()] }) // lock request
      .mockResolvedValueOnce({ rows: [{ balance: "12.50" }] }) // balance
      .mockResolvedValueOnce({
        rows: [pendingRow({ status: "approved", approved_amount: "2.50" })],
      }) // update request
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post(`/chore-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.balance).toBe("12.50");
    expect(mockClient.query.mock.calls[1][0]).toContain("FOR UPDATE");
    expect(mockClient.query.mock.calls[2][1]).toEqual([
      kidId,
      householdId,
      2.5,
    ]);
    expect(mockClient.query.mock.calls[3][1]).toEqual([
      requestId,
      householdId,
      2.5,
    ]);
    expect(mockClient.query.mock.calls[4][0]).toBe("COMMIT");
  });

  it("lets the admin override the amount (including $0)", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [pendingRow()] })
      .mockResolvedValueOnce({ rows: [{ balance: "10.00" }] })
      .mockResolvedValueOnce({
        rows: [pendingRow({ status: "approved", approved_amount: "0.00" })],
      })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/chore-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({ amount: 0 });

    expect(res.status).toBe(200);
    expect(mockClient.query.mock.calls[2][1][2]).toBe(0);
  });

  it("requires an amount when the kid didn't request one", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [pendingRow({ requested_amount: null })],
      })
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post(`/chore-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({});

    expect(res.status).toBe(400);
    expect(mockClient.query.mock.calls[2][0]).toBe("ROLLBACK");
  });

  it("returns 409 for an already-resolved request", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [pendingRow({ status: "rejected" })] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/chore-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({ amount: 1 });

    expect(res.status).toBe(409);
    expect(mockClient.query).toHaveBeenCalledTimes(3);
  });

  it("returns 404 for an unknown request", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/chore-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({});

    expect(res.status).toBe(404);
  });

  it("rolls back if the kid is no longer active", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [pendingRow()] })
      .mockResolvedValueOnce({ rows: [] }) // balance update matched nothing
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/chore-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({});

    expect(res.status).toBe(400);
    expect(mockClient.query.mock.calls[3][0]).toBe("ROLLBACK");
  });
});

describe("POST /chore-requests/:id/reject", () => {
  it("requires admin mode", async () => {
    const res = await request(app)
      .post(`/chore-requests/${requestId}/reject`)
      .set("Authorization", `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(403);
  });

  it("rejects a pending request without touching balance", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({
      rows: [pendingRow({ status: "rejected" })],
    });

    const res = await request(app)
      .post(`/chore-requests/${requestId}/reject`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query.mock.calls[0][0]).toContain("status = 'pending'");
  });

  it("returns 409 when already resolved", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: requestId }] });

    const res = await request(app)
      .post(`/chore-requests/${requestId}/reject`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken());

    expect(res.status).toBe(409);
  });

  it("returns 404 when not found", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post(`/chore-requests/${requestId}/reject`)
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken());

    expect(res.status).toBe(404);
  });
});
