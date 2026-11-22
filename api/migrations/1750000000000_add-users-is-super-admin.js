/**
 * Super admins can view a cross-household summary (GET /super-admin/households).
 * There is deliberately no API or UI for granting this flag -- it is set by an
 * operator directly in the database:
 *
 *   UPDATE users SET is_super_admin = true WHERE email = 'you@example.com';
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.addColumns('users', {
    is_super_admin: { type: 'boolean', notNull: true, default: false },
  })
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropColumns('users', ['is_super_admin'])
}
