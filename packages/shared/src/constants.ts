// Seat lock TTL, in seconds. Chosen to give a user enough time to fill in
// guest details / review the cart before checkout without tying up a seat
// indefinitely. Must match the Redis SET ... EX value used in apps/api.
export const SEAT_HOLD_TTL_SECONDS = 300;

export const BOOKING_REF_PREFIX = "SHOW";

// Enforced both server-side (confirmBookingSchema, the actual guarantee)
// and client-side (the seat map stops letting you select an 11th seat,
// so the limit is discoverable before checkout rather than only as a
// rejected confirm request).
export const MAX_SEATS_PER_BOOKING = 10;

export const SEAT_CATEGORIES = ["SILVER", "GOLD", "PREMIUM", "RECLINER"] as const;

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "FAILED"] as const;

export const SEAT_STATUSES = ["AVAILABLE", "HELD", "BOOKED"] as const;

export const USER_ROLES = ["CUSTOMER", "ADMIN"] as const;

// Socket.io event names — shared string constants so client/server never
// drift out of sync on a typo'd event name.
export const SOCKET_EVENTS = {
  SEAT_HELD: "seat:held",
  SEAT_RELEASED: "seat:released",
  SEAT_BOOKED: "seat:booked",
  BOOKING_CONFIRMED: "booking:confirmed",
  JOIN_SHOW: "show:join",
  LEAVE_SHOW: "show:leave",
} as const;
