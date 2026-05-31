/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.createTable('payouts', {
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
    kid_id: {
      type: 'uuid',
      notNull: true,
      references: '"kid_profiles"',
      onDelete: 'CASCADE',
    },
    enc_notes: { type: 'text', notNull: false },
    paid_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createIndex('payouts', ['household_id', 'paid_at'])
  pgm.createIndex('payouts', ['kid_id', 'paid_at'])

  pgm.addColumns('chore_completions', {
    payout_id: {
      type: 'uuid',
      notNull: false,
      references: '"payouts"',
      onDelete: 'SET NULL',
    },
    paid_at: {
      type: 'timestamptz',
      notNull: false,
    },
  })

  pgm.createIndex('chore_completions', ['payout_id'])
  pgm.createIndex('chore_completions', ['paid_at'])
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropColumns('chore_completions', ['payout_id', 'paid_at'])
  pgm.dropTable('payouts')
}
