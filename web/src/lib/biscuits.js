// Display-side mirror of api/src/biscuits.ts: the server decides what a
// completion actually pays; this only previews it on the chore card. Keep the
// two in sync when the rules change.

export const ON_TIME_CURVE = [10, 5, 4, 3, 2];
export const LATE_FLOOR = 1;
export const FLAT_BISCUITS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysLate(nextAvailableAt, now = new Date()) {
  if (!nextAvailableAt) return 0;
  const ms = now.getTime() - new Date(nextAvailableAt).getTime();
  return Math.max(0, Math.floor(ms / DAY_MS));
}

// What completing this chore right now would pay.
export function biscuitsForChore(chore, now = new Date()) {
  if (chore.recurrence_type !== "recurring") return FLAT_BISCUITS;
  return ON_TIME_CURVE[daysLate(chore.next_available_at, now)] ?? LATE_FLOOR;
}
