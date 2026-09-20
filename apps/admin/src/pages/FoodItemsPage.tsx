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
  useGetFoodItemsQuery,
  useCreateFoodItemMutation,
  useUpdateFoodItemMutation,
  useDeleteFoodItemMutation,
} from "../store/adminApi";
import type { FoodItemDTO, FoodItemInput } from "@showtime/shared";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

const emptyForm: FoodItemInput = {
  name: "",
  description: "",
  price: 100,
  category: "SNACK",
  imageUrl: null,
  active: true,
};

export default function FoodItemsPage() {
  const { data: foodItems, isLoading } = useGetFoodItemsQuery();
  const [createFoodItem] = useCreateFoodItemMutation();
  const [updateFoodItem] = useUpdateFoodItemMutation();
  const [deleteFoodItem] = useDeleteFoodItemMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FoodItemDTO | null>(null);
  const [form, setForm] = useState<FoodItemInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(foodItem: FoodItemDTO) {
    setEditing(foodItem);
    setForm({
      name: foodItem.name,
      description: foodItem.description ?? "",
      price: foodItem.price,
      category: foodItem.category,
      imageUrl: foodItem.imageUrl,
      active: foodItem.active,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      const body: FoodItemInput = {
        ...form,
        description: form.description ? form.description : undefined,
        imageUrl: form.imageUrl ? form.imageUrl : null,
      };
      if (editing) {
        await updateFoodItem({ id: editing.id, body }).unwrap();
      } else {
        await createFoodItem(body).unwrap();
      }
      setDialogOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this food item?")) return;
    try {
      await deleteFoodItem(id).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Food Items</Typography>
        <Button variant="contained" onClick={openCreate}>
          Add Food Item
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Active</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5}>Loading...</TableCell>
              </TableRow>
            )}
            {foodItems?.map((foodItem) => (
              <TableRow key={foodItem.id}>
                <TableCell>{foodItem.name}</TableCell>
                <TableCell>{foodItem.category}</TableCell>
                <TableCell>₹{foodItem.price}</TableCell>
                <TableCell>
                  <Chip
                    label={foodItem.active ? "Active" : "Inactive"}
                    color={foodItem.active ? "success" : "default"}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(foodItem)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(foodItem.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit Food Item" : "Add Food Item"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            select
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as FoodItemInput["category"] })}
            fullWidth
          >
            <MenuItem value="SNACK">Snack</MenuItem>
            <MenuItem value="DRINK">Drink</MenuItem>
            <MenuItem value="COMBO">Combo</MenuItem>
          </TextField>
          <TextField
            label="Price (₹)"
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            fullWidth
          />
          <TextField
            label="Image URL (optional)"
            value={form.imageUrl ?? ""}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value || null })}
            fullWidth
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
