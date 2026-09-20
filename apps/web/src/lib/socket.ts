import { io } from "socket.io-client";

// A single shared socket instance for the whole app. Created once at
// module load (not per-component) so every page sees the same connection
// and `show:join`/`show:leave` calls operate on one socket.
export const socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000", {
  withCredentials: true,
  autoConnect: true,
});
