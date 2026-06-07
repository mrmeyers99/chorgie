/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('chore_definitions', {
    next_available_at: {
      type: 'timestamptz',
      notNull: false,
    },
  })

  pgm.createIndex('chore_definitions', 'next_available_at')
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropColumns('chore_definitions', ['next_available_at'])
}
