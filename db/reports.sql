
CREATE TABLE IF NOT EXISTS reports (
  id             TEXT    PRIMARY KEY,
  teacher_dni    TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  description    TEXT    DEFAULT '',
  icon           TEXT    DEFAULT '📋',
  deadline       TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  questions_json TEXT    NOT NULL DEFAULT '[]',
  access_json    TEXT    NOT NULL DEFAULT '[]',
  section_id     TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_dni) REFERENCES users(dni) ON DELETE CASCADE,
  FOREIGN KEY (section_id)  REFERENCES sections(id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS report_submissions (
  id           TEXT PRIMARY KEY,
  report_id    TEXT NOT NULL,
  student_dni  TEXT NOT NULL,
  answers_json TEXT NOT NULL DEFAULT '{}',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_id, student_dni),    
  FOREIGN KEY (report_id)   REFERENCES reports(id)   ON DELETE CASCADE,
  FOREIGN KEY (student_dni) REFERENCES users(dni)    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_teacher
  ON reports(teacher_dni);

CREATE INDEX IF NOT EXISTS idx_reports_section
  ON reports(section_id);

CREATE INDEX IF NOT EXISTS idx_reports_active
  ON reports(active, created_at);

CREATE INDEX IF NOT EXISTS idx_submissions_report
  ON report_submissions(report_id);

CREATE INDEX IF NOT EXISTS idx_submissions_student
  ON report_submissions(student_dni);

CREATE INDEX IF NOT EXISTS idx_submissions_student_report
  ON report_submissions(student_dni, report_id);