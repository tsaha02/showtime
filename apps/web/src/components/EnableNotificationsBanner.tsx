import { useEffect, useState } from "react";
import { Alert, Chip, IconButton, Stack, Button, Typography, Container } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import { useLazyGetVapidPublicKeyQuery, useSubscribePushMutation } from "../store/api";
import { isPushSupported, registerServiceWorker, urlBase64ToUint8Array } from "../lib/pushNotifications";

const DISMISSED_KEY = "st_push_prompt_dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // localStorage unavailable (private browsing, etc.) — worst case the
    // prompt reappears next visit, which is harmless.
  }
}

// Site-wide, shown-once opt-in for the "you forgot to finish booking"
// push nudge (see apps/api's pushNotificationService.ts) — mounted once
// in App.tsx, above every route, rather than only appearing once
// someone's already mid-checkout on SeatMapPage. The reasoning for
// asking this early: the whole point of the eventual push is to reach
// someone who's already LEFT, and permission has to be granted before
// that abandonment happens — waiting until they're mid-booking to ask
// means anyone who leaves on their very first booking attempt was never
// even eligible to be notified.
//
// Still deliberately NOT an immediate native permission dialog on page
// load: browsers show a weakened/quieter version of that prompt (and
// most users reflexively deny it) when a site asks with no stated
// reason. "Enable" here is a real click on OUR OWN banner — the actual
// `Notification.requestPermission()` call only fires from that
// click, which is what makes it a genuine user gesture with context,
// not a cold ask.
export function EnableNotificationsBanner() {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [fetchVapidKey] = useLazyGetVapidPublicKeyQuery();
  const [subscribePush] = useSubscribePushMutation();

  const supported = isPushSupported();
  const permission = supported ? Notification.permission : "denied";

  useEffect(() => {
    if (!supported || dismissed || permission !== "default") return;
    fetchVapidKey()
      .unwrap()
      .then((key) => setVapidKey(key))
      .catch(() => setVapidKey(null));
    // Only need to check once on mount — permission/dismissed state changes
    // are handled by the render guard below, not by re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hide = () => {
    markDismissed();
    setDismissed(true);
  };

  const handleEnable = async () => {
    if (!vapidKey) return hide();
    try {
      const registration = await registerServiceWorker();
      if (!registration) return hide();

      const permissionResult = await Notification.requestPermission();
      if (permissionResult !== "granted") return hide();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return hide();

      await subscribePush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      }).unwrap();

      hide();
    } catch (err) {
      // Nice-to-have opt-in feature — any failure (permission denied,
      // subscribe unsupported on this device/platform, network error)
      // should fail quietly, not interrupt browsing.
      console.warn("ShowTime: push subscription failed", err);
      hide();
    }
  };

  if (!supported || dismissed || permission !== "default" || !vapidKey) return null;

  return (
    <Container maxWidth="lg" sx={{ pt: 2 }}>
      <Alert
        severity="info"
        variant="outlined"
        icon={false}
        sx={{ borderColor: "secondary.main" }}
        action={
          <IconButton size="small" aria-label="Dismiss" onClick={hide}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      >
        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Chip
            icon={<NotificationsActiveOutlinedIcon fontSize="small" />}
            label="🔔"
            size="small"
            color="secondary"
            variant="outlined"
          />
          <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
            Enable notifications and we'll remind you if you ever leave a booking unfinished — so you don't
            lose your seats without knowing.
          </Typography>
          <Button size="small" variant="outlined" color="secondary" onClick={handleEnable}>
            Enable
          </Button>
        </Stack>
      </Alert>
    </Container>
  );
}
