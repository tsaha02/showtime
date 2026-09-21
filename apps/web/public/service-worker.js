// ShowTime service worker — currently exists solely to receive and display
// Web Push notifications for the "your held seats are about to expire"
// nudge (see apps/api's pushNotificationService.ts for what triggers a
// push, and apps/web's src/lib/pushNotifications.ts +
// EnableSeatNotifications.tsx for how a browser subscribes in the first
// place). Deliberately plain JS with no build step — the browser runs this
// file directly from /service-worker.js, so it can't import TS or anything
// bundled.

self.addEventListener("push", (event) => {
  let payload = { title: "ShowTime", body: "You have a new notification.", url: "/" };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = {
        title: typeof data.title === "string" && data.title ? data.title : payload.title,
        body: typeof data.body === "string" && data.body ? data.body : payload.body,
        url: typeof data.url === "string" && data.url ? data.url : payload.url,
      };
    } catch (err) {
      // Malformed/non-JSON payload — fall back to the generic copy above
      // rather than letting this throw and kill the push event.
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/favicon.svg",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const origin = self.location.origin;
        const existing = clientList.find((c) => c.url.startsWith(origin));

        if (existing) {
          if ("navigate" in existing) {
            return existing
              .navigate(targetUrl)
              .then((c) => (c || existing).focus())
              .catch(() => existing.focus());
          }
          return existing.focus();
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
