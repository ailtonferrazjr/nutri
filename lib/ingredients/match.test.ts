import { describe, expect, it } from "vitest";
import {
  excludeExistingGroceryItems,
  findMissingIngredients,
  isStaple,
  matchesPantry,
  normalizeIngredientName,
  parseIngredientQuantity,
} from "./match";

describe("normalizeIngredientName", () => {
  it("lowercases, strips accents and collapses whitespace", () => {
    expect(normalizeIngredientName("  Feijão   Preto ")).toBe("feijao preto");
    expect(normalizeIngredientName("PIMENTÃO")).toBe("pimentao");
  });
});

describe("isStaple", () => {
  it.each(["sal", "sal grosso", "azeite de oliva", "agua", "pimenta do reino", "aceite"])(
    "treats %s as a staple",
    (name) => expect(isStaple(normalizeIngredientName(name))).toBe(true),
  );

  it.each(["salmão", "salsa", "salada verde", "pimentão", "boiled egg"])(
    "does not treat %s as a staple just because it contains one as a substring",
    (name) => expect(isStaple(normalizeIngredientName(name))).toBe(false),
  );
});

describe("matchesPantry", () => {
  const pantry = ["cebola roxa", "arroz", "peito de frango"].map(normalizeIngredientName);

  it("matches when the pantry item contains the ingredient", () => {
    expect(matchesPantry("cebola", pantry)).toBe(true);
  });

  it("matches when the ingredient contains the pantry item", () => {
    expect(matchesPantry("arroz integral", pantry)).toBe(true);
  });

  it("falls back to word matching for words of 3+ chars", () => {
    expect(matchesPantry("frango desfiado", pantry)).toBe(true);
  });

  it("ignores short words in the word fallback", () => {
    expect(matchesPantry("ovo de pata", ["peito de frango"])).toBe(false);
  });

  it("returns false when nothing matches", () => {
    expect(matchesPantry("tofu", pantry)).toBe(false);
  });
});

describe("findMissingIngredients", () => {
  it("returns only non-staple ingredients absent from the pantry, preserving input objects", () => {
    const ingredients = [
      { name: "Cebola", quantity: 1, unit: "un" },
      { name: "Sal", quantity: "a gosto" },
      { name: "Azeite", quantity: 2, unit: "colher" },
      { name: "Salmão", quantity: 300, unit: "g" },
      { name: "Grão-de-bico", quantity: 1, unit: "lata" },
    ];
    const missing = findMissingIngredients(ingredients, ["Cebola Roxa", "Arroz"]);
    expect(missing).toEqual([
      { name: "Salmão", quantity: 300, unit: "g" },
      { name: "Grão-de-bico", quantity: 1, unit: "lata" },
    ]);
  });

  it("matches accented recipe names against unaccented pantry names", () => {
    expect(findMissingIngredients([{ name: "Feijão" }], ["feijao carioca"])).toEqual([]);
  });

  it("reports everything except staples when the pantry is empty", () => {
    const missing = findMissingIngredients(
      [{ name: "tomate" }, { name: "sal" }, { name: "ovos" }],
      [],
    );
    expect(missing.map((m) => m.name)).toEqual(["tomate", "ovos"]);
  });
});

describe("excludeExistingGroceryItems", () => {
  it("drops items already on the list, case-insensitively", () => {
    const result = excludeExistingGroceryItems(
      [{ name: "Tomate" }, { name: "Limão" }, { name: "pão" }],
      ["tomate", "PÃO"],
    );
    expect(result).toEqual([{ name: "Limão" }]);
  });
});

describe("parseIngredientQuantity", () => {
  it("keeps numbers as they are", () => {
    expect(parseIngredientQuantity(2.5)).toBe(2.5);
  });

  it("parses numeric strings", () => {
    expect(parseIngredientQuantity("3")).toBe(3);
    expect(parseIngredientQuantity("1.5 xícara")).toBe(1.5);
  });

  it("defaults unparseable or missing quantities to 1", () => {
    expect(parseIngredientQuantity("a gosto")).toBe(1);
    expect(parseIngredientQuantity(undefined)).toBe(1);
    expect(parseIngredientQuantity("0")).toBe(1);
  });
});
