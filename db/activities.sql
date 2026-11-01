-- Actividades del Aula Virtual: flashcards, detecta el error, recuerdo libre,
-- resumen con límite y mapa conceptual. Idempotente.
-- La creación perezosa vive en workers/routes/activities.ts.

CREATE TABLE IF NOT EXISTS activity_sets (
    assignment_id TEXT NOT NULL,
    type          TEXT NOT NULL,
    payload       TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (assignment_id, type)
);

CREATE TABLE IF NOT EXISTS activity_attempts (
    id            TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    user_dni      TEXT NOT NULL,
    type          TEXT NOT NULL,
    answers       TEXT,
    result        TEXT,
    score         INTEGER,
    max_score     INTEGER,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
    assignment_id TEXT NOT NULL,
    user_dni      TEXT NOT NULL,
    card_index    INTEGER NOT NULL,
    repetitions   INTEGER DEFAULT 0,
    ease          REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 0,
    due_at        TEXT,
    last_quality  INTEGER,
    updated_at    TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (assignment_id, user_dni, card_index)
);

CREATE INDEX IF NOT EXISTS idx_activity_attempts_user
    ON activity_attempts (assignment_id, user_dni);
