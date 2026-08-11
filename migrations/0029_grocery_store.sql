ALTER TABLE everyday_grocery_items ADD COLUMN store TEXT;
CREATE INDEX IF NOT EXISTS idx_everyday_grocery_items_household_store ON everyday_grocery_items(household_id, store, checked);
