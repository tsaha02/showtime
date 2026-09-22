import { useMemo, useCallback, useEffect, useRef, memo } from "react";
import { Box, Tooltip, Typography, Stack, Chip } from "@mui/material";
import { motion, useAnimationControls } from "framer-motion";
import AccessibleIcon from "@mui/icons-material/Accessible";
import {
  MAX_SEATS_PER_BOOKING,
  type SeatCategory,
  type SeatMapEntryDTO,
} from "@showtime/shared";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { useHoldSeatMutation, useReleaseSeatMutation } from "../store/api";
import {
  seatHeldLocally,
  seatReleasedLocally,
  selectHeldSeatIds,
} from "../store/slices/bookingSlice";
import { showToast } from "../store/slices/uiSlice";
import { getErrorMessage } from "../lib/apiError";

const CATEGORY_COLORS: Record<SeatCategory, string> = {
  SILVER: "#9e9e9e",
  GOLD: "#f5c518",
  PREMIUM: "#7e57c2",
  RECLINER: "#26a69a",
};

interface SeatMapGridProps {
  showId: string;
  seats: SeatMapEntryDTO[];
  prices: Partial<Record<SeatCategory, number>>;
}

// Renders the seat grid from a flat list of (row, col) seats — NOT a table,
// since rows/cols can have gaps (aisles) that a <table> would render as
// zero-width cells. Instead we compute, per row, the widest column index
// used anywhere in that row and render every column from 0..max, leaving a
// blank spacer Box where no seat exists — that's what keeps aisles visually
// aligned across rows.
export function SeatMapGrid({ showId, seats, prices }: SeatMapGridProps) {
  const dispatch = useAppDispatch();
  const [holdSeat] = useHoldSeatMutation();
  const [releaseSeat] = useReleaseSeatMutation();
  const heldSeatIds = useAppSelector(selectHeldSeatIds);

  const rows = useMemo(() => {
    const byRow = new Map<number, SeatMapEntryDTO[]>();
    for (const seat of seats) {
      if (!byRow.has(seat.row)) byRow.set(seat.row, []);
      byRow.get(seat.row)!.push(seat);
    }
    const sortedRowKeys = Array.from(byRow.keys()).sort((a, b) => a - b);
    return sortedRowKeys.map((rowKey) => {
      const rowSeats = byRow.get(rowKey)!;
      const maxCol = Math.max(...rowSeats.map((s) => s.col));
      const byCol = new Map(rowSeats.map((s) => [s.col, s]));
      const cells: (SeatMapEntryDTO | null)[] = [];
      for (let col = 0; col <= maxCol; col++) {
        cells.push(byCol.get(col) ?? null);
      }
      return { rowKey, cells };
    });
  }, [seats]);

  // Stable across re-renders triggered by OTHER seats' socket events
  // (only `heldSeatIds` — this user's own selection — actually changes
  // it) — required for `SeatCell`'s memoization below to be worth
  // anything, since a new function reference on every render would
  // defeat it regardless of how `seat` itself is memoized.
  const handleClick = useCallback(
    async (seat: SeatMapEntryDTO) => {
      if (seat.status === "BOOKED") return;
      if (seat.status === "HELD" && !seat.heldByMe) return; // someone else's hold

      if (seat.heldByMe) {
        // Deselect: release the hold.
        try {
          await releaseSeat({ showId, seatId: seat.id }).unwrap();
          dispatch(seatReleasedLocally({ seatId: seat.id }));
        } catch (err) {
          dispatch(
            showToast({
              message: getErrorMessage(err as any),
              severity: "error",
            }),
          );
        }
        return;
      }

      // Client-side mirror of confirmBookingSchema's `seatIds` max (see
      // packages/shared/src/constants.ts) — the server is the actual
      // guarantee (this check alone proves nothing), but surfacing the
      // limit here means a user finds out at seat #11, not after filling
      // in guest details and hitting a confusing 400 at checkout.
      if (heldSeatIds.length >= MAX_SEATS_PER_BOOKING) {
        dispatch(
          showToast({
            message: `You can select up to ${MAX_SEATS_PER_BOOKING} seats per booking.`,
            severity: "warning",
          }),
        );
        return;
      }

      // Select: attempt to hold. A 409 here means another client grabbed it
      // in the gap between the page loading and this click — the classic
      // race this app is built to demonstrate handling gracefully.
      try {
        const { holdExpiresAt } = await holdSeat({
          showId,
          seatId: seat.id,
        }).unwrap();
        dispatch(seatHeldLocally({ seatId: seat.id, holdExpiresAt }));
      } catch (err) {
        dispatch(
          showToast({
            message: getErrorMessage(err as any),
            severity: "error",
          }),
        );
      }
    },
    [showId, releaseSeat, holdSeat, dispatch, heldSeatIds],
  );

  const rowCount = rows.length;

  return (
    <Box>
      <Screen />

      {/* `alignItems: "center"` on THIS scrolling container, on a row
          wider than the viewport, is a classic CSS trap: a flex/grid
          child centered inside an `overflow: auto` ancestor starts
          scrolled to a position that already clips its left edge —
          the row is symmetrically centered around the container's
          full (unscrolled) width, not left-aligned at `scrollLeft: 0`
          — so the first seat/row-letter is cut off before the user
          even touches the scrollbar, exactly the "cut off" report this
          fixes. Centering now happens on an inner `width: fit-content`
          Box instead: that collapses to a plain left-aligned block
          (reachable in full by scrolling) the moment its natural width
          exceeds the scroll container, while still centering normally
          whenever it fits (desktop, most phones in landscape). */}
      <Box sx={{ overflowX: "auto", pb: 2 }}>
        <Stack spacing={1.1} sx={{ width: "fit-content", mx: "auto" }}>
          {rows.map(({ rowKey, cells }, rowIndex) => {
            // Purely a paint-time `transform: scale`, not a layout
            // change — rows nearer the screen render very slightly
            // smaller, receding rows very slightly larger, a cheap
            // fake-perspective depth cue real theatre seat maps use.
            // `scale` doesn't participate in box-model sizing/gaps, so
            // the careful aisle-alignment logic above (blank spacer
            // Box per missing seat) stays exactly as accurate as
            // before — this can't desync a row's seats from its
            // neighbors' columns.
            const depthScale = rowCount > 1 ? 0.93 + (rowIndex / (rowCount - 1)) * 0.09 : 1;
            return (
              <motion.div
                key={rowKey}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: rowIndex * 0.035, duration: 0.3, ease: "easeOut" }}
                style={{ transform: `scale(${depthScale})`, transformOrigin: "center top" }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="caption" sx={{ width: 20, color: "text.secondary" }}>
                    {String.fromCharCode(65 + rowKey)}
                  </Typography>
                  {cells.map((seat, col) =>
                    seat ? (
                      <SeatCell key={seat.id} seat={seat} onClick={handleClick} />
                    ) : (
                      <Box key={`gap-${col}`} sx={{ width: 32, height: 32 }} />
                    ),
                  )}
                </Stack>
              </motion.div>
            );
          })}
        </Stack>
      </Box>

      {/* A plain flexWrap row centers each WRAPPED LINE independently,
          so rows with different total widths end up staggered relative
          to each other (a lopsided "staircase") instead of reading as
          one aligned block — a `grid` with a fixed column count doesn't
          have that problem, since every row shares the same column
          positions. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, auto)", sm: "repeat(3, auto)", md: "repeat(5, auto)" },
          columnGap: 3,
          rowGap: 1,
          justifyContent: "center",
          mt: 3,
        }}
      >
        <LegendItem color="transparent" border label="Available" />
        <LegendItem color="primary.main" label="Selected (your hold)" />
        <LegendItem color="grey.800" label="Held by someone else" />
        <LegendItem color="grey.900" label="Booked" />
        <Stack direction="row" spacing={0.75} alignItems="center">
          <AccessibleIcon sx={{ fontSize: 16, color: "secondary.main" }} />
          <Typography variant="caption" color="text.secondary">
            Wheelchair accessible
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, auto)", sm: "repeat(4, auto)" },
          columnGap: 1,
          rowGap: 1,
          justifyContent: "center",
          mt: 2,
        }}
      >
        {(Object.keys(prices) as SeatCategory[]).map((category) => (
          <Chip
            key={category}
            size="small"
            label={`${category}: ₹${prices[category]}`}
            sx={{ bgcolor: CATEGORY_COLORS[category], color: "#000" }}
          />
        ))}
      </Box>
    </Box>
  );
}

// The screen itself: a curved, glowing arc rather than a flat gray bar —
// a soft radial glow "cast" downward (like real screen-light spilling
// onto an auditorium) plus a slow, subtle shimmer along the arc. Pure
// CSS/SVG, no dependency on any booking state, so it can't ever interact
// with (or be blamed for a bug in) the real-time seat logic below it.
function Screen() {
  return (
    <Stack alignItems="center" spacing={1.5} sx={{ mb: 3.5 }}>
      <Box sx={{ position: "relative", width: "82%", maxWidth: 640 }}>
        <Box
          sx={{
            position: "absolute",
            inset: "-24px -10% -40px",
            background: (theme) =>
              `radial-gradient(ellipse 60% 100% at 50% 0%, ${theme.palette.primary.main}22, transparent 70%)`,
            filter: "blur(14px)",
            pointerEvents: "none",
          }}
        />
        <Box
          component={motion.div}
          initial={{ opacity: 0, scaleX: 0.85 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          sx={{
            position: "relative",
            height: 10,
            borderRadius: "0 0 50% 50% / 0 0 100% 100%",
            // One tone (a literal screen glows one color, not a red-
            // to-gold rainbow) rather than the primary+secondary sweep
            // this used to be — same restraint as the rest of the
            // theme's redesign: a gradient earns its place here because
            // it IS a light source, but two competing hues on it read
            // as decoration, not light.
            background: (theme) => `linear-gradient(90deg, transparent, ${theme.palette.primary.light}, transparent)`,
            boxShadow: (theme) => `0 6px 20px -4px ${theme.palette.primary.main}80`,
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ letterSpacing: 3, color: "text.secondary" }}>
        SCREEN
      </Typography>
    </Stack>
  );
}

// Memoized: a seat map can have 50-100+ cells, and (thanks to Immer's
// structural sharing in bookingSlice) every seat OTHER than the one a
// socket event just touched keeps the exact same object reference — so
// as long as `onClick` is also stable (see `handleClick`'s useCallback
// above), memo actually skips re-rendering the ~50 unaffected cells
// every time one seat's hold status changes, instead of re-rendering
// the entire grid.
const SeatCell = memo(function SeatCell({
  seat,
  onClick,
}: {
  seat: SeatMapEntryDTO;
  onClick: (seat: SeatMapEntryDTO) => void;
}) {
  const categoryColor = CATEGORY_COLORS[seat.category];
  const controls = useAnimationControls();
  const isFirstRender = useRef(true);
  const prevRef = useRef({ status: seat.status, heldByMe: seat.heldByMe });

  // A brief settle-pulse whenever this SPECIFIC seat's state actually
  // changes — whether from this user's own click (a satisfying
  // confirmation once the hold/release round-trip resolves, on top of
  // the instant `whileTap` press feedback below) or from a Socket.io
  // event announcing someone else just grabbed/released it. Skipped on
  // the very first render so mounting a 100-seat map doesn't also fire
  // 100 pulses on top of the row entrance animation above.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const prev = prevRef.current;
    const changed = prev.status !== seat.status || prev.heldByMe !== seat.heldByMe;
    prevRef.current = { status: seat.status, heldByMe: seat.heldByMe };
    if (changed) {
      void controls.start({ scale: [1, 1.22, 1], transition: { duration: 0.35, ease: "easeOut" } });
    }
  }, [seat.status, seat.heldByMe, controls]);

  const badge = seat.wheelchairAccessible && (
    <AccessibleIcon
      sx={{
        position: "absolute",
        top: -6,
        right: -6,
        fontSize: 14,
        color: "secondary.main",
        bgcolor: "background.paper",
        borderRadius: "50%",
        zIndex: 1,
      }}
    />
  );

  let title: string;
  let baseSx: Record<string, unknown>;
  let clickable = false;

  if (seat.status === "BOOKED") {
    title = "Already booked";
    baseSx = { bgcolor: "grey.900", color: "grey.700", border: "1px solid transparent" };
  } else if (seat.status === "HELD" && !seat.heldByMe) {
    title = "Someone else is holding this seat";
    baseSx = { bgcolor: "grey.800", color: "grey.600", border: "1px solid transparent" };
  } else if (seat.heldByMe) {
    title = "Your seat — click to deselect";
    clickable = true;
    baseSx = {
      bgcolor: "primary.main",
      color: "primary.contrastText",
      border: "1px solid transparent",
      boxShadow: (theme: any) => `0 0 0 3px ${theme.palette.primary.main}33`,
    };
  } else {
    // AVAILABLE
    title = seat.wheelchairAccessible
      ? `${seat.category} — wheelchair accessible — click to select`
      : `${seat.category} — click to select`;
    clickable = true;
    baseSx = { bgcolor: "transparent", color: categoryColor, border: `1px solid ${categoryColor}` };
  }

  return (
    <Tooltip title={title}>
      <Box sx={{ position: "relative", lineHeight: 0 }}>
        <Box
          component={motion.button}
          type="button"
          disabled={!clickable}
          onClick={clickable ? () => onClick(seat) : undefined}
          animate={controls}
          whileHover={clickable ? { scale: 1.12, y: -2 } : undefined}
          whileTap={clickable ? { scale: 0.88 } : undefined}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          sx={{
            appearance: "none",
            minWidth: 32,
            width: 32,
            height: 32,
            p: 0,
            borderRadius: 1,
            fontSize: "0.75rem",
            fontWeight: 600,
            cursor: clickable ? "pointer" : "default",
            transition: "background-color 0.2s, border-color 0.2s, box-shadow 0.2s",
            ...baseSx,
          }}
        >
          {seat.label}
        </Box>
        {badge}
      </Box>
    </Tooltip>
  );
});

function LegendItem({
  color,
  label,
  border,
}: {
  color: string;
  label: string;
  border?: boolean;
}) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box
        sx={{
          width: 16,
          height: 16,
          borderRadius: 0.5,
          bgcolor: color,
          border: border ? "1px solid" : "none",
          borderColor: "text.secondary",
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}
