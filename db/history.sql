CREATE TABLE IF NOT EXISTS gen_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_dni    TEXT    NOT NULL,
    type        TEXT    NOT NULL, 
    badge       TEXT,
    prompt      TEXT,
    result      TEXT,   
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);