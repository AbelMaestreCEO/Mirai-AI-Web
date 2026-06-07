/* ============================================================
   MIRAI AI — Notificaciones Push reutilizables
   Usar en: inventory.html, classroom.html, tasks.html
   ============================================================ */

async function miraiSubscribeUser(vapidKey) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Notif] Push no soportado en este navegador.');
        return false;
    }
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
        const res = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ subscription: sub })
        });
        if (!res.ok) throw new Error('Error al guardar suscripción');
        console.log('[Notif] ✅ Suscripción registrada en servidor');
        return true;
    } catch (err) {
        console.error('[Notif] Error suscribiendo:', err);
        return false;
    }
}

async function miraiRequestNotifications(onSuccess, onDenied) {
    if (!('Notification' in window)) {
        alert('Tu navegador no soporta notificaciones.');
        return;
    }
    if (Notification.permission === 'granted') {
        const keyRes = await fetch('/api/vapid-key', { credentials: 'same-origin' });
        const { publicKey } = await keyRes.json();
        await miraiSubscribeUser(publicKey);
        if (onSuccess) onSuccess();
        return;
    }
    if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            const keyRes = await fetch('/api/vapid-key', { credentials: 'same-origin' });
            const { publicKey } = await keyRes.json();
            await miraiSubscribeUser(publicKey);
            if (onSuccess) onSuccess();
        } else {
            if (onDenied) onDenied();
        }
    }
}

function miraiInitNotificationToggle(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;

    // Reflejar estado actual
    if (Notification.permission === 'granted') {
        checkbox.checked = true;
        syncToggleTrack(checkbox);
    }

    checkbox.addEventListener('change', async function () {
        syncToggleTrack(this);
        if (this.checked) {
            await miraiRequestNotifications(
                () => console.log('[Notif] Activadas'),
                () => { this.checked = false; syncToggleTrack(this); alert('Permiso denegado por el sistema.'); }
            );
        }
    });
}

function syncToggleTrack(checkbox) {
    // Busca el span track hermano del checkbox
    const track = checkbox.nextElementSibling;
    const thumb = track ? track.nextElementSibling : null;
    if (track) track.style.background = checkbox.checked ? 'var(--accent-color)' : 'var(--glass-border)';
    if (thumb) thumb.style.transform = checkbox.checked ? 'translateX(20px)' : 'translateX(0)';
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}