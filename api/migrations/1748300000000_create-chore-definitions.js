/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.createTable('chore_definitions', {
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
    enc_name: { type: 'text', notNull: true },
    enc_description: { type: 'text' },
    reward_amount: { type: 'numeric(10,2)', notNull: true },
    recurrence_type: { type: 'text', notNull: true },
    enc_recurrence_rule: { type: 'text' },
    assigned_to: {
      type: 'uuid',
      references: '"kid_profiles"',
      onDelete: 'SET NULL',
    },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createIndex('chore_definitions', 'household_id')
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropTable('chore_definitions')
}
