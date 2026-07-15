-- Suscripciones Web Push (una por usuario/dispositivo actual).
-- Nota: esta tabla ya existía en producción (creada manualmente en D1) pero
-- nunca se documentó en el repo. Se agrega aquí como referencia y para poder
-- recrearla en un entorno nuevo. Usar IF NOT EXISTS para no romper producción.
CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    user_dni TEXT NOT NULL UNIQUE,
    subscription_endpoint TEXT NOT NULL,
    subscription_p256dh TEXT NOT NULL,
    subscription_auth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
