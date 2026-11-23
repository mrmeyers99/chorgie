import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { app } from "../src/app.js";
import { SHOP_ITEMS, SHOP_SLOTS } from "../src/shopCatalog.js";

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

const auth = () => `Bearer ${makeAccessToken()}`;

beforeEach(async () => {
  const mockClient = await getMockClient();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

describe("shop catalog", () => {
  it("has unique ids, known slots and positive prices", () => {
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    for (const item of SHOP_ITEMS) {
      expect(SHOP_SLOTS).toContain(item.slot);
      expect(item.price).toBeGreaterThan(0);
      expect(item.price).toBeLessThanOrEqual(70);
    }
  });

  it("GET /shop/catalog returns every item", async () => {
    const res = await request(app)
      .get("/shop/catalog")
      .set("Authorization", auth());
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(SHOP_ITEMS.length);
  });

  it("requires auth", async () => {
    const res = await request(app).get("/shop/catalog");
    expect(res.status).toBe(401);
  });
});

describe("GET /shop/kids/:kidId", () => {
  it("returns the kid's biscuits and items, scoped to the household", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ biscuits: 42 }] })
      .mockResolvedValueOnce({
        rows: [{ item_id: "crown", slot: "hat", equipped: true }],
      });

    const res = await request(app)
      .get(`/shop/kids/${kidId}`)
      .set("Authorization", auth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      biscuits: 42,
      items: [{ item_id: "crown", slot: "hat", equipped: true }],
    });
    expect(mockClient.query.mock.calls[0][1]).toEqual([kidId, householdId]);
  });

  it("404s for a kid outside the household", async () => {
    const mockClient = await getMockClient();
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/shop/kids/${kidId}`)
      .set("Authorization", auth());
    expect(res.status).toBe(404);
  });

  it("404s for a malformed kid id without touching the DB", async () => {
    const mockClient = await getMockClient();
    const res = await request(app)
      .get("/shop/kids/not-a-uuid")
      .set("Authorization", auth());
    expect(res.status).toBe(404);
    expect(mockClient.query).not.toHaveBeenCalled();
  });
});

describe("POST /shop/kids/:kidId/purchases", () => {
  it("deducts biscuits and wears the new item", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ biscuits: 80 }] }) // lock kid
      .mockResolvedValueOnce({ rows: [] }) // not owned
      .mockResolvedValueOnce({ rows: [{ biscuits: 10 }] }) // deduct
      .mockResolvedValueOnce({ rows: [] }) // unequip slot
      .mockResolvedValueOnce({ rows: [] }) // insert
      .mockResolvedValueOnce({
        rows: [{ item_id: "crown", slot: "hat", equipped: true }],
      }) // owned items
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post(`/shop/kids/${kidId}/purchases`)
      .set("Authorization", auth())
      .send({ item_id: "crown" });

    expect(res.status).toBe(201);
    expect(res.body.biscuits).toBe(10);
    expect(res.body.items).toEqual([
      { item_id: "crown", slot: "hat", equipped: true },
    ]);
    expect(mockClient.query.mock.calls[1][0]).toContain("FOR UPDATE");
    expect(mockClient.query.mock.calls[1][1]).toEqual([kidId, householdId]);
    expect(mockClient.query.mock.calls[3][1]).toEqual([kidId, householdId, 70]);
    expect(mockClient.query.mock.calls[4][1]).toEqual([
      kidId,
      householdId,
      "hat",
    ]);
    expect(mockClient.query.mock.calls[5][1]).toEqual([
      kidId,
      "crown",
      householdId,
      "hat",
      70,
    ]);
    expect(mockClient.query.mock.calls[7][0]).toBe("COMMIT");
  });

  it("refuses when the kid doesn't have enough biscuits", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ biscuits: 69 }] }) // lock kid
      .mockResolvedValueOnce({ rows: [] }) // not owned
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post(`/shop/kids/${kidId}/purchases`)
      .set("Authorization", auth())
      .send({ item_id: "crown" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Not enough biscuits.");
    expect(mockClient.query.mock.calls[3][0]).toBe("ROLLBACK");
  });

  it("refuses to sell an item the kid already owns", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ biscuits: 500 }] }) // lock kid
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // owned
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post(`/shop/kids/${kidId}/purchases`)
      .set("Authorization", auth())
      .send({ item_id: "crown" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("You already have this item.");
  });

  it("404s for an item that isn't in the catalog", async () => {
    const mockClient = await getMockClient();
    const res = await request(app)
      .post(`/shop/kids/${kidId}/purchases`)
      .set("Authorization", auth())
      .send({ item_id: "gold-plated-yacht" });

    expect(res.status).toBe(404);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it("404s for a kid outside the household", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // lock kid
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post(`/shop/kids/${kidId}/purchases`)
      .set("Authorization", auth())
      .send({ item_id: "crown" });

    expect(res.status).toBe(404);
  });

  it("ignores a client-supplied price", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ biscuits: 5 }] }) // lock kid
      .mockResolvedValueOnce({ rows: [] }) // not owned
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post(`/shop/kids/${kidId}/purchases`)
      .set("Authorization", auth())
      .send({ item_id: "crown", price: 1 });

    expect(res.status).toBe(409);
  });
});

describe("PUT /shop/kids/:kidId/equipped", () => {
  it("wearing an item takes off the other item in that slot", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ biscuits: 3 }] }) // lock kid
      .mockResolvedValueOnce({ rows: [{ slot: "hat" }] }) // owned
      .mockResolvedValueOnce({ rows: [] }) // unequip others in slot
      .mockResolvedValueOnce({ rows: [] }) // equip
      .mockResolvedValueOnce({
        rows: [
          { item_id: "crown", slot: "hat", equipped: false },
          { item_id: "beanie", slot: "hat", equipped: true },
        ],
      }) // owned items
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .put(`/shop/kids/${kidId}/equipped`)
      .set("Authorization", auth())
      .send({ item_id: "beanie", equipped: true });

    expect(res.status).toBe(200);
    expect(res.body.biscuits).toBe(3);
    expect(mockClient.query.mock.calls[3][0]).toContain("SET equipped = false");
    expect(mockClient.query.mock.calls[3][1]).toEqual([
      kidId,
      householdId,
      "hat",
      "beanie",
    ]);
    expect(mockClient.query.mock.calls[4][1]).toEqual([
      kidId,
      householdId,
      "beanie",
      true,
    ]);
  });

  it("taking an item off doesn't touch the rest of the slot", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ biscuits: 3 }] }) // lock kid
      .mockResolvedValueOnce({ rows: [{ slot: "hat" }] }) // owned
      .mockResolvedValueOnce({ rows: [] }) // unequip
      .mockResolvedValueOnce({ rows: [] }) // owned items
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .put(`/shop/kids/${kidId}/equipped`)
      .set("Authorization", auth())
      .send({ item_id: "beanie", equipped: false });

    expect(res.status).toBe(200);
    expect(mockClient.query.mock.calls[3][1]).toEqual([
      kidId,
      householdId,
      "beanie",
      false,
    ]);
    expect(mockClient.query.mock.calls[5][0]).toBe("COMMIT");
  });

  it("404s when the kid doesn't own the item", async () => {
    const mockClient = await getMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ biscuits: 3 }] }) // lock kid
      .mockResolvedValueOnce({ rows: [] }) // not owned
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .put(`/shop/kids/${kidId}/equipped`)
      .set("Authorization", auth())
      .send({ item_id: "crown", equipped: true });

    expect(res.status).toBe(404);
  });

  it("400s on a missing equipped flag", async () => {
    const res = await request(app)
      .put(`/shop/kids/${kidId}/equipped`)
      .set("Authorization", auth())
      .send({ item_id: "crown" });

    expect(res.status).toBe(400);
  });
});
