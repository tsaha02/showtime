import { useEffect, useState } from "react";

// Returns `value`, but only after it's stopped changing for `delayMs`.
// Used to hold off firing a search request on every keystroke (see
// HomePage.tsx / SearchMoviesPage.tsx) — the input field itself still
// updates instantly, only the value fed into the RTK Query hook lags
// behind by a beat.
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
