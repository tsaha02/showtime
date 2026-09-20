import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

export interface FoodCartLine {
  foodItemId: string;
  name: string;
  price: number;
  quantity: number;
}

// Same "never trust client-supplied prices" rule as seat pricing —
// callers send `{foodItemId, quantity}` pairs; this looks up the real,
// current price and name for each and refuses any item that's been
// deactivated (an admin might 86 an item without deleting its order
// history, which FoodItem.active is for).
export async function computeFoodCart(
  items: { foodItemId: string; quantity: number }[] | undefined,
): Promise<{ lines: FoodCartLine[]; foodTotal: number }> {
  if (!items || items.length === 0) return { lines: [], foodTotal: 0 };

  const foodItems = await prisma.foodItem.findMany({ where: { id: { in: items.map((i) => i.foodItemId) } } });
  const byId = new Map(foodItems.map((f) => [f.id, f]));

  const lines: FoodCartLine[] = items.map((item) => {
    const foodItem = byId.get(item.foodItemId);
    if (!foodItem || !foodItem.active) {
      throw ApiError.badRequest(`Food item ${item.foodItemId} is not available`);
    }
    if (item.quantity < 1 || item.quantity > 20) {
      throw ApiError.badRequest("Food item quantity must be between 1 and 20");
    }
    return { foodItemId: foodItem.id, name: foodItem.name, price: foodItem.price, quantity: item.quantity };
  });

  const foodTotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  return { lines, foodTotal };
}
