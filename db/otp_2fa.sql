-- Verificación en dos pasos: el reto queda atado al usuario.
--
-- Antes, /api/verify buscaba al usuario SOLO por otp_code, así que un código de
-- 6 dígitos acertado abría la sesión de cualquier cuenta que tuviera un OTP vivo.
-- Ahora el código va acompañado de otp_token, un identificador opaco que viaja
-- en la cookie HttpOnly `otp_pending` y sin el cual el código no sirve de nada.
--
-- otp_attempts es el contador de fallos: a los 5, el reto se anula. Vive en D1
-- (consistente) y no en KV, que es eventual y no sirve para contar intentos.
ALTER TABLE users ADD COLUMN otp_token TEXT;
ALTER TABLE users ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_otp_token ON users (otp_token);

-- Los retos existentes se guardaron como ISO de JavaScript
-- ("2026-08-29T12:10:00.000Z"), formato que al compararse como texto contra
-- datetime('now') ("2026-08-29 12:10:00") daba siempre "no expirado" dentro del
-- mismo día UTC. Se invalidan todos; el siguiente login emite uno nuevo bien
-- formado con datetime('now', '+600 seconds').
UPDATE users SET otp_code = NULL, otp_expires = NULL;

-- Histórico del panel de consumo: Resend -> Cloudflare Email Sending.
UPDATE api_usage_log SET provider = 'cloudflare_email' WHERE provider = 'resend';
