import { useMemo } from "react";
import { Box, Button, Tooltip, Typography, Stack, Chip } from "@mui/material";
import { MAX_SEATS_PER_BOOKING, type SeatCategory, type SeatMapEntryDTO } from "@showtime/shared";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { useHoldSeatMutation, useReleaseSeatMutation } from "../store/api";
import { seatHeldLocally, seatReleasedLocally, selectHeldSeatIds } from "../store/slices/bookingSlice";
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

  const handleClick = async (seat: SeatMapEntryDTO) => {
    if (seat.status === "BOOKED") return;
    if (seat.status === "HELD" && !seat.heldByMe) return; // someone else's hold

    if (seat.heldByMe) {
      // Deselect: release the hold.
      try {
        await releaseSeat({ showId, seatId: seat.id }).unwrap();
        dispatch(seatReleasedLocally({ seatId: seat.id }));
      } catch (err) {
        dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
      }
      return;
    }

    // Client-side mirror of confirmBookingSchema's `seatIds` max (see
    // packages/shared/src/constants.ts) — the server is the actual
    // guarantee (this check alone proves nothing), but surfacing the
    // limit here means a user finds out at seat #11, not after filling
    // in guest details and hitting a confusing 400 at checkout.
    if (heldSeatIds.length >= MAX_SEATS_PER_BOOKING) {
      dispatch(showToast({ message: `You can select up to ${MAX_SEATS_PER_BOOKING} seats per booking.`, severity: "warning" }));
      return;
    }

    // Select: attempt to hold. A 409 here means another client grabbed it
    // in the gap between the page loading and this click — the classic
    // race this app is built to demonstrate handling gracefully.
    try {
      const { holdExpiresAt } = await holdSeat({ showId, seatId: seat.id }).unwrap();
      dispatch(seatHeldLocally({ seatId: seat.id, holdExpiresAt }));
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
    }
  };

  return (
    <Box>
      <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: "80%",
            height: 8,
            bgcolor: "grey.700",
            borderRadius: "0 0 50% 50% / 0 0 100% 100%",
          }}
        />
        <Typography variant="caption" color="text.secondary">
          SCREEN
        </Typography>
      </Stack>

      <Stack spacing={1} alignItems="center" sx={{ overflowX: "auto", pb: 2 }}>
        {rows.map(({ rowKey, cells }) => (
          <Stack key={rowKey} direction="row" spacing={0.75} alignItems="center">
            <Typography variant="caption" sx={{ width: 20, color: "text.secondary" }}>
              {String.fromCharCode(65 + rowKey)}
            </Typography>
            {cells.map((seat, col) =>
              seat ? (
                <SeatCell key={seat.id} seat={seat} onClick={() => handleClick(seat)} />
              ) : (
                <Box key={`gap-${col}`} sx={{ width: 32, height: 32 }} />
              ),
            )}
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" spacing={3} justifyContent="center" flexWrap="wrap" sx={{ mt: 3 }}>
        <LegendItem color="transparent" border label="Available" />
        <LegendItem color="primary.main" label="Selected (your hold)" />
        <LegendItem color="grey.800" label="Held by someone else" />
        <LegendItem color="grey.900" label="Booked" />
      </Stack>

      <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" sx={{ mt: 2 }}>
        {(Object.keys(prices) as SeatCategory[]).map((category) => (
          <Chip
            key={category}
            size="small"
            label={`${category}: ₹${prices[category]}`}
            sx={{ bgcolor: CATEGORY_COLORS[category], color: "#000" }}
          />
        ))}
      </Stack>
    </Box>
  );
}

function SeatCell({ seat, onClick }: { seat: SeatMapEntryDTO; onClick: () => void }) {
  const categoryColor = CATEGORY_COLORS[seat.category];

  if (seat.status === "BOOKED") {
    return (
      <Tooltip title="Already booked">
        <span>
          <Button
            disabled
            sx={{ minWidth: 32, width: 32, height: 32, p: 0, bgcolor: "grey.900", color: "grey.700" }}
          >
            {seat.label}
          </Button>
        </span>
      </Tooltip>
    );
  }

  if (seat.status === "HELD" && !seat.heldByMe) {
    return (
      <Tooltip title="Someone else is holding this seat">
        <span>
          <Button
            disabled
            sx={{ minWidth: 32, width: 32, height: 32, p: 0, bgcolor: "grey.800", color: "grey.600" }}
          >
            {seat.label}
          </Button>
        </span>
      </Tooltip>
    );
  }

  if (seat.heldByMe) {
    return (
      <Tooltip title="Your seat — click to deselect">
        <Button
          onClick={onClick}
          variant="contained"
          color="primary"
          sx={{ minWidth: 32, width: 32, height: 32, p: 0 }}
        >
          {seat.label}
        </Button>
      </Tooltip>
    );
  }

  // AVAILABLE
  return (
    <Tooltip title={`${seat.category} — click to select`}>
      <Button
        onClick={onClick}
        variant="outlined"
        sx={{
          minWidth: 32,
          width: 32,
          height: 32,
          p: 0,
          borderColor: categoryColor,
          color: categoryColor,
        }}
      >
        {seat.label}
      </Button>
    </Tooltip>
  );
}

function LegendItem({ color, label, border }: { color: string; label: string; border?: boolean }) {
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
