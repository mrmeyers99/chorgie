/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('kid_profiles', {
    balance: { type: 'numeric(10,2)', notNull: true, default: 0 },
  })

  pgm.createTable('chore_completions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    household_id: {
      type: 'uuid',
      notNull: true,
      references: '"households"',
      onDelete: 'CASCADE',
    },
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
    reward_amount: { type: 'numeric(10,2)', notNull: true },
    completed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createIndex('chore_completions', ['chore_id', 'completed_at'])
  pgm.createIndex('chore_completions', ['kid_id', 'completed_at'])
  pgm.createIndex('chore_completions', ['household_id', 'completed_at'])
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropTable('chore_completions')
  pgm.dropColumns('kid_profiles', ['balance'])
}
