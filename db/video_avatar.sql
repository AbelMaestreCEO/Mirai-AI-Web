CREATE TABLE IF NOT EXISTS video_avatar_characters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_dni    TEXT    NOT NULL,
    name        TEXT,
    image_url   TEXT    NOT NULL,
    r2_key      TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- La generación (TTS + lip-sync) tarda varios minutos, más de lo que Cloudflare
-- permite mantener una respuesta HTTP abierta. Por eso se procesa en segundo
-- plano (ctx.waitUntil) y el cliente hace polling de esta tabla por id.
CREATE TABLE IF NOT EXISTS video_avatar_jobs (
    id                   TEXT PRIMARY KEY,
    user_dni             TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'pending', -- pending | done | error
    video_url            TEXT,
    error                TEXT,
    character_id         INTEGER,
    character_name       TEXT,
    character_image_url  TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
);
