import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  IconButton,
  Paper,
  Divider,
  Checkbox,
  Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AccessibleIcon from "@mui/icons-material/Accessible";
import { useNavigate, useParams } from "react-router-dom";
import { SEAT_CATEGORIES, type SeatCategory } from "@showtime/shared";
import { useGetLayoutQuery, usePutLayoutMutation, type SeatInput } from "../store/adminApi";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

export default function LayoutEditorPage() {
  const { screenId } = useParams<{ theatreId: string; screenId: string }>();
  const navigate = useNavigate();
  const { data: layout, isLoading } = useGetLayoutQuery(screenId!, { skip: !screenId });
  const [putLayout, { isLoading: isSaving }] = usePutLayoutMutation();

  const [seats, setSeats] = useState<SeatInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Generate-grid helper state.
  const [gridRows, setGridRows] = useState(5);
  const [gridCols, setGridCols] = useState(10);
  const [gridCategory, setGridCategory] = useState<SeatCategory>("SILVER");

  useEffect(() => {
    if (layout) {
      setSeats(
        layout.seats.map((s) => ({
          row: s.row,
          col: s.col,
          label: s.label,
          category: s.category,
          wheelchairAccessible: s.wheelchairAccessible,
        })),
      );
    }
  }, [layout]);

  function updateSeat(index: number, patch: Partial<SeatInput>) {
    setSeats((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeSeat(index: number) {
    setSeats((prev) => prev.filter((_, i) => i !== index));
  }

  function addSeat() {
    setSeats((prev) => [...prev, { row: 0, col: 0, label: "", category: "SILVER" }]);
  }

  function generateGrid() {
    const generated: SeatInput[] = [];
    for (let r = 0; r < gridRows; r++) {
      const rowLabel = String.fromCharCode(65 + r);
      for (let c = 0; c < gridCols; c++) {
        generated.push({ row: r, col: c, label: `${rowLabel}${c + 1}`, category: gridCategory });
      }
    }
    setSeats(generated);
  }

  async function handleSave() {
    if (!screenId) return;
    try {
      await putLayout({ screenId, seats }).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Seat Layout Editor</Typography>
        <Button onClick={() => navigate(`/theatres`)}>Back to Theatres</Button>
      </Box>

      {isLoading && <Typography>Loading...</Typography>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Generate grid (optional helper — overwrites the list below)
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            label="Rows"
            type="number"
            size="small"
            value={gridRows}
            onChange={(e) => setGridRows(Number(e.target.value))}
            sx={{ width: 100 }}
          />
          <TextField
            label="Cols"
            type="number"
            size="small"
            value={gridCols}
            onChange={(e) => setGridCols(Number(e.target.value))}
            sx={{ width: 100 }}
          />
          <TextField
            label="Category"
            select
            size="small"
            value={gridCategory}
            onChange={(e) => setGridCategory(e.target.value as SeatCategory)}
            sx={{ width: 150 }}
          >
            {SEAT_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" onClick={generateGrid}>
            Generate
          </Button>
        </Box>
      </Paper>

      <Divider sx={{ mb: 2 }} />

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Row</TableCell>
            <TableCell>Col</TableCell>
            <TableCell>Label</TableCell>
            <TableCell>Category</TableCell>
            <TableCell align="center">Accessible</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {seats.map((seat, i) => (
            <TableRow key={i}>
              <TableCell>
                <TextField
                  type="number"
                  size="small"
                  value={seat.row}
                  onChange={(e) => updateSeat(i, { row: Number(e.target.value) })}
                  sx={{ width: 80 }}
                />
              </TableCell>
              <TableCell>
                <TextField
                  type="number"
                  size="small"
                  value={seat.col}
                  onChange={(e) => updateSeat(i, { col: Number(e.target.value) })}
                  sx={{ width: 80 }}
                />
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  value={seat.label}
                  onChange={(e) => updateSeat(i, { label: e.target.value })}
                  sx={{ width: 100 }}
                />
              </TableCell>
              <TableCell>
                <TextField
                  select
                  size="small"
                  value={seat.category}
                  onChange={(e) => updateSeat(i, { category: e.target.value as SeatCategory })}
                  sx={{ width: 150 }}
                >
                  {SEAT_CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </TextField>
              </TableCell>
              <TableCell align="center">
                <Tooltip title="Wheelchair accessible">
                  <Checkbox
                    size="small"
                    icon={<AccessibleIcon fontSize="small" color="disabled" />}
                    checkedIcon={<AccessibleIcon fontSize="small" color="primary" />}
                    checked={!!seat.wheelchairAccessible}
                    onChange={(e) => updateSeat(i, { wheelchairAccessible: e.target.checked })}
                  />
                </Tooltip>
              </TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => removeSeat(i)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
        <Button variant="outlined" onClick={addSeat}>
          Add Seat
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={isSaving || seats.length === 0}>
          {isSaving ? "Saving..." : "Save Layout"}
        </Button>
      </Box>

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  );
}
