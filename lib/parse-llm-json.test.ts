import { describe, expect, it } from "vitest";
import { extractJsonArray } from "./parse-llm-json";

describe("extractJsonArray", () => {
  it("parses a bare JSON array", () => {
    expect(extractJsonArray('[{"name":"Omelete"}]')).toEqual([{ name: "Omelete" }]);
  });

  it("extracts the array from prose and markdown fences", () => {
    const text = 'Aqui estão as receitas:\n```json\n[{"name":"Sopa"},{"name":"Salada"}]\n```\nBom apetite!';
    expect(extractJsonArray(text)).toEqual([{ name: "Sopa" }, { name: "Salada" }]);
  });

  it("repairs trailing commas", () => {
    const text = '[{"name":"Curry","tags":["rapida",],},]';
    expect(extractJsonArray(text)).toEqual([{ name: "Curry", tags: ["rapida"] }]);
  });

  it("repairs raw control characters inside strings", () => {
    const text = '[{"description":"linha 1\nlinha 2"}]';
    expect(extractJsonArray(text)).toEqual([{ description: "linha 1 linha 2" }]);
  });

  it("returns null when there is no array", () => {
    expect(extractJsonArray("Desculpe, não consegui gerar receitas.")).toBeNull();
  });

  it("returns null when the array is not valid JSON even after repair", () => {
    expect(extractJsonArray("[{name: 'sem aspas'}]")).toBeNull();
  });
});
