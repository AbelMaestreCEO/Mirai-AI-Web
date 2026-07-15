-- Módulo de Ventas — uso interno, aislado por usuario (user_dni)

-- Artículos del inventario puestos a la venta
CREATE TABLE
    IF NOT EXISTS sale_listings (
        id TEXT PRIMARY KEY,
        user_dni TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_sku TEXT DEFAULT '',
        photo_r2_key TEXT,
        quantity INTEGER NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'agotado', 'retirado')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_sale_listings_user_dni ON sale_listings (user_dni);

CREATE INDEX IF NOT EXISTS idx_sale_listings_status ON sale_listings (status);

CREATE INDEX IF NOT EXISTS idx_sale_listings_product_id ON sale_listings (product_id);

-- Compradores (registro interno del usuario dueño de los datos)
CREATE TABLE
    IF NOT EXISTS sale_buyers (
        id TEXT PRIMARY KEY,
        user_dni TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        cedula TEXT NOT NULL,
        phone TEXT DEFAULT '',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (user_dni, cedula)
    );

CREATE INDEX IF NOT EXISTS idx_sale_buyers_user_dni ON sale_buyers (user_dni);

-- Compras / pagos (pendientes y realizados)
CREATE TABLE
    IF NOT EXISTS sale_transactions (
        id TEXT PRIMARY KEY,
        user_dni TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'pagado', 'cancelado')),
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        paid_at TEXT
    );

CREATE INDEX IF NOT EXISTS idx_sale_transactions_user_dni ON sale_transactions (user_dni);

CREATE INDEX IF NOT EXISTS idx_sale_transactions_status ON sale_transactions (status);

CREATE INDEX IF NOT EXISTS idx_sale_transactions_buyer_id ON sale_transactions (buyer_id);
