import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../db.js";
import { SHOP_ITEMS, findShopItem } from "../shopCatalog.js";

// Kid-facing avatar shop (PRD §6.12). Like chore requests, kids use the
// household's already-logged-in tab, so these routes need requireAuth only.
export const shopRouter = Router();

const uuidSchema = z.string().uuid();

const purchaseSchema = z.object({
  item_id: z.string().min(1).max(100),
});

const equipSchema = z.object({
  item_id: z.string().min(1).max(100),
  equipped: z.boolean(),
});

type OwnedItemRow = {
  item_id: string;
  slot: string;
  equipped: boolean;
};

function firstZodError(error: z.ZodError) {
  const flat = error.flatten();
  return (
    flat.formErrors[0] ??
    Object.values(flat.fieldErrors).flat()[0] ??
    "Invalid request"
  );
}

async function loadOwnedItems(
  client: PoolClient,
  kidId: string,
  householdId: string,
) {
  const result = await client.query<OwnedItemRow>(
    `SELECT item_id, slot, equipped
     FROM kid_items
     WHERE kid_id = $1 AND household_id = $2
     ORDER BY purchased_at ASC`,
    [kidId, householdId],
  );
  return result.rows;
}

// Locks the kid row so concurrent purchases/equips for the same kid serialize
// (and can't overspend biscuits).
async function lockKid(client: PoolClient, kidId: string, householdId: string) {
  const result = await client.query<{ biscuits: number }>(
    `SELECT biscuits
     FROM kid_profiles
     WHERE id = $1 AND household_id = $2 AND is_active = true
     FOR UPDATE`,
    [kidId, householdId],
  );
  return result.rows[0];
}

shopRouter.get("/catalog", (_req, res) => {
  res.status(200).json({ items: SHOP_ITEMS });
});

shopRouter.get("/kids/:kidId", async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { kidId } = req.params;
  if (!uuidSchema.safeParse(kidId).success) {
    res.status(404).json({ error: "Kid profile not found." });
    return;
  }

  const client = await pool.connect();
  try {
    const kidResult = await client.query<{ biscuits: number }>(
      `SELECT biscuits
       FROM kid_profiles
       WHERE id = $1 AND household_id = $2 AND is_active = true`,
      [kidId, householdId],
    );
    const kid = kidResult.rows[0];
    if (!kid) {
      res.status(404).json({ error: "Kid profile not found." });
      return;
    }

    const items = await loadOwnedItems(client, kidId, householdId);
    res.status(200).json({ biscuits: kid.biscuits, items });
  } finally {
    client.release();
  }
});

shopRouter.post("/kids/:kidId/purchases", async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { kidId } = req.params;
  if (!uuidSchema.safeParse(kidId).success) {
    res.status(404).json({ error: "Kid profile not found." });
    return;
  }

  const parsed = purchaseSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: firstZodError(parsed.error) });
    return;
  }

  const item = findShopItem(parsed.data.item_id);
  if (!item) {
    res.status(404).json({ error: "Item not found." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const kid = await lockKid(client, kidId, householdId);
    if (!kid) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Kid profile not found." });
      return;
    }

    const ownedResult = await client.query(
      `SELECT 1
       FROM kid_items
       WHERE kid_id = $1 AND household_id = $2 AND item_id = $3`,
      [kidId, householdId, item.id],
    );
    if (ownedResult.rows.length > 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "You already have this item." });
      return;
    }

    if (kid.biscuits < item.price) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Not enough biscuits." });
      return;
    }

    const balanceResult = await client.query<{ biscuits: number }>(
      `UPDATE kid_profiles
       SET biscuits = biscuits - $3
       WHERE id = $1 AND household_id = $2
       RETURNING biscuits`,
      [kidId, householdId, item.price],
    );

    // Buying puts the new item on right away, replacing whatever was in that slot
    await client.query(
      `UPDATE kid_items
       SET equipped = false
       WHERE kid_id = $1 AND household_id = $2 AND slot = $3 AND equipped`,
      [kidId, householdId, item.slot],
    );
    await client.query(
      `INSERT INTO kid_items (kid_id, item_id, household_id, slot, price_paid, equipped)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [kidId, item.id, householdId, item.slot, item.price],
    );

    const items = await loadOwnedItems(client, kidId, householdId);
    await client.query("COMMIT");
    res.status(201).json({ biscuits: balanceResult.rows[0]?.biscuits, items });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

shopRouter.put("/kids/:kidId/equipped", async (req, res) => {
  const householdId = res.locals.auth?.householdId as string | undefined;
  if (!householdId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { kidId } = req.params;
  if (!uuidSchema.safeParse(kidId).success) {
    res.status(404).json({ error: "Kid profile not found." });
    return;
  }

  const parsed = equipSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: firstZodError(parsed.error) });
    return;
  }
  const { item_id: itemId, equipped } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const kid = await lockKid(client, kidId, householdId);
    if (!kid) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Kid profile not found." });
      return;
    }

    const ownedResult = await client.query<{ slot: string }>(
      `SELECT slot
       FROM kid_items
       WHERE kid_id = $1 AND household_id = $2 AND item_id = $3`,
      [kidId, householdId, itemId],
    );
    const owned = ownedResult.rows[0];
    if (!owned) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "You don't have this item." });
      return;
    }

    if (equipped) {
      await client.query(
        `UPDATE kid_items
         SET equipped = false
         WHERE kid_id = $1 AND household_id = $2 AND slot = $3 AND equipped
           AND item_id <> $4`,
        [kidId, householdId, owned.slot, itemId],
      );
    }
    await client.query(
      `UPDATE kid_items
       SET equipped = $4
       WHERE kid_id = $1 AND household_id = $2 AND item_id = $3`,
      [kidId, householdId, itemId, equipped],
    );

    const items = await loadOwnedItems(client, kidId, householdId);
    await client.query("COMMIT");
    res.status(200).json({ biscuits: kid.biscuits, items });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
