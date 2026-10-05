/* ============================================
   MIRAI AI - Web Push
   VAPID y cifrado aes128gcm sin dependencias de Node, y preferencias de
   notificación por categoría.
   ============================================ */

// ── Web Push (VAPID + aes128gcm) implementado con Web Crypto API nativa ──
// Cloudflare Workers no soporta de forma fiable los módulos 'https'/'crypto'
// de Node de los que depende el paquete npm 'web-push', así que el cifrado
// (RFC 8291) y la firma VAPID (RFC 8292) se hacen aquí directamente con
// crypto.subtle, sin dependencias externas.

function b64urlToBytes(b64url: string) {
  const pad = '='.repeat((4 - b64url.length % 4) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function bytesToB64url(bytes: Uint8Array) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...arrays: Uint8Array[]) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

async function hmacSha256(keyBytes: Uint8Array, dataBytes: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return new Uint8Array(sig);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t.slice(0, length);
}

async function importVapidPrivateKey(privateKeyB64url: string, publicKeyB64url: string) {
  const d = b64urlToBytes(privateKeyB64url);
  const pub = b64urlToBytes(publicKeyB64url); // 0x04 || X(32) || Y(32)
  const jwk = {
    kty: 'EC', crv: 'P-256',
    d: bytesToB64url(d), x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)),
    ext: true, key_ops: ['sign']
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// JWT firmado ES256 requerido por VAPID (RFC 8292) para autenticar al servidor ante el push service
async function buildVapidJWT(endpoint: any, publicKeyB64url: string, privateKeyB64url: string, subject: string) {
  const url = new URL(endpoint);
  const encoder = new TextEncoder();
  const headerB64 = bytesToB64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payloadB64 = bytesToB64url(encoder.encode(JSON.stringify({
    aud: `${url.protocol}//${url.host}`,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject
  })));
  const unsigned = `${headerB64}.${payloadB64}`;
  const key = await importVapidPrivateKey(privateKeyB64url, publicKeyB64url);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned));
  return `${unsigned}.${bytesToB64url(new Uint8Array(sig))}`;
}

// Cifrado aes128gcm del payload para el destinatario (RFC 8291)
async function encryptWebPushPayload(subscription: PushSubscriptionRecord, payloadObj: unknown) {
  const uaPublicKey = b64urlToBytes(subscription.keys.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(subscription.keys.auth);    // 16 bytes

  const uaKey = await crypto.subtle.importKey('raw', uaPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey) as ArrayBuffer);

  const sharedSecret = new Uint8Array(
    // workers-types llama `$public` a este campo, pero el runtime lee `public`.
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, asKeyPair.privateKey, 256)
  );

  const encoder = new TextEncoder();
  const keyInfo = concatBytes(encoder.encode('WebPush: info\0'), uaPublicKey, asPublicRaw);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // 0x02 = delimitador de último (único) registro, requerido por RFC 8188
  const plaintext = concatBytes(encoder.encode(JSON.stringify(payloadObj)), new Uint8Array([2]));

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);

  return concatBytes(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw, ciphertext);
}

// Lo que se guarda en user_notifications por cada dispositivo suscrito.
interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function sendWebPush(env: Env, subscription: PushSubscriptionRecord, payloadObj: unknown, { ttl = 4 * 3600, urgency = 'high' } = {}) {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error('VAPID keys no configuradas');

  const subject = env.VAPID_SUBJECT || 'mailto:soporte@aberumirai.com';
  const jwt = await buildVapidJWT(subscription.endpoint, publicKey, privateKey, subject);
  const body = await encryptWebPushPayload(subscription, payloadObj);

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': String(ttl),
      'Urgency': urgency, // 'high' evita que Android/Doze retrase la entrega
      'Authorization': `vapid t=${jwt}, k=${publicKey}`
    },
    body
  });
}

// Mapea cada "categoría" de notificación a la preferencia por-página guardada en settings_json
const NOTIF_CATEGORY_SETTING_KEY: Record<string, string> = {
  generation: 'notifyGeneration',
  classroom: 'notifyClassroom',
  inventory: 'notifyInventory',
  report: 'notifyReport',
  task: 'notifyTask'
};

async function shouldSendNotification(env: Env, userDni: string, category: string) {
  try {
    const row = await env.MIRAI_AI_DB.prepare("SELECT settings_json FROM users WHERE dni = ?").bind(userDni).first<any>();
    const settings = row?.settings_json ? JSON.parse(row.settings_json) : {};
    if (settings.notifications === false) return false;
    const key = NOTIF_CATEGORY_SETTING_KEY[category];
    if (key && settings[key] === false) return false;
    return true;
  } catch (error) {
    console.error('Error leyendo preferencias de notificación:', error);
    return true; // no bloquear el envío por un error de lectura de preferencias
  }
}

// 2. Enviar Notificación (Trigger manual o automático)
export async function sendPushNotification(env: Env, userDni: string, title: string, body: string, { category, url = '/', tag = 'mirai-alert' }: { category?: string; url?: string; tag?: string } = {}) {
  try {
    if (category && !(await shouldSendNotification(env, userDni, category))) {
      console.log(`ℹ️ Usuario ${userDni} desactivó notificaciones de "${category}".`);
      return;
    }

    const sub = await env.MIRAI_AI_DB.prepare(
      "SELECT subscription_endpoint, subscription_p256dh, subscription_auth FROM user_notifications WHERE user_dni = ?"
    ).bind(userDni).first<any>();

    if (!sub) {
      console.log(`⚠️ Usuario ${userDni} no tiene suscripción activa.`);
      return;
    }

    const subscription = {
      endpoint: sub.subscription_endpoint,
      keys: { p256dh: sub.subscription_p256dh, auth: sub.subscription_auth }
    };

    const resp = await sendWebPush(env, subscription, {
      notification: { title, body, tag, url }
    });

    if (resp.status === 404 || resp.status === 410) {
      // Suscripción vencida/inválida según el push service: limpiarla
      await env.MIRAI_AI_DB.prepare("DELETE FROM user_notifications WHERE user_dni = ?").bind(userDni).run();
    } else if (!resp.ok) {
      console.error('Error enviando push:', resp.status, await resp.text());
    }
  } catch (error) {
    console.error('Error sending push:', error);
  }
}
