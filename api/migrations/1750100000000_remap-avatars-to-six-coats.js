/**
 * The avatar set shrank from 12 head-only corgis to 6 full-body corgis that
 * differ only by coat color (ids corgi-1..corgi-6). Remap kids who picked
 * corgi-7..corgi-12 onto the new set: 7->1, 8->2, ... 12->6.
 *
 * Data-only; no schema change.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.sql(`
    UPDATE kid_profiles
    SET avatar_id = 'corgi-' || (((substring(avatar_id FROM 7)::int - 1) % 6) + 1)
    WHERE avatar_id ~ '^corgi-([7-9]|1[0-2])$'
  `)
}

/**
 * Lossy: we can't tell which kids were originally on corgi-7..12, so this is a
 * no-op. The frontend falls back to corgi-1 for any unknown id anyway.
 */
export const down = () => {}
