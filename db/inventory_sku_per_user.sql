-- Corrige el alcance de la unicidad del SKU en inventory_products.
--
-- db/schema.sql declara `sku TEXT UNIQUE`, es decir, único en TODA la tabla,
-- pero handleInventoryUpload() en workers/worker.js valida el duplicado solo
-- dentro del inventario del usuario:
--
--     SELECT id FROM inventory_products WHERE sku = ? AND user_dni = ?
--
-- Con lo cual dos usuarios distintos que usen el mismo SKU pasan la validación
-- del código y luego revientan contra la constraint de SQLite. El inventario es
-- privado por usuario, así que la unicidad correcta es (user_dni, sku).
--
-- SQLite no permite quitar una constraint con ALTER TABLE: hay que reconstruir
-- la tabla. Haz copia de seguridad de D1 antes de ejecutarlo.
--
--   npx wrangler d1 export mirai-ai-db --output backup.sql --remote
--   npx wrangler d1 execute mirai-ai-db --file db/inventory_sku_per_user.sql --remote

PRAGMA foreign_keys = OFF;

CREATE TABLE inventory_products_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT,
    category TEXT,
    quantity INTEGER DEFAULT 0,
    unit_price REAL,

    ai_description TEXT,
    ai_tags TEXT,
    ai_confidence REAL,
    photo_r2_key TEXT,

    demand_score REAL DEFAULT 0.0,
    predicted_restock_date DATE,

    user_dni TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO inventory_products_new
    (id, name, sku, category, quantity, unit_price,
     ai_description, ai_tags, ai_confidence, photo_r2_key,
     demand_score, predicted_restock_date, user_dni, created_at, updated_at)
SELECT
     id, name, sku, category, quantity, unit_price,
     ai_description, ai_tags, ai_confidence, photo_r2_key,
     demand_score, predicted_restock_date, user_dni, created_at, updated_at
FROM inventory_products;

DROP TABLE inventory_products;

ALTER TABLE inventory_products_new RENAME TO inventory_products;

-- La unicidad ahora es por usuario. El índice es parcial para no bloquear los
-- productos sin SKU ni los anteriores a la columna user_dni.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku_per_user
    ON inventory_products (user_dni, sku)
    WHERE sku IS NOT NULL AND user_dni IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_user_dni
    ON inventory_products (user_dni);

PRAGMA foreign_keys = ON;
