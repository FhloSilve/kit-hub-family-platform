ALTER TABLE user_locale_preferences ADD COLUMN offer_translations INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_locale_preferences ADD COLUMN translation_ttl_minutes INTEGER NOT NULL DEFAULT 5;
