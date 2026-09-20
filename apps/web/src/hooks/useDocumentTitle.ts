import { useEffect } from "react";

// This app is a client-rendered SPA with one static `<title>` in
// index.html — without this, every route shows the same generic browser-
// tab title and, more importantly to SEO, the same title to any crawler
// that only reads the initial HTML rather than executing JS. Googlebot
// itself DOES execute JS and will pick this up, so it's a real (if
// partial — a non-JS crawler or a raw social-preview fetch still only
// ever sees index.html's static tags) win, not just a cosmetic one.
// Restores the previous title on unmount so navigating away (e.g. into
// a modal-like flow) doesn't leave a stale title behind.
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ShowTime` : "ShowTime";
    return () => {
      document.title = previous;
    };
  }, [title]);
}
