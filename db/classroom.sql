-- Aula Virtual: cursos del profesor, secciones, tareas, entregas y disputas.
-- Esquema capturado de la D1 de producción (mirai-ai-db). Idempotente.
--
-- NOTA: `submissions.professor_note` es INTEGER (la nota manual del profesor),
-- mientras que el comentario del profesor vive en `professor_feedback` (TEXT).

CREATE TABLE IF NOT EXISTS user_courses (
    id          TEXT PRIMARY KEY,
    user_dni    TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS professors (
    dni        TEXT PRIMARY KEY,
    email      TEXT UNIQUE,
    full_name  TEXT,
    is_active  INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sections (
    id            TEXT PRIMARY KEY,
    professor_dni TEXT NOT NULL,
    course_id     TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT DEFAULT '',
    invite_code   TEXT,
    start_date    TEXT,
    classroom     TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS section_students (
    section_id TEXT NOT NULL,
    user_dni   TEXT NOT NULL,
    PRIMARY KEY (section_id, user_dni)
);

CREATE TABLE IF NOT EXISTS assignments (
    id              TEXT PRIMARY KEY,
    course_id       TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    file_url        TEXT,
    due_date        DATETIME,
    max_score       INTEGER DEFAULT 100,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    section_id      TEXT,
    submission_type TEXT DEFAULT 'document',
    grading_mode    TEXT DEFAULT 'summative',
    plan_id         TEXT,
    published_at    DATETIME
);

-- Borradores vs publicadas: `published_at` NULL = borrador. El profesor decide
-- cuándo publicar cada tarea; una vez publicada su contenido no se modifica.
-- Las tareas anteriores a esta función se publican una vez (ver router.ts).

CREATE TABLE IF NOT EXISTS assignment_students (
    assignment_id TEXT NOT NULL,
    user_dni      TEXT NOT NULL,
    PRIMARY KEY (assignment_id, user_dni),
    FOREIGN KEY (assignment_id) REFERENCES assignments (id)
);

CREATE TABLE IF NOT EXISTS submissions (
    id                 TEXT PRIMARY KEY,
    assignment_id      TEXT NOT NULL,
    user_dni           TEXT NOT NULL,
    file_url           TEXT NOT NULL,
    comment            TEXT,
    status             TEXT DEFAULT 'pending',
    submitted_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    graded_at          DATETIME,
    score              INTEGER,
    feedback           TEXT,
    reviewed_at        DATETIME DEFAULT NULL,
    dispute_status     TEXT DEFAULT NULL,
    dispute_reason     TEXT DEFAULT NULL,
    professor_note     INTEGER DEFAULT NULL,
    professor_feedback TEXT DEFAULT NULL,
    extracted_text     TEXT,
    FOREIGN KEY (assignment_id) REFERENCES assignments (id),
    UNIQUE (assignment_id, user_dni)
);

-- Formativo vs sumativo: se añade a bases ya creadas. Las tareas viejas quedan
-- como sumativas.
--   ALTER TABLE assignments ADD COLUMN grading_mode TEXT DEFAULT 'summative';
--   ALTER TABLE assignments ADD COLUMN plan_id TEXT;

-- Planes de evaluación: agrupan las tareas generadas por la IA desde un archivo.
CREATE TABLE IF NOT EXISTS evaluation_plans (
    id                    TEXT PRIMARY KEY,
    professor_dni         TEXT NOT NULL,
    course_id             TEXT NOT NULL,
    title                 TEXT NOT NULL,
    strategy              TEXT,
    source_filename       TEXT,
    max_score             REAL NOT NULL,
    points_per_evaluation REAL NOT NULL,
    evaluation_count      INTEGER NOT NULL,
    section_id            TEXT,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Errores conceptuales: alimenta el reporte del docente por tema/concepto.
CREATE TABLE IF NOT EXISTS concept_errors (
    id            TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL,
    concept       TEXT NOT NULL,
    user_dni      TEXT NOT NULL,
    source        TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_concept_errors_assignment
    ON concept_errors (assignment_id, concept);
CREATE INDEX IF NOT EXISTS idx_concept_errors_user
    ON concept_errors (assignment_id, user_dni);
