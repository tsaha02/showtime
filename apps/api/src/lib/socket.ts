import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient } from "./redis";
import { env } from "../config/env";
import {
  SOCKET_EVENTS,
  type SeatHeldPayload,
  type SeatReleasedPayload,
  type SeatBookedPayload,
  type BookingConfirmedPayload,
} from "@showtime/shared";

export let io: SocketServer;

export function initSocket(server: HttpServer) {
  io = new SocketServer(server, {
    cors: { origin: [env.webOrigin, env.adminOrigin], credentials: true },
  });

  // The Redis adapter is what makes `io.to(room).emit(...)` work correctly
  // if this API ever runs as more than one Node process (e.g. behind a
  // load balancer, or scaled to N instances). Without it, Socket.io's
  // default in-memory adapter only knows about sockets connected to THAT
  // process — a seat held on the instance handling client A would never
  // reach client B if B happened to be connected to a different instance.
  // The adapter republishes room broadcasts through Redis pub/sub so every
  // instance's sockets receive them. This project runs a single API
  // instance locally, so the adapter isn't load-bearing today — it's here
  // so the real-time layer is horizontally scalable without a rewrite.
  io.adapter(createAdapter(pubClient, subClient));

  io.on("connection", (socket) => {
    socket.on(SOCKET_EVENTS.JOIN_SHOW, (showId: string) => {
      socket.join(roomForShow(showId));
    });
    socket.on(SOCKET_EVENTS.LEAVE_SHOW, (showId: string) => {
      socket.leave(roomForShow(showId));
    });
  });

  return io;
}

const roomForShow = (showId: string) => `show:${showId}`;

export function emitSeatHeld(payload: SeatHeldPayload) {
  io.to(roomForShow(payload.showId)).emit(SOCKET_EVENTS.SEAT_HELD, payload);
}

export function emitSeatReleased(payload: SeatReleasedPayload) {
  io.to(roomForShow(payload.showId)).emit(SOCKET_EVENTS.SEAT_RELEASED, payload);
}

export function emitSeatBooked(payload: SeatBookedPayload) {
  io.to(roomForShow(payload.showId)).emit(SOCKET_EVENTS.SEAT_BOOKED, payload);
}

// Sent to the whole show room too (not just the booker) so it can double
// as the seat-map's final "these are now booked" signal; the booker's
// client additionally uses it to know its own booking succeeded.
export function emitBookingConfirmed(showId: string, payload: BookingConfirmedPayload) {
  io.to(roomForShow(showId)).emit(SOCKET_EVENTS.BOOKING_CONFIRMED, payload);
}
