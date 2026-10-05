/* ============================================
   MIRAI AI - Envío de correo (Cloudflare Email Sending)

   ============================================ */
import { logApiUsage } from './usage';

// ── CORREO TRANSACCIONAL (Cloudflare Email Sending, binding EMAIL) ────────
// El dominio remitente debe estar onboarded en Email Sending:
//   npx wrangler email sending enable aberumirai.com
const EMAIL_FROM = { email: 'mirai@aberumirai.com', name: 'Mirai AI' };

/**
 * Plantilla base de los correos. Pensada para clientes de correo, no para el
 * navegador: tablas, estilos en línea y cero JavaScript. Gmail y Outlook
 * descartan <style> y <script>, y un correo con scripts dentro puntúa como
 * phishing en los filtros antispam.
 */
function renderEmailShell({ title, intro, bodyHtml, outro }: { title: string; intro: string; bodyHtml: string; outro: string }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#0d1117;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0d1117" style="background-color:#0d1117;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px; background-color:#161b22; border:1px solid #30363d; border-radius:12px;">
        <tr>
          <td style="padding:36px 32px; font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 26px; font-size:20px; font-weight:bold; color:#e6edf3; text-align:center;">${title}</p>
            <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#c9d1d9;">${intro}</p>
${bodyHtml}
            <p style="margin:26px 0 0; font-size:13px; line-height:1.6; color:#8b949e;">${outro}</p>
            <p style="margin:28px 0 0; padding-top:16px; border-top:1px solid #30363d; font-size:11px; line-height:1.6; color:#6e7681; text-align:center;">
              Mirai AI &middot; aberumirai.com<br>Correo automático, no respondas a este mensaje.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Envío transaccional vía el binding send_email de Cloudflare.
 * @returns {Promise<boolean>} true si Cloudflare aceptó el mensaje.
 */
async function sendEmail(env: Env, { to, subject, html, text, kind }: { to: string; subject: string; html: string; text: string; kind: string }) {
  if (!env.EMAIL) {
    console.error('Binding EMAIL (send_email) no configurado en wrangler.toml');
    return false;
  }

  try {
    const res = await env.EMAIL.send({ from: EMAIL_FROM, to, subject, html, text });
    await logApiUsage(env, { provider: 'cloudflare_email', unit_type: 'email', sub_type: kind });
    console.log(`📧 [${kind}] enviado a ${to} (${res?.messageId || 'sin id'})`);
    return true;
  } catch (error: any) {
    // error.code trae los E_* de Email Sending (E_SENDER_NOT_VERIFIED,
    // E_DAILY_LIMIT_EXCEEDED, E_RECIPIENT_SUPPRESSED...): sin él no hay forma
    // de distinguir "dominio mal configurado" de "cuota agotada".
    console.error(`❌ Email Sending [${kind}] falló: ${error.code || 'sin código'} — ${error.message}`);
    return false;
  }
}

/**
 * Envía el código de verificación en dos pasos.
 * @param {string} email - Destinatario
 * @param {string} code  - Código OTP de 6 dígitos
 * @param {Object} env   - Bindings del Worker (necesita EMAIL)
 * @returns {Promise<boolean>}
 */
export async function sendVerificationEmail(email: any, code: string, env: Env) {
  const bodyHtml = `            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding:6px 0;">
                  <div style="display:inline-block; padding:16px 26px; background-color:#0d1117; border:1px solid #30363d; border-radius:8px; font-family:'Courier New',Courier,monospace; font-size:32px; font-weight:bold; letter-spacing:8px; color:#58a6ff;">${code}</div>
                </td>
              </tr>
            </table>`;

  const html = renderEmailShell({
    title: '🔐 Tu código de Mirai AI',
    intro: 'Introduce este código en la página de verificación para continuar:',
    bodyHtml,
    outro: 'El código caduca en 10 minutos y solo sirve en el navegador desde el que lo pediste. Si no has sido tú, ignora este correo y cambia tu contraseña.'
  });

  const text = [
    'Tu código de Mirai AI',
    '',
    `Código: ${code}`,
    '',
    'Caduca en 10 minutos y solo sirve en el navegador desde el que lo pediste.',
    'Si no has sido tú, ignora este correo y cambia tu contraseña.',
    '',
    'Mirai AI · aberumirai.com'
  ].join('\n');

  return sendEmail(env, {
    to: email,
    subject: `${code} es tu código de verificación — Mirai AI`,
    html,
    text,
    kind: 'verification'
  });
}

// --- ENVIAR CORREO DE RECUPERACIÓN ---
export async function sendRecoveryEmail(email: any, token: string, env: Env) {
  const recoveryLink = `https://aberumirai.com/reset-password.html?token=${encodeURIComponent(token)}`;

  const bodyHtml = `            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto;">
              <tr>
                <td align="center" bgcolor="#58a6ff" style="border-radius:8px;">
                  <a href="${recoveryLink}" style="display:inline-block; padding:14px 28px; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:#0d1117; text-decoration:none;">Restablecer contraseña</a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0; font-size:11px; line-height:1.5; color:#6e7681; text-align:center; word-break:break-all;">
              Si el botón no funciona, copia este enlace:<br>${recoveryLink}
            </p>`;

  const html = renderEmailShell({
    title: '🔑 Restablecer tu contraseña',
    intro: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta de Mirai AI.',
    bodyHtml,
    outro: 'El enlace caduca en 1 hora. Si no has sido tú, ignora este correo: tu contraseña no cambiará.'
  });

  const text = [
    'Restablecer tu contraseña de Mirai AI',
    '',
    'Abre este enlace para crear una nueva contraseña:',
    recoveryLink,
    '',
    'El enlace caduca en 1 hora. Si no has sido tú, ignora este correo.',
    '',
    'Mirai AI · aberumirai.com'
  ].join('\n');

  return sendEmail(env, {
    to: email,
    subject: 'Restablecer tu contraseña — Mirai AI',
    html,
    text,
    kind: 'recovery'
  });
}
