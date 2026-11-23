// Corgi avatar catalog. Every avatar shares the exact same full-body, sitting,
// front-facing geometry (drawn by components/CorgiAvatar.jsx) and differs only
// by coat colors. Keeping the geometry identical is what lets future shop
// accessories (hats, glasses, collars, shirts) be drawn once and fit every
// avatar — see ACCESSORY_ANCHORS.
//
// Coat fields:
//   main    – primary fur (head sides, body, haunches, tail)
//   legs    – front legs
//   saddle  – optional darker cap over the head top, ears and shoulders
//   brows   – optional eyebrow dots (tan points on black/tri coats)
//   patches – optional merle blotches
// White (muzzle, blaze, bib, paws) and the outline are shared by all coats.

export const DEFAULT_AVATAR_ID = "corgi-1";

export const AVATARS = [
  {
    id: "corgi-1",
    label: "Red & white",
    coat: { main: "#EE9C47", legs: "#EE9C47" },
  },
  {
    id: "corgi-2",
    label: "Sable",
    coat: { main: "#C9823F", legs: "#C9823F", saddle: "#7A4A26" },
  },
  {
    id: "corgi-3",
    label: "Tricolor",
    coat: { main: "#D98C4A", legs: "#D98C4A", saddle: "#2B2B2B" },
  },
  {
    id: "corgi-4",
    label: "Black & tan",
    coat: { main: "#2B2B2B", legs: "#C98040", brows: "#C98040" },
  },
  {
    id: "corgi-5",
    label: "Cream",
    coat: { main: "#F3D6A4", legs: "#F3D6A4" },
  },
  {
    id: "corgi-6",
    label: "Blue merle",
    coat: {
      main: "#A9B3C4",
      legs: "#C98A50",
      brows: "#C98A50",
      patches: "#4A5466",
    },
  },
];

const AVATARS_BY_ID = new Map(AVATARS.map((avatar) => [avatar.id, avatar]));

// Unknown or legacy ids (anything the remap migration didn't catch) fall back
// to the default avatar instead of rendering nothing.
export function resolveAvatar(id) {
  return AVATARS_BY_ID.get(id) ?? AVATARS_BY_ID.get(DEFAULT_AVATAR_ID);
}

// Fixed points (in CorgiAvatar's 512×512 viewBox) where accessory slots attach.
// Not used yet — reserved for the biscuits shop.
export const ACCESSORY_ANCHORS = {
  headTop: { x: 256, y: 92 },
  eyes: { x: 256, y: 190 },
  neck: { x: 256, y: 298 },
  torso: { x: 256, y: 380 },
};
