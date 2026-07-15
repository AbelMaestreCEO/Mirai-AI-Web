-- Facturas PDF generadas automáticamente al registrar una venta.
-- El PDF en sí vive en R2 (bucket MIRAI_AI_ASSETS, prefijo invoices/); esta
-- tabla guarda solo los metadatos y montos para poder listarlas rápido.

CREATE TABLE
    IF NOT EXISTS sale_invoices (
        id TEXT PRIMARY KEY,
        user_dni TEXT NOT NULL,
        transaction_id TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        tax_amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        created_at TEXT NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_sale_invoices_user_dni ON sale_invoices (user_dni);

CREATE INDEX IF NOT EXISTS idx_sale_invoices_transaction_id ON sale_invoices (transaction_id);
