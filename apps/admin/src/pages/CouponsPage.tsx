import { useState } from "react";
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Typography,
  Chip,
  MenuItem,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import {
  useGetCouponsQuery,
  useCreateCouponMutation,
  useUpdateCouponMutation,
  useDeleteCouponMutation,
} from "../store/adminApi";
import type { CouponDTO, CouponInput } from "@showtime/shared";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

const emptyForm: CouponInput = {
  code: "",
  type: "PERCENT",
  value: 10,
  maxUses: null,
  active: true,
  expiresAt: null,
};

export default function CouponsPage() {
  const { data: coupons, isLoading } = useGetCouponsQuery();
  const [createCoupon] = useCreateCouponMutation();
  const [updateCoupon] = useUpdateCouponMutation();
  const [deleteCoupon] = useDeleteCouponMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CouponDTO | null>(null);
  const [form, setForm] = useState<CouponInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(coupon: CouponDTO) {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      maxUses: coupon.maxUses,
      active: coupon.active,
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 16) : null,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      const body: CouponInput = {
        ...form,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (editing) {
        await updateCoupon({ id: editing.id, body }).unwrap();
      } else {
        await createCoupon(body).unwrap();
      }
      setDialogOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this coupon?")) return;
    try {
      await deleteCoupon(id).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Coupons</Typography>
        <Button variant="contained" onClick={openCreate}>
          Add Coupon
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Usage</TableCell>
              <TableCell>Active</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7}>Loading...</TableCell>
              </TableRow>
            )}
            {coupons?.map((coupon) => (
              <TableRow key={coupon.id}>
                <TableCell>{coupon.code}</TableCell>
                <TableCell>{coupon.type}</TableCell>
                <TableCell>{coupon.type === "PERCENT" ? `${coupon.value}%` : `₹${coupon.value}`}</TableCell>
                <TableCell>
                  {coupon.usedCount} / {coupon.maxUses ?? "∞"}
                </TableCell>
                <TableCell>
                  <Chip
                    label={coupon.active ? "Active" : "Inactive"}
                    color={coupon.active ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
                <TableCell>{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleString() : "—"}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(coupon)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(coupon.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit Coupon" : "Add Coupon"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            fullWidth
          />
          <TextField
            select
            label="Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as CouponInput["type"] })}
            fullWidth
          >
            <MenuItem value="PERCENT">Percent</MenuItem>
            <MenuItem value="FLAT">Flat</MenuItem>
          </TextField>
          <TextField
            label={form.type === "PERCENT" ? "Percent off (1-100)" : "Flat amount off (₹)"}
            type="number"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
            fullWidth
          />
          <TextField
            label="Max uses (blank = unlimited)"
            type="number"
            value={form.maxUses ?? ""}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value === "" ? null : Number(e.target.value) })}
            fullWidth
          />
          <TextField
            label="Expires at (blank = never)"
            type="datetime-local"
            value={form.expiresAt ?? ""}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value || null })}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.active ?? true}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
            }
            label="Active"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  );
}
