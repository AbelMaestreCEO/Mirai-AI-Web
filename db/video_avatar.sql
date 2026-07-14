CREATE TABLE IF NOT EXISTS video_avatar_characters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_dni    TEXT    NOT NULL,
    name        TEXT,
    image_url   TEXT    NOT NULL,
    r2_key      TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- La generación (TTS + lip-sync) tarda varios minutos: más de lo que Cloudflare
-- permite mantener una respuesta HTTP abierta O un ctx.waitUntil() con vida
-- (~30s máx). Por eso la predicción se crea directo en la API REST de Pruna
-- en modo asíncrono (sin header Try-Sync) y Pruna la procesa en sus propios
-- servidores; el cliente hace polling corto y acotado de esta tabla por id
-- (cada poll dispara, como mucho, una consulta rápida al estado en Pruna).
-- Requiere el secreto PRUNA_API_KEY configurado en el Worker
-- (npx wrangler secret put PRUNA_API_KEY).
CREATE TABLE IF NOT EXISTS video_avatar_jobs (
    id                   TEXT PRIMARY KEY,
    user_dni             TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'pending', -- pending | done | error
    pruna_prediction_id  TEXT,
    video_url            TEXT,
    error                TEXT,
    character_id         INTEGER,
    character_name       TEXT,
    character_image_url  TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
