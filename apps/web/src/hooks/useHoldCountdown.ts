import { useEffect, useState } from "react";
import { useAppSelector } from "../store/hooks";
import { selectEarliestHoldExpiry } from "../store/slices/bookingSlice";

// Ticking clocks don't belong in Redux state (nothing external should
// re-render off of "the current time"), so this hook owns the interval
// itself: it reads the earliest hold-expiry timestamp out of the store
// (a plain fact) and recomputes "seconds remaining" against Date.now()
// once a second. Returns null when nothing is held.
export function useHoldCountdown(): number | null {
  const expiresAt = useAppSelector(selectEarliestHoldExpiry);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAt === null) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return secondsLeft;
}
