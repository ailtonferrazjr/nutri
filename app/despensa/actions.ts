"use server";

import { revalidatePath } from "next/cache";
import {
  updatePantryItemQuantity,
  removePantryItem,
  updatePantryItem,
  addPantryItem,
} from "@/lib/db/queries/pantry";

export async function updateQuantityAction(id: string, newQuantity: number) {
  const result = await updatePantryItemQuantity(id, newQuantity);
  // Only revalidate if item was removed (qty <= 0), otherwise local state is enough
  if (!result) {
    revalidatePath("/despensa");
  }
}

export async function removeItemAction(id: string) {
  await removePantryItem(id);
  revalidatePath("/despensa");
}

export async function editItemAction(
  id: string,
  data: { name: string; category: string; unit: string }
) {
  await updatePantryItem(id, data);
  revalidatePath("/despensa");
}

export async function addItemAction(data: {
  name: string;
  category: string;
  quantity: number;
  unit: string;
}) {
  await addPantryItem(data);
  revalidatePath("/despensa");
}
