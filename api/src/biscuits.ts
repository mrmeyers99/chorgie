// Biscuit rewards (PRD §6.11). Mirrored for display in web/src/lib/biscuits.js:
// keep the two in sync when this changes.

// Recurring chores pay by how many full days late they were done, counted
// from when the chore became available again (next_available_at), the same
// day count as the "N days overdue" badge on the kid's chore list.
export const ON_TIME_CURVE = [10, 5, 4, 3, 2] as const;
export const LATE_FLOOR = 1;
// Ad-hoc, always-available, and approved kid chore requests.
export const FLAT_BISCUITS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysLate(
  nextAvailableAt: string | Date | null,
  completedAt: Date,
): number {
  if (!nextAvailableAt) return 0;
  const ms = completedAt.getTime() - new Date(nextAvailableAt).getTime();
  return Math.max(0, Math.floor(ms / DAY_MS));
}

export function biscuitsForCompletion(
  recurrenceType: string,
  nextAvailableAt: string | Date | null,
  completedAt: Date,
): number {
  if (recurrenceType !== "recurring") return FLAT_BISCUITS;
  return ON_TIME_CURVE[daysLate(nextAvailableAt, completedAt)] ?? LATE_FLOOR;
}
