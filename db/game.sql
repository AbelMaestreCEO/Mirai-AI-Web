-- Multijugador (Ludo y derivados): lobby, partidas, resultados y preguntas.
-- Tablas nuevas e idempotentes; no modifican ninguna existente.
-- El estado EN VIVO de la partida vive en el Durable Object GameRoom, no aquí:
-- D1 solo guarda lobby, configuración, historial y auditoría (multijugador.md §7).
--
-- Aplicar:
--   npx wrangler d1 execute mirai-ai-db --remote --file=db/game.sql

CREATE TABLE IF NOT EXISTS game_rooms (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    code          TEXT NOT NULL UNIQUE,
    section_id    TEXT,
    assignment_id TEXT,
    created_by    TEXT,
    topic         TEXT,
    professor_dni TEXT NOT NULL,
    game_type     TEXT NOT NULL DEFAULT 'ludo',
    max_players   INTEGER NOT NULL DEFAULT 4,
    turn_seconds  INTEGER NOT NULL DEFAULT 40,
    status        TEXT NOT NULL DEFAULT 'lobby',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_section ON game_rooms(section_id);
CREATE INDEX IF NOT EXISTS idx_game_rooms_assignment ON game_rooms(assignment_id);
CREATE INDEX IF NOT EXISTS idx_game_rooms_creator ON game_rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_game_rooms_professor ON game_rooms(professor_dni);
CREATE INDEX IF NOT EXISTS idx_game_rooms_expires ON game_rooms(expires_at);

CREATE TABLE IF NOT EXISTS game_players (
    room_id    TEXT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_dni   TEXT NOT NULL,
    nickname   TEXT NOT NULL,
    avatar_key TEXT,
    role       TEXT NOT NULL DEFAULT 'player',
    status     TEXT NOT NULL DEFAULT 'invited',
    joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, user_dni)
);

CREATE TABLE IF NOT EXISTS game_matches (
    id            TEXT PRIMARY KEY,
    room_id       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'playing',
    started_at    TEXT,
    finished_at   TEXT,
    winner_dni    TEXT,
    state_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_game_matches_room ON game_matches(room_id);

CREATE TABLE IF NOT EXISTS game_results (
    match_id   TEXT NOT NULL,
    user_dni   TEXT NOT NULL,
    position   INTEGER NOT NULL,
    score      INTEGER NOT NULL DEFAULT 0,
    xp         INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (match_id, user_dni)
);

CREATE INDEX IF NOT EXISTS idx_game_results_user ON game_results(user_dni);

CREATE TABLE IF NOT EXISTS game_moves (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    match_id   TEXT NOT NULL,
    user_dni   TEXT NOT NULL,
    move_index INTEGER NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (match_id, move_index)
);

CREATE INDEX IF NOT EXISTS idx_game_moves_match ON game_moves(match_id);

CREATE TABLE IF NOT EXISTS game_question_bank (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    assignment_id TEXT,
    topic         TEXT NOT NULL,
    payload       TEXT NOT NULL,
    difficulty    TEXT,
    qhash         TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_game_questions_assignment ON game_question_bank(assignment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_questions_hash
    ON game_question_bank(assignment_id, qhash);

-- Columnas añadidas después de la primera versión de game_rooms (bases ya
-- creadas). En una base nueva ya vienen en el CREATE TABLE:
--   ALTER TABLE game_rooms ADD COLUMN assignment_id TEXT;
--   ALTER TABLE game_rooms ADD COLUMN created_by TEXT;
--   ALTER TABLE game_rooms ADD COLUMN topic TEXT;
--   ALTER TABLE game_question_bank ADD COLUMN difficulty TEXT;
--   ALTER TABLE game_question_bank ADD COLUMN qhash TEXT;
