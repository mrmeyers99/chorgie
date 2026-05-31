/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('chore_definitions', {
    override_available_until: {
      type: 'timestamptz',
      notNull: false,
    },
  })

  pgm.createIndex('chore_definitions', 'override_available_until')
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropColumns('chore_definitions', ['override_available_until'])
}
