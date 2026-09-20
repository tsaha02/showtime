const STORAGE_KEY = "showtime_session_id";

// The seat-hold system needs to identify "this browser tab's session"
// independent of login, so guests can hold seats too. We generate a UUID
// once and persist it in localStorage; every seat-hold/release/seatmap
// request sends it as the `x-session-id` header. It intentionally has
// nothing to do with auth — a logged-in user still has a session id, and
// it's what the server uses to tell "your own hold" apart from someone
// else's in the seat map response (`heldByMe`).
export function getSessionId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
