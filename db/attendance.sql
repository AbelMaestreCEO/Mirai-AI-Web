
CREATE TABLE IF NOT EXISTS att_staff (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,
    dni         TEXT NOT NULL UNIQUE,
    department  TEXT,
    position    TEXT,
    email       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_att_staff_dni ON att_staff(dni);

CREATE TABLE IF NOT EXISTS att_qr_sessions (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    token       TEXT NOT NULL UNIQUE, 
    date        TEXT NOT NULL, 
    expires_at  TEXT NOT NULL,   
    scan_count  INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT NOT NULL,    
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(date)       
);

CREATE INDEX IF NOT EXISTS idx_att_qr_date  ON att_qr_sessions(date);
CREATE INDEX IF NOT EXISTS idx_att_qr_token ON att_qr_sessions(token);

CREATE TABLE IF NOT EXISTS att_records (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    session_id  TEXT NOT NULL REFERENCES att_qr_sessions(id) ON DELETE CASCADE,
    staff_id    TEXT NOT NULL REFERENCES att_staff(id)        ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK(type IN ('entrada','salida')),
    date        TEXT NOT NULL,          
    time        TEXT NOT NULL,         
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_att_records_staff   ON att_records(staff_id);
CREATE INDEX IF NOT EXISTS idx_att_records_date    ON att_records(date);
CREATE INDEX IF NOT EXISTS idx_att_records_session ON att_records(session_id);

CREATE VIEW IF NOT EXISTS att_records_full AS
    SELECT
        r.id,
        r.type,
        r.date,
        r.time,
        r.created_at,
        r.session_id,
        s.name        AS staff_name,
        s.dni         AS staff_dni,
        s.department,
        s.position,
        q.token       AS qr_token,
        q.date        AS session_date
    FROM att_records r
    JOIN att_staff       s ON r.staff_id  = s.id
    JOIN att_qr_sessions q ON r.session_id = q.id;