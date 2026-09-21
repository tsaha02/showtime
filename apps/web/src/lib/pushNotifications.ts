// Plain helper functions (not a React hook) for registering the service
// worker and subscribing to Web Push. Kept UI-free so EnableSeatNotifications
// (the only current caller) stays a thin component and this logic is easy to
// reuse elsewhere later without dragging React along.

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    // PushManager.subscribe() requires an *active* worker — register()
    // resolves as soon as installation starts, which is too early and
    // fails subscribe() with a cryptic "no active Service Worker" error.
    // `serviceWorker.ready` resolves once a worker for this scope is active.
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn("ShowTime: service worker registration failed", err);
    return null;
  }
}

// Standard VAPID-key conversion: PushManager.subscribe's applicationServerKey
// wants a Uint8Array, but the server hands us a URL-safe base64 string.
// Padding + `-`/`_` -> `+`/`/` must be exact or `subscribe()` fails with an
// opaque "invalid raw ECDSA P-256 public key" error.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getExistingSubscription(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.warn("ShowTime: failed to read existing push subscription", err);
    return null;
  }
}
