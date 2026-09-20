import { useEffect } from "react";
import { SOCKET_EVENTS } from "@showtime/shared";
import type { SeatHeldPayload, SeatReleasedPayload, SeatBookedPayload } from "@showtime/shared";
import { socket } from "../lib/socket";
import { useAppDispatch } from "../store/hooks";
import { applySeatHeldEvent, applySeatReleasedEvent, applySeatBookedEvent } from "../store/slices/bookingSlice";

// Joins the Socket.io "room" for one show while the seat map page is
// mounted, and wires the three seat-lifecycle events into bookingSlice.
// `show:join`/`show:leave` tell the server which show-room this socket
// cares about, so it only relays seat events for the shows people are
// actually looking at.
export function useShowRoom(showId: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!showId) return;

    socket.emit(SOCKET_EVENTS.JOIN_SHOW, showId);

    const onHeld = (payload: SeatHeldPayload) => dispatch(applySeatHeldEvent(payload));
    const onReleased = (payload: SeatReleasedPayload) => dispatch(applySeatReleasedEvent(payload));
    const onBooked = (payload: SeatBookedPayload) => dispatch(applySeatBookedEvent(payload));

    socket.on(SOCKET_EVENTS.SEAT_HELD, onHeld);
    socket.on(SOCKET_EVENTS.SEAT_RELEASED, onReleased);
    socket.on(SOCKET_EVENTS.SEAT_BOOKED, onBooked);

    return () => {
      socket.emit(SOCKET_EVENTS.LEAVE_SHOW, showId);
      socket.off(SOCKET_EVENTS.SEAT_HELD, onHeld);
      socket.off(SOCKET_EVENTS.SEAT_RELEASED, onReleased);
      socket.off(SOCKET_EVENTS.SEAT_BOOKED, onBooked);
    };
  }, [showId, dispatch]);
}
