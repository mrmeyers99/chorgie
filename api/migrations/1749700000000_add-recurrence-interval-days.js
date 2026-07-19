/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('chore_definitions', {
    recurrence_interval_days: { type: 'integer' },
  })

  // Extract a leading integer from enc_recurrence_rule (mirrors the old
  // server-side Number.parseInt(rule, 10) tolerance for trailing junk like
  // "3-days", not just a strict all-digits match), and drop values below 1
  // the same way the old getRecurrenceDays() did. Anything with no leading
  // digits at all (e.g. legacy non-numeric junk) has no recoverable day
  // count and is left NULL, same as before this migration.
  pgm.sql(`
    UPDATE chore_definitions
    SET recurrence_interval_days = CASE
      WHEN substring(enc_recurrence_rule FROM '^\\s*(\\d+)')::integer >= 1
        THEN substring(enc_recurrence_rule FROM '^\\s*(\\d+)')::integer
      ELSE NULL
    END
    WHERE recurrence_type = 'recurring'
  `)

  // Surface any recurring chore that couldn't be recovered -- it will
  // otherwise silently behave as immediately-available (no cooldown) from
  // now on, per isChoreCurrentlyAvailable() treating a NULL
  // next_available_at as available.
  pgm.sql(`
    DO $$
    DECLARE
      unrecoverable_count integer;
    BEGIN
      SELECT COUNT(*) INTO unrecoverable_count
      FROM chore_definitions
      WHERE recurrence_type = 'recurring' AND recurrence_interval_days IS NULL;

      IF unrecoverable_count > 0 THEN
        RAISE WARNING '% recurring chore(s) had an unparseable enc_recurrence_rule and lost their recurrence interval -- they will behave as always-available until an admin edits them to set a new interval', unrecoverable_count;
      END IF;
    END $$;
  `)

  pgm.dropColumns('chore_definitions', ['enc_recurrence_rule'])
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.addColumns('chore_definitions', {
    enc_recurrence_rule: { type: 'text' },
  })

  pgm.sql(`
    UPDATE chore_definitions
    SET enc_recurrence_rule = recurrence_interval_days::text
    WHERE recurrence_interval_days IS NOT NULL
  `)

  pgm.dropColumns('chore_definitions', ['recurrence_interval_days'])
}
