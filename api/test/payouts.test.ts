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
    {
      sub: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      householdId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    },
    process.env.JWT_SECRET as string,
    { expiresIn: "15m" },
  );
}

function makeAdminModeToken() {
  return jwt.sign(
    {
      sub: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      householdId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      type: "admin",
    },
    process.env.JWT_SECRET as string,
    { expiresIn: "10m" },
  );
}

describe("POST /payouts", () => {
  beforeEach(async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it("requires admin mode token", async () => {
    const res = await request(app)
      .post("/payouts")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .send({ kid_id: "c47ac10b-58cc-4372-a567-0e02b2c3d479", amount: 5 });

    expect(res.status).toBe(403);
  });

  it("creates a payout for the given amount and decrements balance", async () => {
    const mockClient = await getMockClient();

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          { id: "c47ac10b-58cc-4372-a567-0e02b2c3d479", balance: "23.00" },
        ],
      }) // kid check
      .mockResolvedValueOnce({
        // payout insert
        rows: [
          {
            id: "f47ac10b-58cc-4372-a567-0e02b2c3d470",
            household_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
            kid_id: "c47ac10b-58cc-4372-a567-0e02b2c3d479",
            amount: "10.00",
            enc_notes: "Cash payment",
            paid_at: "2026-05-31T00:00:00.000Z",
            created_at: "2026-05-31T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // update kid balance
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post("/payouts")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({
        kid_id: "c47ac10b-58cc-4372-a567-0e02b2c3d479",
        amount: 10,
        enc_notes: "Cash payment",
      });

    expect(res.status).toBe(201);
    expect(res.body.kid_id).toBe("c47ac10b-58cc-4372-a567-0e02b2c3d479");
    expect(res.body.amount).toBe("10.00");
    expect(res.body.enc_notes).toBe("Cash payment");
    expect(res.body.completion_count).toBeUndefined();
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("fails when kid not found", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // kid check

    const res = await request(app)
      .post("/payouts")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({ kid_id: "c47ac10b-58cc-4372-a567-0e02b2c3d479", amount: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Kid profile not found.");
  });

  it("fails when amount exceeds balance", async () => {
    const mockClient = await getMockClient();

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "c47ac10b-58cc-4372-a567-0e02b2c3d479", balance: "5.00" }],
      }); // kid check

    const res = await request(app)
      .post("/payouts")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({ kid_id: "c47ac10b-58cc-4372-a567-0e02b2c3d479", amount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "Payout amount cannot exceed the kid's current balance.",
    );
  });

  it("rejects a non-positive amount", async () => {
    const mockClient = await getMockClient();

    const res = await request(app)
      .post("/payouts")
      .set("Authorization", `Bearer ${makeAccessToken()}`)
      .set("x-admin-mode-token", makeAdminModeToken())
      .send({ kid_id: "c47ac10b-58cc-4372-a567-0e02b2c3d479", amount: 0 });

    expect(res.status).toBe(400);
    expect(mockClient.query).not.toHaveBeenCalled();
  });
});

describe("GET /payouts/:id", () => {
  beforeEach(async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get(
      "/payouts/f47ac10b-58cc-4372-a567-0e02b2c3d471",
    );

    expect(res.status).toBe(401);
  });

  it("returns the payout", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: "f47ac10b-58cc-4372-a567-0e02b2c3d471",
          household_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          kid_id: "c47ac10b-58cc-4372-a567-0e02b2c3d479",
          amount: "10.00",
          enc_notes: "Cash",
          paid_at: "2026-05-31T00:00:00.000Z",
          created_at: "2026-05-31T00:00:00.000Z",
        },
      ],
    });

    const res = await request(app)
      .get("/payouts/f47ac10b-58cc-4372-a567-0e02b2c3d471")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("f47ac10b-58cc-4372-a567-0e02b2c3d471");
    expect(res.body.amount).toBe("10.00");
    expect(res.body.completions).toBeUndefined();
  });

  it("returns 404 for nonexistent payout", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/payouts/f47ac10b-58cc-4372-a567-0e02b2c3d472")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Payout not found.");
  });

  it("returns 404 for invalid id parameter", async () => {
    const res = await request(app)
      .get("/payouts/invalid-uuid")
      .set("Authorization", `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Payout not found.");
  });
});
