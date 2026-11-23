// The avatar shop's catalog (PRD §6.12). The server is the source of truth for
// prices, since purchases spend biscuits. Each id must have a matching drawing
// in web/src/components/accessories.jsx; keep the two lists in sync.

export const SHOP_SLOTS = ["hat", "eyes", "neck", "outfit"] as const;
export type ShopSlot = (typeof SHOP_SLOTS)[number];

export type ShopItem = {
  id: string;
  slot: ShopSlot;
  name: string;
  price: number;
};

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: "party-hat", slot: "hat", name: "Party hat", price: 20 },
  { id: "baseball-cap", slot: "hat", name: "Baseball cap", price: 30 },
  { id: "beanie", slot: "hat", name: "Beanie", price: 35 },
  { id: "wizard-hat", slot: "hat", name: "Wizard hat", price: 55 },
  { id: "crown", slot: "hat", name: "Crown", price: 70 },
  { id: "round-glasses", slot: "eyes", name: "Round glasses", price: 25 },
  { id: "sunglasses", slot: "eyes", name: "Sunglasses", price: 35 },
  { id: "star-glasses", slot: "eyes", name: "Star glasses", price: 50 },
  { id: "red-collar", slot: "neck", name: "Red collar", price: 15 },
  { id: "bandana", slot: "neck", name: "Bandana", price: 20 },
  { id: "bow-tie", slot: "neck", name: "Bow tie", price: 25 },
  { id: "flower", slot: "neck", name: "Flower", price: 30 },
  { id: "t-shirt", slot: "outfit", name: "T-shirt", price: 35 },
  { id: "sweater", slot: "outfit", name: "Sweater", price: 45 },
  { id: "raincoat", slot: "outfit", name: "Raincoat", price: 55 },
  { id: "superhero-cape", slot: "outfit", name: "Superhero cape", price: 70 },
];

const ITEMS_BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));

export function findShopItem(id: string): ShopItem | undefined {
  return ITEMS_BY_ID.get(id);
}
