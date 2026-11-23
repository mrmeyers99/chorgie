/**
 * Biscuits: a second, non-money reward kids earn from chores and spend in the
 * avatar shop. kid_profiles.biscuits is the running total; the per-entry
 * columns record what each completion / approved request paid out so History
 * can show it.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('kid_profiles', {
    biscuits: { type: 'integer', notNull: true, default: 0 },
  })
  pgm.addConstraint('kid_profiles', 'kid_profiles_biscuits_nonnegative', {
    check: 'biscuits >= 0',
  })

  pgm.addColumns('chore_completions', {
    biscuits_earned: { type: 'integer', notNull: true, default: 0 },
  })

  pgm.addColumns('chore_requests', {
    // Set only when status = 'approved'
    biscuits_awarded: { type: 'integer' },
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropColumns('chore_requests', ['biscuits_awarded'])
  pgm.dropColumns('chore_completions', ['biscuits_earned'])
  pgm.dropConstraint('kid_profiles', 'kid_profiles_biscuits_nonnegative')
  pgm.dropColumns('kid_profiles', ['biscuits'])
}
