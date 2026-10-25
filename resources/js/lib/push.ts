/* Browser push helpers. Nothing here asks for a permission by itself: call these from a user action. */
import { del, post } from './api';

export function pushSupport(): { supported: boolean; reason?: string } {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return { supported: false, reason: "Ce navigateur ne prend pas en charge les notifications push (sur iPhone, l'application doit d'abord être ajoutée à l'écran d'accueil)." };
    }
    if (!window.isSecureContext) return { supported: false, reason: 'Les notifications push exigent une connexion HTTPS.' };
    return { supported: true };
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
    if (!pushSupport().supported) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks the browser permission (must follow a click), subscribes and registers the subscription on the server. */
export async function enablePush(publicKey: string): Promise<'granted' | 'denied' | 'default'> {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission;
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/service-worker.js'));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    await post('/api/v1/push-subscriptions', sub.toJSON());
    return 'granted';
}

export async function disablePush(): Promise<void> {
    const sub = await currentSubscription();
    if (!sub) return;
    await del('/api/v1/push-subscriptions', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
}

/** Local test notification (no server involved): only proves that this browser can display notifications. */
export async function showLocalTest(): Promise<void> {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) throw new Error("Le service worker n'est pas actif (disponible dans la version installée/de production).");
    await reg.showNotification('Test local', { body: "Ce test s'affiche sur cet appareil, sans passer par le serveur.", icon: '/icons/icon-192.png', tag: 'moyo-local-test' });
}
