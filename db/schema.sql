-- ============================================
-- MIRAI AI - Esquema de Base de Datos (D1)
-- Motor: SQLite (Cloudflare D1)
-- ============================================

-- Tabla de conversaciones
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Nueva conversación',
    model TEXT NOT NULL DEFAULT 'deepseek-chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Índices para optimizar consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- Nueva tabla para archivos adjuntos
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_attachments_conversation_id ON attachments(conversation_id);