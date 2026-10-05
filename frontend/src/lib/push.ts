// Notificaciones push (migración de public/notifications.js).
//
// La suscripción se guarda en el Worker (/api/notifications/subscribe) y el
// envío lo hace él mismo (workers/lib/push.ts). Aquí solo se pide permiso y se
// registra la suscripción del navegador con la clave VAPID pública.

import { api } from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

async function vapidKey(): Promise<string | null> {
  try {
    const { ok, data } = await api.get<{ publicKey?: string }>('/api/vapid-key');
    return ok && data.publicKey ? data.publicKey : null;
  } catch {
    return null;
  }
}

/** Suscribe este navegador y guarda la suscripción en el servidor. */
export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Notif] Push no soportado en este navegador.');
    return false;
  }
  const key = await vapidKey();
  if (!key) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const { endpoint, keys } = sub.toJSON();
    const { ok } = await api.post('/api/notifications/subscribe', { endpoint, p256dh: keys?.p256dh, auth: keys?.auth });
    if (!ok) throw new Error('Error al guardar suscripción');
    return true;
  } catch (err) {
    console.error('[Notif] Error suscribiendo:', err);
    return false;
  }
}

/** Si el permiso ya estaba concedido, re-sincroniza la suscripción sin preguntar. */
export async function ensureSubscribed(): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  return subscribeToPush();
}

/**
 * Pide permiso (si hace falta) y suscribe. Devuelve el resultado para que la
 * página muestre su propio aviso.
 */
export async function requestNotifications(): Promise<'granted' | 'subscribe-failed' | 'denied' | 'blocked' | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
  }
  return (await subscribeToPush()) ? 'granted' : 'subscribe-failed';
}
