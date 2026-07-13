CREATE TABLE IF NOT EXISTS video_avatar_characters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_dni    TEXT    NOT NULL,
    name        TEXT,
    image_url   TEXT    NOT NULL,
    r2_key      TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
