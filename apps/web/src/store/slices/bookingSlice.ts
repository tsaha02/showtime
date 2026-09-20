import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SeatCategory, SeatMapEntryDTO } from "@showtime/shared";
import type { RootState } from "../store";

// --- Why this slice exists / how it's shaped ---
//
// This is the state for the seat-selection + checkout flow. It's the one
// slice in the app that's genuinely tricky, because it has to reconcile
// three sources of truth for "what's the status of this seat":
//   1. The initial REST snapshot (GET /shows/:id/seatmap) when the page loads.
//   2. This client's own actions (I clicked hold/release) — optimistic-ish,
//      confirmed by the hold/release API responses.
//   3. Live socket events describing what OTHER clients are doing.
//
// `seatMap` always holds the latest merged view (what the grid renders).
// `heldSeats` is a *separate* record of just the seats THIS client holds,
// keyed by seatId -> expiry. It's redundant with `seatMap[i].heldByMe`, but
// keeping it separately makes two things trivial: computing the cart total
// bar/countdown without scanning the whole seat map, and telling apart "I
// hold seat X" from "someone else holds seat X" when a socket event for
// seat X arrives (see applySeatHeldEvent below).
//
// The hold countdown itself is NOT stored here as a ticking number — Redux
// state should describe facts (when does this hold expire), not a clock.
// The component-level countdown recomputes `expiresAt - Date.now()` on an
// interval; see `selectEarliestHoldExpiry` + the useHoldCountdown hook.

interface HeldSeatInfo {
  holdExpiresAt: string;
}

interface BookingState {
  currentShowId: string | null;
  heldSeats: Record<string, HeldSeatInfo>;
  seatMap: SeatMapEntryDTO[];
  // Per-category prices for the show currently being viewed, so the cart
  // total can be derived (seat.category -> price) without re-fetching the
  // show on every render. Set alongside seatMap in `setSeatMap`.
  prices: Partial<Record<SeatCategory, number>>;
}

const initialState: BookingState = {
  currentShowId: null,
  heldSeats: {},
  seatMap: [],
  prices: {},
};

const bookingSlice = createSlice({
  name: "booking",
  initialState,
  reducers: {
    // Called when entering /shows/:showId/seats after the initial GET.
    setSeatMap(
      state,
      action: PayloadAction<{
        showId: string;
        seats: SeatMapEntryDTO[];
        prices: Partial<Record<SeatCategory, number>>;
      }>,
    ) {
      state.currentShowId = action.payload.showId;
      state.seatMap = action.payload.seats;
      state.prices = action.payload.prices;
      // Seed heldSeats from the server's `heldByMe`/`holdExpiresAt` fields,
      // in case the user reloads the page mid-hold.
      state.heldSeats = {};
      for (const seat of action.payload.seats) {
        if (seat.heldByMe && seat.holdExpiresAt) {
          state.heldSeats[seat.id] = { holdExpiresAt: seat.holdExpiresAt };
        }
      }
    },

    // After a successful POST /seats/hold for a seat THIS client clicked.
    seatHeldLocally(state, action: PayloadAction<{ seatId: string; holdExpiresAt: string }>) {
      const { seatId, holdExpiresAt } = action.payload;
      state.heldSeats[seatId] = { holdExpiresAt };
      const seat = state.seatMap.find((s) => s.id === seatId);
      if (seat) {
        seat.status = "HELD";
        seat.heldByMe = true;
        seat.holdExpiresAt = holdExpiresAt;
      }
    },

    // After this client releases a seat it held (clicked to deselect), or
    // its hold expired locally.
    seatReleasedLocally(state, action: PayloadAction<{ seatId: string }>) {
      delete state.heldSeats[action.payload.seatId];
      const seat = state.seatMap.find((s) => s.id === action.payload.seatId);
      if (seat) {
        seat.status = "AVAILABLE";
        seat.heldByMe = false;
        seat.holdExpiresAt = null;
      }
    },

    // Socket: someone ELSE just held a seat. If it's a seat we think we
    // hold (shouldn't normally happen), we don't clobber our own hold.
    applySeatHeldEvent(state, action: PayloadAction<{ showId: string; seatId: string; holdExpiresAt: string }>) {
      const { showId, seatId, holdExpiresAt } = action.payload;
      if (showId !== state.currentShowId) return;
      if (state.heldSeats[seatId]) return; // it's our own hold, socket echo
      const seat = state.seatMap.find((s) => s.id === seatId);
      if (seat) {
        seat.status = "HELD";
        seat.heldByMe = false;
        seat.holdExpiresAt = holdExpiresAt;
      }
    },

    // Socket: a hold (ours or someone else's) was released/expired.
    applySeatReleasedEvent(state, action: PayloadAction<{ showId: string; seatId: string }>) {
      const { showId, seatId } = action.payload;
      if (showId !== state.currentShowId) return;
      if (state.heldSeats[seatId]) return; // our own release already handled locally
      const seat = state.seatMap.find((s) => s.id === seatId);
      if (seat) {
        seat.status = "AVAILABLE";
        seat.heldByMe = false;
        seat.holdExpiresAt = null;
      }
    },

    // Socket: seats were booked (by anyone, including possibly us).
    applySeatBookedEvent(state, action: PayloadAction<{ showId: string; seatIds: string[] }>) {
      const { showId, seatIds } = action.payload;
      if (showId !== state.currentShowId) return;
      for (const seatId of seatIds) {
        delete state.heldSeats[seatId];
        const seat = state.seatMap.find((s) => s.id === seatId);
        if (seat) {
          seat.status = "BOOKED";
          seat.heldByMe = false;
          seat.holdExpiresAt = null;
        }
      }
    },

    // Reset everything — called after a booking is confirmed, or when
    // navigating away from the seat map page.
    clearBookingFlow(state) {
      state.currentShowId = null;
      state.heldSeats = {};
      state.seatMap = [];
      state.prices = {};
    },
  },
});

export const {
  setSeatMap,
  seatHeldLocally,
  seatReleasedLocally,
  applySeatHeldEvent,
  applySeatReleasedEvent,
  applySeatBookedEvent,
  clearBookingFlow,
} = bookingSlice.actions;

export default bookingSlice.reducer;

// --- Selectors ---

export const selectHeldSeatIds = (state: RootState) => Object.keys(state.booking.heldSeats);

export const selectHeldSeats = (state: RootState) =>
  state.booking.seatMap.filter((s) => state.booking.heldSeats[s.id]);

export const selectCartTotal = (state: RootState) =>
  selectHeldSeats(state).reduce((sum, seat) => sum + (state.booking.prices[seat.category] ?? 0), 0);

// The earliest `holdExpiresAt` across all seats this client currently holds,
// as an epoch ms timestamp (or null if nothing is held). Components compute
// "seconds remaining" as `(earliestExpiry - Date.now()) / 1000` inside their
// own setInterval — this selector only surfaces the raw fact from state, it
// never reads the clock itself, so the store stays free of ticking values.
export const selectEarliestHoldExpiry = (state: RootState): number | null => {
  const expiries = Object.values(state.booking.heldSeats).map((h) => new Date(h.holdExpiresAt).getTime());
  if (expiries.length === 0) return null;
  return Math.min(...expiries);
};
