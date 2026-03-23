/**
 * Tests for #684: Gen6 Phantom Force / Shadow Force does not check Power Herb.
 *
 * Power Herb should skip the charge turn of two-turn moves like Phantom Force,
 * consuming the item and allowing the move to execute immediately.
 * Klutz and Embargo suppress item effects, so Power Herb should not work.
 *
 * Source: Showdown data/items.ts -- powerherb: onTryMove skips charge, item consumed
 * Source: Showdown data/abilities.ts -- klutz: item has no effect
 */

import type { ActivePokemon, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveTarget } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { executeGen6MoveEffect } from "../src/Gen6MoveEffects";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as move-effects.test.ts)
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  ability?: string;
  heldItem?: string | null;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  consecutiveProtects?: number;
  turnsOnField?: number;
  nickname?: string;
  maxHp?: number;
  moves?: Array<{ moveId: string }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      currentHp: maxHp,
      status: null,
      heldItem: overrides.heldItem ?? null,
      moves: overrides.moves ?? [{ moveId: "phantom-force" }],
      nickname: overrides.nickname ?? null,
      speciesId: 25,
    },
    ability: overrides.ability ?? "blaze",
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: ["normal"] as const,
    consecutiveProtects: overrides.consecutiveProtects ?? 0,
    turnsOnField: overrides.turnsOnField ?? 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
  } as unknown as ActivePokemon;
}

function makeMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    displayName: id,
    type: "ghost",
    category: "physical",
    power: 90,
    accuracy: 100,
    pp: 10,
    priority: 0,
    target: "adjacent-foe" as MoveTarget,
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: false,
      mirror: false,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 6,
    ...overrides,
  } as MoveData;
}

function makeContext(
  moveId: string,
  options?: {
    attacker?: Parameters<typeof makeActivePokemon>[0];
    defender?: Parameters<typeof makeActivePokemon>[0];
    moveOverrides?: Partial<MoveData>;
  },
): MoveEffectContext {
  return {
    attacker: makeActivePokemon(options?.attacker ?? {}),
    defender: makeActivePokemon(options?.defender ?? {}),
    move: makeMove(moveId, options?.moveOverrides),
    damage: 0,
    state: {
      weather: null,
      terrain: null,
      trickRoom: { active: false, turnsLeft: 0 },
      magicRoom: { active: false, turnsLeft: 0 },
      wonderRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
    },
    rng: new SeededRandom(42),
  } as MoveEffectContext;
}

/** Always-succeed protect roll (not used for Phantom Force, but needed for the dispatcher) */
function alwaysSucceedProtect(_consecutiveProtects: number, _rng: SeededRandom): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// #684: Phantom Force + Power Herb
// ---------------------------------------------------------------------------

describe("#684 — Gen6 Phantom Force Power Herb check", () => {
  it("given Pokemon holds Power Herb and uses Phantom Force (first turn), when move effect executes, then item is consumed and no forcedMoveSet is set (move executes immediately)", () => {
    // Source: Showdown data/items.ts -- powerherb: onTryMove skips charge, item consumed
    // Power Herb allows the Pokemon to skip the charge turn entirely.
    // The result should have attackerItemConsumed: true and NO forcedMoveSet.
    const ctx = makeContext("phantom-force", {
      attacker: {
        heldItem: "power-herb",
        moves: [{ moveId: "phantom-force" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    // Power Herb consumed
    expect(result!.attackerItemConsumed).toBe(true);
    // No charge turn — the move executes immediately, so forcedMoveSet should be absent
    expect(result!.forcedMoveSet).toBeUndefined();
    // Message about Power Herb activation
    expect(result!.messages[0]).toContain("Power Herb");
  });

  it("given Pokemon holds Power Herb but has Klutz, when Phantom Force charge turn executes, then Power Herb is NOT consumed and charge proceeds normally", () => {
    // Source: Showdown data/abilities.ts -- klutz: item has no effect
    // Klutz suppresses item effects, so Power Herb should not activate.
    const ctx = makeContext("phantom-force", {
      attacker: {
        heldItem: "power-herb",
        ability: "klutz",
        moves: [{ moveId: "phantom-force" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    // Power Herb NOT consumed
    expect(result!.attackerItemConsumed).toBeFalsy();
    // Charge turn proceeds normally — forcedMoveSet should be set
    expect(result!.forcedMoveSet).toBeDefined();
    expect(result!.forcedMoveSet!.moveId).toBe("phantom-force");
    expect(result!.forcedMoveSet!.volatileStatus).toBe("shadow-force-charging");
    // Message should be the normal charge message, not Power Herb
    expect(result!.messages[0]).toContain("vanished");
  });

  it("given Pokemon holds Power Herb but has Embargo volatile, when Phantom Force charge turn executes, then Power Herb is NOT consumed and charge proceeds normally", () => {
    // Source: Showdown data/moves.ts -- embargo: prevents item use
    // Embargo suppresses item effects similarly to Klutz.
    const embargoVolatiles = new Map([["embargo", { turnsLeft: 3 }]]);
    const ctx = makeContext("phantom-force", {
      attacker: {
        heldItem: "power-herb",
        volatileStatuses: embargoVolatiles,
        moves: [{ moveId: "phantom-force" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    // Power Herb NOT consumed
    expect(result!.attackerItemConsumed).toBeFalsy();
    // Charge turn proceeds normally
    expect(result!.forcedMoveSet).toBeDefined();
    expect(result!.forcedMoveSet!.moveId).toBe("phantom-force");
  });

  it("given Pokemon holds no item and uses Phantom Force, when charge turn executes, then normal charge behavior (forcedMoveSet set, no item consumed)", () => {
    // Source: Showdown data/moves.ts -- phantomforce without Power Herb = normal 2-turn
    // Baseline: no Power Herb, so charge proceeds as normal.
    const ctx = makeContext("phantom-force", {
      attacker: {
        heldItem: null,
        moves: [{ moveId: "phantom-force" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.attackerItemConsumed).toBeFalsy();
    expect(result!.forcedMoveSet).toBeDefined();
    expect(result!.forcedMoveSet!.moveId).toBe("phantom-force");
    expect(result!.forcedMoveSet!.volatileStatus).toBe("shadow-force-charging");
    expect(result!.messages[0]).toContain("vanished");
  });

  it("given Pokemon holds Power Herb and already has the charge volatile (second turn), when Phantom Force executes, then returns null (attack proceeds, no item consumed)", () => {
    // Source: Showdown data/moves.ts -- second turn: attack, no charge check
    // On the second turn the volatile is already set, so Power Herb check is irrelevant.
    const chargeVolatiles = new Map([["shadow-force-charging", { turnsLeft: 1 }]]);
    const ctx = makeContext("phantom-force", {
      attacker: {
        heldItem: "power-herb",
        volatileStatuses: chargeVolatiles,
        moves: [{ moveId: "phantom-force" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    // Second turn: returns null so the engine handles normal damage
    expect(result).toBeNull();
  });
});
