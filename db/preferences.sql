-- Agregar columna de preferencias detectadas por IA a la tabla users
ALTER TABLE users ADD COLUMN ai_preferences_json TEXT DEFAULT '{}';
