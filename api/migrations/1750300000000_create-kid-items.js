/**
 * Avatar accessories a kid has bought from the shop. The catalog itself lives
 * in code (api/src/shopCatalog.ts), so item_id is a catalog id, not an FK.
 * slot is copied from the catalog at purchase time so the partial unique index
 * can enforce "at most one equipped item per slot" in the database.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const up = (pgm) => {
  pgm.createTable('kid_items', {
    kid_id: {
      type: 'uuid',
      notNull: true,
      references: '"kid_profiles"',
      onDelete: 'CASCADE',
      primaryKey: true,
    },
    item_id: { type: 'text', notNull: true, primaryKey: true },
    household_id: {
      type: 'uuid',
      notNull: true,
      references: '"households"',
      onDelete: 'CASCADE',
    },
    slot: { type: 'text', notNull: true },
    price_paid: { type: 'integer', notNull: true },
    equipped: { type: 'boolean', notNull: true, default: false },
    purchased_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createIndex('kid_items', ['kid_id', 'slot'], {
    unique: true,
    where: 'equipped',
    name: 'kid_items_one_equipped_per_slot',
  })
  pgm.createIndex('kid_items', ['household_id'])
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
export const down = (pgm) => {
  pgm.dropTable('kid_items')
}
