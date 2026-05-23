
    CREATE TABLE IF NOT EXISTS projects (
        id          TEXT PRIMARY KEY,
        user_dni    TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT DEFAULT '',
        tech_stack  TEXT DEFAULT '[]',  
        category    TEXT DEFAULT 'otros',
        file_count  INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_files (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        r2_key      TEXT NOT NULL,
        size        INTEGER DEFAULT 0,
        mime_type   TEXT DEFAULT '',
        uploaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_user_dni ON projects(user_dni);
    CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);

    -- R2 key pattern: projects/{user_dni}/{project_id}/{file_id}-{filename}