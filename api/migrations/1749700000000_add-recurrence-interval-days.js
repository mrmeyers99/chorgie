/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('chore_definitions', {
    recurrence_interval_days: { type: 'integer' },
  })

  pgm.sql(`
    UPDATE chore_definitions
    SET recurrence_interval_days = enc_recurrence_rule::integer
    WHERE recurrence_type = 'recurring'
      AND enc_recurrence_rule ~ '^[0-9]+$'
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
