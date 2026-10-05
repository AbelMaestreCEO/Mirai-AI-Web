/* ============================================
   MIRAI AI - Cuenta: registro, login, OTP y recuperación de contraseña

   ============================================ */
import {
  SESSION_MAX_AGE_SECS,
  clearSessionCookie,
  clientIp,
  generateSalt,
  hashPassword,
  isValidEmail,
  makeSessionCookie,
  rateLimit,
  safeEqual,
} from '../lib/auth';
import { sendRecoveryEmail, sendVerificationEmail } from '../lib/email';
import { jsonResponse } from '../lib/http';

// ── RETO DE VERIFICACIÓN EN DOS PASOS ─────────────────────────────────────
// El código de 6 dígitos nunca identifica por sí solo a un usuario: va siempre
// acompañado de un token opaco que vive en una cookie HttpOnly de 10 minutos.
// Sin ese token, acertar el código no sirve de nada.
const OTP_TTL_SECS = 10 * 60;

const OTP_MAX_ATTEMPTS = 5;

function makePendingCookie(token) {
  return `otp_pending=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${OTP_TTL_SECS}`;
}

function clearPendingCookie() {
  return `otp_pending=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function getPendingToken(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)otp_pending=([^;]+)/);
  return match ? match[1] : null;
}

function generateOTP() {
  // crypto.getRandomValues en lugar de Math.random: un OTP predecible no es un
  // OTP. El rechazo por encima de `limit` evita el sesgo del módulo.
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xFFFFFFFF / 900000) * 900000;
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return String(100000 + (buf[0] % 900000));
}

/**
 * Crea (o renueva) el reto OTP de un usuario y le envía el correo.
 * La expiración se calcula con datetime() de SQLite para que quede en el mismo
 * formato que datetime('now'); guardarla como ISO de JS hacía que la
 * comparación de texto fuese siempre verdadera dentro del mismo día.
 * @returns {Promise<{token: string, sent: boolean}>}
 */
async function issueOtpChallenge(env, user) {
  const code = generateOTP();
  const token = crypto.randomUUID();

  await env.MIRAI_AI_DB.prepare(
    `UPDATE users
        SET otp_code = ?, otp_token = ?, otp_attempts = 0,
            otp_expires = datetime('now', '+${OTP_TTL_SECS} seconds')
      WHERE dni = ?`
  ).bind(code, token, user.dni).run();

  const sent = await sendVerificationEmail(user.email, code, env);
  return { token, sent };
}

/** Consume/anula el reto pendiente de un usuario. */
async function clearOtpChallenge(env, dni) {
  await env.MIRAI_AI_DB.prepare(
    `UPDATE users
        SET otp_code = NULL, otp_expires = NULL, otp_token = NULL, otp_attempts = 0
      WHERE dni = ?`
  ).bind(dni).run();
}

export async function handleRegister(request, env, corsHeaders) {
  try {
    // Cada alta dispara un correo: sin techo por IP es un vector de spam.
    if (!await rateLimit(env, `register:${clientIp(request)}`, 5, 3600)) {
      return jsonResponse({ error: 'Demasiados registros desde esta conexión. Inténtalo más tarde.' }, 429, corsHeaders);
    }

    const { dni, email, password, first_name, last_name } = await request.json();

    // Validaciones básicas
    if (!dni || !email || !password || !first_name || !last_name) {
      return jsonResponse({ error: 'Todos los campos son requeridos (incluye nombre y apellido)' }, 400, corsHeaders);
    }
    if (!isValidEmail(email)) {
      return jsonResponse({ error: 'Correo inválido' }, 400, corsHeaders);
    }
    if (password.length < 8) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400, corsHeaders);
    }
    if (!/^[A-Z]{1,5}-[A-Z0-9]{5,15}$/.test(dni.toUpperCase())) {
      return jsonResponse({ error: 'Formato de DNI inválido' }, 400, corsHeaders);
    }

    // Verificar si existe
    const existing = await env.MIRAI_AI_DB.prepare(
      "SELECT dni FROM users WHERE dni = ? OR email = ?"
    ).bind(dni.toUpperCase(), email.toLowerCase()).first();

    if (existing) {
      return jsonResponse({ error: 'Usuario ya registrado' }, 409, corsHeaders);
    }

    // Hash de contraseña
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    // Alta sin reto: el OTP lo emite issueOtpChallenge justo después.
    await env.MIRAI_AI_DB.prepare(
      `INSERT INTO users (dni, email, password_hash, first_name, last_name, is_verified)
       VALUES (?, ?, ?, ?, ?, 0)`
    ).bind(
      dni.toUpperCase(),
      email.toLowerCase(),
      `${salt}:${passwordHash}`,
      first_name.trim(),
      last_name.trim()
    ).run();

    // El token del reto viaja en cookie HttpOnly; el código, por correo.
    // Se envía siempre, aunque el correo falle, para que "Reenviar código"
    // pueda funcionar sin volver a pedir la contraseña.
    const { token: pendingToken, sent } = await issueOtpChallenge(env, {
      dni: dni.toUpperCase(),
      email: email.toLowerCase()
    });

    const headers = new Headers({ ...corsHeaders, 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', makePendingCookie(pendingToken));

    return new Response(JSON.stringify({
      success: true,
      needs_verification: true,
      message: sent
        ? 'Registro exitoso. Revisa tu correo para verificar tu cuenta.'
        : 'Registro exitoso, pero no pudimos enviar el correo. Usa "Reenviar código" en la página de verificación.',
      warning: sent ? undefined : 'No se pudo enviar el correo de verificación.'
    }), { status: 201, headers });

  } catch (error) {
    console.error('Error registro:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

export async function handleVerify(request, env, corsHeaders) {
  try {
    // El reto se identifica por la cookie HttpOnly emitida al iniciar sesión,
    // no por el código. Un código suelto ya no abre la sesión de nadie.
    const pendingToken = getPendingToken(request);
    if (!pendingToken) {
      return jsonResponse({ error: 'No hay una verificación en curso. Vuelve a iniciar sesión.' }, 401, corsHeaders);
    }

    // Techo por IP: aunque el atacante rote tokens, no puede probar en volumen.
    if (!await rateLimit(env, `verify:${clientIp(request)}`, 20, 600)) {
      return jsonResponse({ error: 'Demasiados intentos. Espera unos minutos.' }, 429, corsHeaders);
    }

    const { code } = await request.json();
    const submitted = String(code || '').trim();

    if (!/^\d{6}$/.test(submitted)) {
      return jsonResponse({ error: 'El código debe tener 6 dígitos' }, 400, corsHeaders);
    }

    const user = await env.MIRAI_AI_DB.prepare(
      `SELECT *, (otp_expires > datetime('now')) AS otp_valid
         FROM users
        WHERE otp_token = ?`
    ).bind(pendingToken).first();

    // Mismo mensaje para "token desconocido", "caducado" y "código erróneo":
    // distinguirlos le diría al atacante qué parte acertó.
    if (!user || !user.otp_code || !user.otp_valid) {
      if (user) await clearOtpChallenge(env, user.dni);
      return jsonResponse({ error: 'Código inválido o expirado.' }, 401, corsHeaders);
    }

    if ((user.otp_attempts || 0) >= OTP_MAX_ATTEMPTS) {
      await clearOtpChallenge(env, user.dni);
      return jsonResponse({ error: 'Demasiados intentos fallidos. Solicita un código nuevo.' }, 429, corsHeaders);
    }

    if (!safeEqual(submitted, user.otp_code)) {
      // El contador vive en D1, que es consistente: es el límite que de verdad
      // frena la fuerza bruta, KV solo amortigua el volumen.
      await env.MIRAI_AI_DB.prepare(
        "UPDATE users SET otp_attempts = otp_attempts + 1 WHERE dni = ?"
      ).bind(user.dni).run();

      return jsonResponse({ error: 'Código inválido o expirado.' }, 401, corsHeaders);
    }

    // ✅ Código correcto: se consume el reto y se abre la sesión.
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECS * 1000).toISOString();

    await env.MIRAI_AI_DB.prepare(
      "INSERT INTO sessions (token, user_dni, expires_at) VALUES (?, ?, ?)"
    ).bind(token, user.dni, expiresAt).run();

    await env.MIRAI_AI_DB.prepare(
      `UPDATE users
          SET last_login = datetime('now'),
              is_verified = 1,
              otp_code = NULL, otp_expires = NULL, otp_token = NULL, otp_attempts = 0
        WHERE dni = ?`
    ).bind(user.dni).run();

    // Asignar retroactivamente las tareas de secciones donde el DNI ya estaba registrado
    // Cubre el caso: profesor agregó al estudiante antes de que tuviera cuenta
    try {
      const { results: pendingTasks } = await env.MIRAI_AI_DB.prepare(`
        SELECT a.id AS assignment_id
        FROM section_students ss
        JOIN assignments a ON a.section_id = ss.section_id
        WHERE ss.user_dni = ?
      `).bind(user.dni.toUpperCase()).all();

      for (const task of pendingTasks) {
        await env.MIRAI_AI_DB.prepare(
          'INSERT OR IGNORE INTO assignment_students (assignment_id, user_dni) VALUES (?, ?)'
        ).bind(task.assignment_id, user.dni.toUpperCase()).run();
      }
    } catch (e) {
      console.warn('No se pudieron asignar tareas retroactivas al verificar:', e.message);
    }

    // Dos Set-Cookie: abre la sesión y borra el reto ya consumido.
    const headers = new Headers({ ...corsHeaders, 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', makeSessionCookie(token));
    headers.append('Set-Cookie', clearPendingCookie());

    return new Response(JSON.stringify({
      success: true,
      dni: user.dni.toUpperCase(),
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_url: user.avatar_r2_key ? `/api/user/avatar/${user.dni.toUpperCase()}` : null,
      role: user.role,
      message: '¡Verificación exitosa! Redirigiendo...'
    }), { status: 200, headers });

  } catch (error) {
    console.error('Error verificación:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

export async function handleResendOTP(request, env, corsHeaders) {
  try {
    // El destinatario sale del reto en curso, nunca del cuerpo de la petición.
    // Aceptar un DNI arbitrario permitía mandarle correos a cualquiera.
    const pendingToken = getPendingToken(request);
    if (!pendingToken) {
      return jsonResponse({ error: 'No hay una verificación en curso. Vuelve a iniciar sesión.' }, 401, corsHeaders);
    }

    const user = await env.MIRAI_AI_DB.prepare(
      "SELECT dni, email FROM users WHERE otp_token = ?"
    ).bind(pendingToken).first();

    if (!user) {
      return jsonResponse({ error: 'La verificación caducó. Vuelve a iniciar sesión.' }, 401, corsHeaders);
    }

    // El enfriamiento se ancla al DNI, no al token: el token rota en cada
    // reenvío, así que contar por token daría un cubo nuevo cada vez.
    const allowed = await rateLimit(env, `resend-dni:${user.dni}`, 1, 60)
      && await rateLimit(env, `resend-ip:${clientIp(request)}`, 5, 3600);

    if (!allowed) {
      return jsonResponse({ error: 'Espera un momento antes de solicitar otro código.' }, 429, corsHeaders);
    }

    // El token rota en cada reenvío, así que la cookie se actualiza aunque el
    // correo falle: si no, el usuario se quedaría sin poder reintentar.
    const { token, sent } = await issueOtpChallenge(env, user);

    const headers = new Headers({ ...corsHeaders, 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', makePendingCookie(token));

    if (!sent) {
      return new Response(
        JSON.stringify({ error: 'No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.' }),
        { status: 502, headers }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Nuevo código enviado a tu correo.' }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('Error reenvío OTP:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

// --- NUEVO: SOLICITAR RECUPERACIÓN ---
export async function handleForgotPassword(request, env, corsHeaders) {
  try {
    // También manda correo, así que también necesita techo.
    if (!await rateLimit(env, `forgot:${clientIp(request)}`, 5, 3600)) {
      return jsonResponse({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' }, 429, corsHeaders);
    }

    const { email } = await request.json();

    if (!email || !isValidEmail(email)) {
      return jsonResponse({ error: 'Correo inválido' }, 400, corsHeaders);
    }

    // Techo por cuenta además del de IP: solo con el límite por IP, rotando
    // direcciones se podía inundar el buzón de una víctima con correos de
    // recuperación. Se responde igual que en el caso correcto para no revelar
    // si la cuenta existe.
    if (!await rateLimit(env, `forgot-acct:${email.toLowerCase()}`, 3, 3600)) {
      return jsonResponse({ success: true, message: 'Si el correo existe, recibirás instrucciones.' }, 200, corsHeaders);
    }

    // Buscar usuario
    const user = await env.MIRAI_AI_DB.prepare(
      "SELECT dni, first_name FROM users WHERE email = ?"
    ).bind(email.toLowerCase()).first();

    if (!user) {
      // Por seguridad, no revelamos si el email existe o no
      // Pero siempre devolvemos éxito para evitar enumeración de usuarios
      return jsonResponse({ success: true, message: 'Si el correo existe, recibirás instrucciones.' }, 200, corsHeaders);
    }

    // Generar token
    const token = crypto.randomUUID();

    // La expiración se calcula con datetime() de SQLite, igual que en
    // issueOtpChallenge(). Guardarla como ISO de JavaScript
    // ("2026-08-29T13:00:00.000Z") hacía que la comparación de texto contra
    // datetime('now') ("2026-08-29 13:00:00") fuese siempre verdadera dentro del
    // mismo día UTC — la 'T' (0x54) ordena por encima del espacio (0x20) —, así
    // que el enlace de recuperación no caducaba en 1 hora sino al cambiar de día.
    await env.MIRAI_AI_DB.prepare(
      `UPDATE users
          SET recovery_token = ?,
              recovery_expires_at = datetime('now', '+3600 seconds')
        WHERE email = ?`
    ).bind(token, email.toLowerCase()).run();

    // Enviar correo
    await sendRecoveryEmail(email, token, env);

    return jsonResponse({ success: true, message: 'Si el correo existe, recibirás instrucciones.' }, 200, corsHeaders);

  } catch (error) {
    console.error('Error forgot password:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

// --- NUEVO: RESETEAR CONTRASEÑA ---
export async function handleResetPassword(request, env, corsHeaders) {
  try {
    const { token, new_password } = await request.json();

    if (!token || !new_password || new_password.length < 8) {
      return jsonResponse({ error: 'Token o contraseña inválidos' }, 400, corsHeaders);
    }

    // Buscar usuario con token válido
    const user = await env.MIRAI_AI_DB.prepare(
      "SELECT dni, password_hash FROM users WHERE recovery_token = ? AND recovery_expires_at > datetime('now')"
    ).bind(token).first();

    if (!user) {
      return jsonResponse({ error: 'Token inválido o expirado' }, 400, corsHeaders);
    }

    // Generar nuevo hash
    const salt = generateSalt();
    const newHash = await hashPassword(new_password, salt);

    // Actualizar contraseña, limpiar el token de recuperación y anular también
    // cualquier reto OTP pendiente de la cuenta.
    await env.MIRAI_AI_DB.prepare(
      `UPDATE users
          SET password_hash = ?, recovery_token = NULL, recovery_expires_at = NULL,
              otp_code = NULL, otp_expires = NULL, otp_token = NULL, otp_attempts = 0
        WHERE dni = ?`
    ).bind(`${salt}:${newHash}`, user.dni).run();

    // Cerrar todas las sesiones abiertas. Las sesiones no vencen por tiempo
    // (ver requireAuth), así que sin este borrado quien hubiese robado una
    // cookie la conservaba para siempre — justo el escenario en el que la
    // víctima cambia la contraseña para recuperar la cuenta.
    await env.MIRAI_AI_DB.prepare(
      'DELETE FROM sessions WHERE user_dni = ?'
    ).bind(user.dni).run();

    return jsonResponse({
      success: true,
      message: 'Contraseña actualizada correctamente. Vuelve a iniciar sesión.'
    }, 200, { ...corsHeaders, 'Set-Cookie': clearSessionCookie() });

  } catch (error) {
    console.error('Error reset password:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}

export async function handleLogin(request, env, corsHeaders) {
  try {
    if (!await rateLimit(env, `login-ip:${clientIp(request)}`, 15, 600)) {
      return jsonResponse({ error: 'Demasiados intentos. Espera unos minutos.' }, 429, corsHeaders);
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return jsonResponse({ error: 'Correo y contraseña son requeridos' }, 400, corsHeaders);
    }

    // Techo por cuenta además del de IP: si no, una botnet repartiría la fuerza
    // bruta contra un mismo correo sin llegar nunca al límite por IP.
    if (!await rateLimit(env, `login-acct:${email.toLowerCase()}`, 10, 600)) {
      return jsonResponse({ error: 'Demasiados intentos. Espera unos minutos.' }, 429, corsHeaders);
    }

    const user = await env.MIRAI_AI_DB.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).bind(email.toLowerCase()).first();

    if (!user) {
      return jsonResponse({ error: 'Credenciales inválidas' }, 401, corsHeaders);
    }

    // 2. Validar Contraseña
    // password_hash puede venir vacío (alumnos dados de alta por un profesor
    // antes de registrarse): sin esto, el split lanzaba y devolvía un 500.
    const [storedSalt, storedHash] = String(user.password_hash || '').split(':');
    if (!storedSalt || !storedHash) {
      return jsonResponse({ error: 'Credenciales inválidas' }, 401, corsHeaders);
    }

    const inputHash = await hashPassword(password, storedSalt);

    // safeEqual en lugar de !==, igual que en la verificación del OTP.
    if (!safeEqual(inputHash, storedHash)) {
      return jsonResponse({ error: 'Credenciales inválidas' }, 401, corsHeaders);
    }

    // Verificar si el usuario tiene 2FA habilitado (true por defecto si no hay preferencia)
    const userSettings = user.settings_json ? JSON.parse(user.settings_json) : {};
    const twoFactorEnabled = userSettings.twoFactor !== false;

    if (!twoFactorEnabled) {
      // 2FA desactivado — crear sesión directamente, igual que handleVerify
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECS * 1000).toISOString();

      await env.MIRAI_AI_DB.prepare(
        "INSERT INTO sessions (token, user_dni, expires_at) VALUES (?, ?, ?)"
      ).bind(token, user.dni, expiresAt).run();

      await env.MIRAI_AI_DB.prepare(
        `UPDATE users
            SET last_login = datetime('now'),
                otp_code = NULL, otp_expires = NULL, otp_token = NULL, otp_attempts = 0
          WHERE dni = ?`
      ).bind(user.dni).run();

      return new Response(JSON.stringify({
        success: true,
        dni: user.dni,
        first_name: user.first_name,
        role: user.role,
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Set-Cookie': makeSessionCookie(token)
        }
      });
    }

    // 2FA activo — emitir el reto y devolver su token en cookie HttpOnly.
    const { token: pendingToken, sent } = await issueOtpChallenge(env, user);

    // 403 + needs_verification es lo que login.js espera para redirigir a /verify.
    const headers = new Headers({ ...corsHeaders, 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', makePendingCookie(pendingToken));

    if (!sent) {
      return new Response(JSON.stringify({
        error: 'No pudimos enviar el código de verificación. Prueba con "Reenviar código".',
        needs_verification: true
      }), { status: 403, headers });
    }

    return new Response(JSON.stringify({
      error: 'Verificación necesaria: te hemos enviado un código a tu correo.',
      needs_verification: true,
      message_sent: true
    }), { status: 403, headers });

  } catch (error) {
    console.error('Error login:', error);
    return jsonResponse({ error: 'Error interno' }, 500, corsHeaders);
  }
}
