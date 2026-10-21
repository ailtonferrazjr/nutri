import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

// The tool modules import the DB client at module load; schema tests never
// execute a tool, so an empty stub is enough.
vi.mock("@/lib/db", () => ({ db: {} }));

const { agentTools } = await import("./index");
const { getMonday } = await import("./meal-plan");
const { receiptSchema } = await import("@/lib/receipts/parser");

type ToolName = keyof typeof agentTools;

function schemaOf(name: ToolName): z.ZodType {
  return agentTools[name].inputSchema as unknown as z.ZodType;
}

describe("agentTools registry", () => {
  it("exposes the full tool set, each with a description and an executor", () => {
    expect(Object.keys(agentTools)).toEqual([
      "get_user_profiles",
      "update_user_profile",
      "get_pantry",
      "add_pantry_item",
      "remove_pantry_item",
      "scan_receipt",
      "create_grocery_list",
      "get_grocery_list",
      "check_grocery_item",
      "search_mercadona",
      "get_mercadona_deals",
      "create_recipe",
      "update_recipe",
      "search_recipes",
      "rate_recipe",
      "complete_meal",
      "suggest_recipes_from_pantry",
      "get_meal_plan",
      "set_meal_plan_entry",
      "remove_meal_plan_entry",
    ]);
    for (const t of Object.values(agentTools)) {
      expect(t.description?.length).toBeGreaterThan(10);
      expect(typeof t.execute).toBe("function");
    }
  });
});

describe("tool input schemas", () => {
  it("rate_recipe only accepts ratings from 1 to 5", () => {
    const s = schemaOf("rate_recipe");
    expect(s.safeParse({ id: "r1", rating: 5 }).success).toBe(true);
    expect(s.safeParse({ id: "r1", rating: 0 }).success).toBe(false);
    expect(s.safeParse({ id: "r1", rating: 6 }).success).toBe(false);
  });

  it("complete_meal makes rating optional but still bounds it", () => {
    const s = schemaOf("complete_meal");
    expect(s.safeParse({ id: "m1" }).success).toBe(true);
    expect(s.safeParse({ id: "m1", rating: 7 }).success).toBe(false);
  });

  it("update_user_profile restricts cookingSkill to known levels", () => {
    const s = schemaOf("update_user_profile");
    expect(
      s.safeParse({ name: "Ana", preferences: { cookingSkill: "advanced" } }).success,
    ).toBe(true);
    expect(
      s.safeParse({ name: "Ana", preferences: { cookingSkill: "chef" } }).success,
    ).toBe(false);
    expect(s.safeParse({ restrictions: ["vegetariano"] }).success).toBe(false);
  });

  it("add_pantry_item requires a name for every item", () => {
    const s = schemaOf("add_pantry_item");
    expect(
      s.safeParse({ items: [{ name: "Arroz", quantity: 1, unit: "kg" }] }).success,
    ).toBe(true);
    expect(s.safeParse({ items: [{ quantity: 1 }] }).success).toBe(false);
  });

  it("search_mercadona and get_mercadona_deals apply default limits", () => {
    expect(schemaOf("search_mercadona").parse({ query: "pollo" })).toMatchObject({
      query: "pollo",
      limit: 20,
    });
    expect(schemaOf("get_mercadona_deals").parse({})).toMatchObject({ limit: 15 });
  });

  it("set_meal_plan_entry requires a date and a meal type", () => {
    const s = schemaOf("set_meal_plan_entry");
    expect(
      s.safeParse({ date: "2026-01-12", mealType: "jantar", forUser: "both" }).success,
    ).toBe(true);
    expect(s.safeParse({ mealType: "jantar" }).success).toBe(false);
    expect(s.safeParse({ date: "2026-01-12" }).success).toBe(false);
  });

  it("create_recipe requires ingredients and instructions", () => {
    const s = schemaOf("create_recipe");
    expect(
      s.safeParse({
        name: "Omelete",
        ingredients: '[{"name":"ovo","quantity":2,"unit":"un"}]',
        instructions: "Bater os ovos\nCozinhar",
      }).success,
    ).toBe(true);
    expect(s.safeParse({ name: "Omelete" }).success).toBe(false);
  });
});

describe("receiptSchema", () => {
  const item = {
    name: "LECH S/DES HAC 1L",
    normalizedName: "Leche semidesnatada Hacendado 1L",
    quantity: 2,
    unit: "L",
    price: 1.9,
    category: "dairy",
  };

  it("accepts a parsed receipt with unknown header fields set to null", () => {
    const parsed = receiptSchema.parse({ store: null, date: null, total: null, items: [item] });
    expect(parsed.items[0].normalizedName).toBe("Leche semidesnatada Hacendado 1L");
  });

  it("rejects items without a price", () => {
    const { price: _price, ...noPrice } = item;
    expect(
      receiptSchema.safeParse({ store: "Mercadona", date: "2026-01-10", total: 1.9, items: [noPrice] })
        .success,
    ).toBe(false);
  });
});

describe("getMonday", () => {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("returns the same day for a Monday", () => {
    expect(iso(getMonday(new Date(2026, 0, 12)))).toBe("2026-01-12");
  });

  it("returns the previous Monday mid-week", () => {
    expect(iso(getMonday(new Date(2026, 0, 15)))).toBe("2026-01-12");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    expect(iso(getMonday(new Date(2026, 0, 18)))).toBe("2026-01-12");
  });

  it("crosses month boundaries", () => {
    expect(iso(getMonday(new Date(2026, 2, 1)))).toBe("2026-02-23");
  });
});
