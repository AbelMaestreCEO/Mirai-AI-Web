/* ============================================
   MIRAI AI - Suscripción y disparo de notificaciones push

   ============================================ */
import { requireAuth } from '../lib/auth';
import { jsonResponse } from '../lib/http';
import { sendPushNotification } from '../lib/push';

// ============================================
// NOTIFICACIONES PUSH
// ============================================

// 1. Suscribirse (Guardar en D1)
export async function handleSubscribe(request: Request, env: Env, corsHeaders: Record<string, string>) {
  try {
    const userDni = await requireAuth(request, env);
    if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

    const { endpoint, p256dh, auth } = await request.json<any>();

    if (!endpoint || !p256dh || !auth) {
      return jsonResponse({ error: 'Datos de suscripción incompletos' }, 400, corsHeaders);
    }

    // Guardar o actualizar suscripción
    await env.MIRAI_AI_DB.prepare(`
      INSERT INTO user_notifications (id, user_dni, subscription_endpoint, subscription_p256dh, subscription_auth)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_dni) DO UPDATE SET
        subscription_endpoint = excluded.subscription_endpoint,
        subscription_p256dh = excluded.subscription_p256dh,
        subscription_auth = excluded.subscription_auth,
        created_at = datetime('now')
    `).bind(
      crypto.randomUUID(), userDni, endpoint, p256dh, auth
    ).run();

    return jsonResponse({ success: true, message: 'Suscripción guardada' }, 200, corsHeaders);

  } catch (error: any) {
    console.error('Error subscribing:', error);
    return jsonResponse({ error: 'Error al suscribirse', details: error.message }, 500, corsHeaders);
  }
}

// 3. Ruta para activar notificación (Trigger)
export async function handleTriggerNotification(request: Request, env: Env, corsHeaders: Record<string, string>) {
  const userDni = await requireAuth(request, env);
  if (!userDni) return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);

  const { title, body, category, url } = await request.json<any>();

  await sendPushNotification(env, userDni, title, body, { category, url });

  return jsonResponse({ success: true, message: 'Notificación enviada' }, 200, corsHeaders);
}
