/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('payouts', {
    amount: { type: 'numeric(10,2)', notNull: false },
  })

  // Backfill from linked completions before the link is dropped below.
  pgm.sql(`
    UPDATE payouts p
    SET amount = COALESCE(
      (SELECT SUM(cc.reward_amount) FROM chore_completions cc WHERE cc.payout_id = p.id),
      0
    )
    WHERE p.amount IS NULL
  `)

  pgm.alterColumn('payouts', 'amount', { notNull: true })

  pgm.dropColumns('chore_completions', ['payout_id', 'paid_at'])
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
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

  pgm.dropColumns('payouts', ['amount'])
}
