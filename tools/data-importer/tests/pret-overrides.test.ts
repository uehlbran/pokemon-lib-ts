/**
 * Pret override system tests.
 *
 * Tests the apply-overrides engine and the gen-specific override lists.
 * Does NOT require pret reference files — only verifies override logic.
 */

import { describe, expect, it } from "vitest";
import { applyMoveOverrides, applyPokemonOverrides } from "../src/pret-overrides/apply-overrides";
import { gen2Overrides } from "../src/pret-overrides/gen2-overrides";
import { gen3Overrides } from "../src/pret-overrides/gen3-overrides";
import { gen4Overrides } from "../src/pret-overrides/gen4-overrides";
import type { PretOverride } from "../src/pret-overrides/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMove(id: string, priority: number, extra: object = {}) {
  return {
    id,
    priority,
    power: null,
    accuracy: null,
    pp: 10,
    type: "normal",
    category: "physical" as const,
    ...extra,
  };
}

// ── applyMoveOverrides — Gen 2 priority scale ─────────────────────────────────

describe("applyMoveOverrides — Gen 2 base priority scale", () => {
  it("given Gen 2 normal moves with priority 0, when applying overrides, then priority becomes 1 (BASE_PRIORITY)", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — BASE_PRIORITY = 1
    const moves = [makeMove("tackle", 0), makeMove("pound", 0), makeMove("scratch", 0)];
    const result = applyMoveOverrides(2, moves, []);
    for (const m of result) {
      expect(m.priority).toBe(1);
    }
  });

  it("given Gen 2 moves with priority 3 (protect), when applying overrides, then priority stays 3", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_PROTECT priority 3
    const moves = [makeMove("protect", 3), makeMove("detect", 3), makeMove("endure", 3)];
    const result = applyMoveOverrides(2, moves, []);
    for (const m of result) {
      expect(m.priority).toBe(3);
    }
  });

  it("given Gen 3+ normal moves with priority 0, when applying overrides, then priority stays 0", () => {
    // Gen 3+ uses 0-based scale — no bulk shift applied
    const moves = [makeMove("tackle", 0), makeMove("pound", 0)];
    const result = applyMoveOverrides(3, moves, []);
    for (const m of result) {
      expect(m.priority).toBe(0);
    }
  });
});

// ── applyMoveOverrides — explicit overrides ───────────────────────────────────

describe("applyMoveOverrides — explicit overrides", () => {
  it("given a move override, when applying, then the field is updated", () => {
    // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_QUICK_ATTACK priority 2
    const moves = [makeMove("quick-attack", 1)];
    const overrides: PretOverride[] = [
      { target: "move", moveId: "quick-attack", field: "priority", value: 2, source: "test" },
    ];
    const result = applyMoveOverrides(3, moves, overrides);
    expect(result[0]!.priority).toBe(2);
  });

  it("given a move override, when the move is not found, then it throws", () => {
    const moves = [makeMove("tackle", 0)];
    const overrides: PretOverride[] = [
      { target: "move", moveId: "nonexistent", field: "priority", value: 3, source: "test" },
    ];
    expect(() => applyMoveOverrides(3, moves, overrides)).toThrow(/not found.*nonexistent/);
  });

  it("given a stale override (value already correct), when applying, then it throws", () => {
    const moves = [makeMove("endure", 3)];
    const overrides: PretOverride[] = [
      { target: "move", moveId: "endure", field: "priority", value: 3, source: "test" },
    ];
    expect(() => applyMoveOverrides(3, moves, overrides)).toThrow(/[Ss]tale/);
  });

  it("given original move array, when applyMoveOverrides runs, then original is not mutated", () => {
    const moves = [makeMove("tackle", 0)];
    const original = moves[0]!.priority;
    applyMoveOverrides(2, moves, []);
    expect(moves[0]!.priority).toBe(original);
  });
});

// ── applyPokemonOverrides ─────────────────────────────────────────────────────

describe("applyPokemonOverrides", () => {
  const makePokemon = (name: string, hp = 50) => ({
    id: 1,
    name,
    baseStats: { hp, attack: 50, defense: 50, speed: 50, spAttack: 50, spDefense: 50 },
    types: ["normal"],
  });

  it("given a pokemon stat override, when applying, then the stat is updated", () => {
    const pokemon = [makePokemon("Bulbasaur", 45)];
    const overrides: PretOverride[] = [
      { target: "pokemon", name: "Bulbasaur", field: "baseStats.hp", value: 99, source: "test" },
    ];
    const result = applyPokemonOverrides(1, pokemon, overrides);
    expect(result[0]!.baseStats.hp).toBe(99);
  });

  it("given a pokemon override, when pokemon is not found, then it throws", () => {
    const pokemon = [makePokemon("Bulbasaur")];
    const overrides: PretOverride[] = [
      { target: "pokemon", name: "Nonexistent", field: "baseStats.hp", value: 99, source: "test" },
    ];
    expect(() => applyPokemonOverrides(1, pokemon, overrides)).toThrow(/not found.*Nonexistent/);
  });

  it("given a stale pokemon override, when applying, then it throws", () => {
    const pokemon = [makePokemon("Bulbasaur", 99)];
    const overrides: PretOverride[] = [
      { target: "pokemon", name: "Bulbasaur", field: "baseStats.hp", value: 99, source: "test" },
    ];
    expect(() => applyPokemonOverrides(1, pokemon, overrides)).toThrow(/[Ss]tale/);
  });
});

// ── Gen 2 override list correctness ──────────────────────────────────────────

describe("gen2Overrides list", () => {
  it("quick-attack override sets priority to 2", () => {
    const o = gen2Overrides.find((x) => x.target === "move" && x.moveId === "quick-attack");
    expect(o).toBeDefined();
    expect(o?.value).toBe(2);
  });

  it("mach-punch override sets priority to 2", () => {
    const o = gen2Overrides.find((x) => x.target === "move" && x.moveId === "mach-punch");
    expect(o?.value).toBe(2);
  });

  it("extreme-speed override sets priority to 2", () => {
    const o = gen2Overrides.find((x) => x.target === "move" && x.moveId === "extreme-speed");
    expect(o?.value).toBe(2);
  });

  it("roar override sets priority to 0", () => {
    const o = gen2Overrides.find((x) => x.target === "move" && x.moveId === "roar");
    expect(o?.value).toBe(0);
  });

  it("whirlwind override sets priority to 0", () => {
    const o = gen2Overrides.find((x) => x.target === "move" && x.moveId === "whirlwind");
    expect(o?.value).toBe(0);
  });

  it("counter override sets priority to 0", () => {
    const o = gen2Overrides.find((x) => x.target === "move" && x.moveId === "counter");
    expect(o?.value).toBe(0);
  });

  it("mirror-coat override sets priority to 0", () => {
    const o = gen2Overrides.find((x) => x.target === "move" && x.moveId === "mirror-coat");
    expect(o?.value).toBe(0);
  });

  it("vital-throw override sets priority to 0", () => {
    const o = gen2Overrides.find((x) => x.target === "move" && x.moveId === "vital-throw");
    expect(o?.value).toBe(0);
  });
});

// ── Gen 3/4 override list correctness ────────────────────────────────────────

describe("gen3Overrides list", () => {
  it("endure override sets priority to 3", () => {
    // Source: pret/pokeemerald src/data/battle_moves.h — endure: .priority = 3
    const o = gen3Overrides.find((x) => x.target === "move" && x.moveId === "endure");
    expect(o).toBeDefined();
    expect(o?.value).toBe(3);
  });
});

describe("gen4Overrides list", () => {
  it("endure override sets priority to 3", () => {
    // Source: pret/pokeplatinum res/battle/moves/endure/data.json — priority: 3
    const o = gen4Overrides.find((x) => x.target === "move" && x.moveId === "endure");
    expect(o).toBeDefined();
    expect(o?.value).toBe(3);
  });
});
