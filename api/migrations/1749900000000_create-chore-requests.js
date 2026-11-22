/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  // Kid-submitted "I did a chore that wasn't on the list" entries. Kept
  // separate from chore_completions (which require a chore_definitions row and
  // drive availability/cooldown logic) -- a request only credits the kid's
  // balance once an admin approves it.
  pgm.createTable('chore_requests', {
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
    enc_name: { type: 'text', notNull: true },
    // What the kid asked for; NULL when they left it to the parent to decide
    requested_amount: { type: 'numeric(10,2)' },
    status: { type: 'text', notNull: true, default: 'pending' },
    // What the admin actually credited; set only when status = 'approved'
    approved_amount: { type: 'numeric(10,2)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    resolved_at: { type: 'timestamptz' },
  })

  pgm.addConstraint('chore_requests', 'chore_requests_status_check', {
    check: "status IN ('pending', 'approved', 'rejected')",
  })

  pgm.createIndex('chore_requests', ['household_id', 'status', 'created_at'])
  pgm.createIndex('chore_requests', ['kid_id', 'resolved_at'])
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropTable('chore_requests')
}
