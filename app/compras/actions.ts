"use server";

import { revalidatePath } from "next/cache";
import { toggleGroceryItem } from "@/lib/db/queries/grocery";

export async function toggleItemAction(itemId: string) {
  await toggleGroceryItem(itemId);
  revalidatePath("/compras");
}
