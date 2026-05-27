CREATE TABLE
    IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_dni TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'pendiente' CHECK (
            status IN ('pendiente', 'progreso', 'revision', 'completado')
        ),
        priority TEXT DEFAULT 'media' CHECK (priority IN ('baja', 'media', 'alta', 'critica')),
        assignee TEXT DEFAULT '',
        tag TEXT DEFAULT '',
        due_date TEXT,
        estimated_time REAL DEFAULT 0,
        progress INTEGER DEFAULT 0,
        project TEXT DEFAULT '',
        done INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

CREATE INDEX IF NOT EXISTS idx_tasks_user_dni ON tasks (user_dni);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);