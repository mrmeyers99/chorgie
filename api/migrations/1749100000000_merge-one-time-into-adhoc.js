/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('chore_definitions', {
    last_completed_at: { type: 'timestamptz' },
  })

  pgm.sql(`
    UPDATE chore_definitions
    SET recurrence_type = 'ad-hoc'
    WHERE recurrence_type = 'one-time'
  `)
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropColumns('chore_definitions', ['last_completed_at'])
}
