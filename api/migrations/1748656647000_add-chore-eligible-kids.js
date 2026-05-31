/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.createTable('chore_eligible_kids', {
    chore_id: {
      type: 'uuid',
      notNull: true,
      references: '"chore_definitions"',
      onDelete: 'CASCADE',
    },
    kid_id: {
      type: 'uuid',
      notNull: true,
      references: '"kid_profiles"',
      onDelete: 'CASCADE',
    },
  })

  pgm.addConstraint('chore_eligible_kids', 'chore_eligible_kids_pkey', 'PRIMARY KEY (chore_id, kid_id)')

  pgm.dropColumns('chore_definitions', ['assigned_to'])
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.addColumns('chore_definitions', {
    assigned_to: {
      type: 'uuid',
      references: '"kid_profiles"',
      onDelete: 'SET NULL',
    },
  })

  pgm.dropTable('chore_eligible_kids')
}
