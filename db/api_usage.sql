-- Registro de consumo de APIs externas de pago (DeepSeek, Pruna AI, Resend,
-- Exa, Firecrawl, Google Maps/YouTube), usado por el panel de administración
-- /api_usage_admin (endpoint GET /api/admin/api-usage).
--
-- Este archivo es solo referencia documentada: la tabla real se autoprovisiona
-- en runtime vía ensureApiUsageTable() en workers/worker.js, siguiendo la
-- misma convención que daily_tokens/gen_history/video_avatar_jobs.
CREATE TABLE IF NOT EXISTS api_usage_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    provider      TEXT    NOT NULL, 
    unit_type     TEXT    NOT NULL, 
    sub_type      TEXT,             
    units         REAL    NOT NULL DEFAULT 1,
    tokens_in     INTEGER,
    tokens_out    INTEGER,
    cost_usd      REAL    NOT NULL DEFAULT 0,
    user_dni      TEXT,
    via_gateway   INTEGER NOT NULL DEFAULT 0, 
    usage_date    TEXT    NOT NULL, 
    usage_month   TEXT    NOT NULL, 
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_usage_month_provider ON api_usage_log (usage_month, provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_month_provider_sub ON api_usage_log (usage_month, provider, sub_type);
