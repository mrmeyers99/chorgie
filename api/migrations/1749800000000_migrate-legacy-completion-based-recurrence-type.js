/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  // The 'completion-based' recurrence type was renamed to 'recurring' in
  // application code (#41), but that rename was never backfilled onto
  // existing rows -- chore_definitions.recurrence_type has no DB-level
  // check constraint, so any chore created before the rename still has the
  // literal string 'completion-based' stored, which today's code doesn't
  // recognize as ad-hoc, recurring, or always-available and silently skips
  // in the completion handler.
  pgm.sql(`
    UPDATE chore_definitions
    SET recurrence_type = 'recurring'
    WHERE recurrence_type = 'completion-based'
  `)

  // recurrence_interval_days can't be recovered for these rows -- the source
  // enc_recurrence_rule column was already dropped by
  // 1749700000000_add-recurrence-interval-days.js, before this fix existed.
  // They'll behave as always-available (no cooldown) until an admin sets an
  // interval, same graceful degradation as the unrecoverable case that
  // migration already warns about.
  pgm.sql(`
    DO $$
    DECLARE
      migrated_count integer;
    BEGIN
      SELECT COUNT(*) INTO migrated_count
      FROM chore_definitions
      WHERE recurrence_type = 'recurring' AND recurrence_interval_days IS NULL;

      IF migrated_count > 0 THEN
        RAISE WARNING '% chore(s) had legacy recurrence_type ''completion-based'' and no recoverable recurrence_interval_days -- they will behave as always-available until an admin edits them to set a new interval', migrated_count;
      END IF;
    END $$;
  `)
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = () => {
  // Not reversible: once merged into 'recurring', these rows are
  // indistinguishable from chores that were always 'recurring'.
}
