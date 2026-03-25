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
import {
  CORE_ABILITY_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import { executeGen6MoveEffect } from "../src/Gen6MoveEffects";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const dataManager = createGen6DataManager();
const PHANTOM_FORCE = GEN6_MOVE_IDS.phantomForce;
const POWER_HERB = GEN6_ITEM_IDS.powerHerb;
const DEFAULT_SPECIES_ID = GEN6_SPECIES_IDS.pikachu;
const DEFAULT_NATURE_ID = GEN6_NATURE_IDS.hardy;
const DEFAULT_ABILITY = CORE_ABILITY_IDS.none;
const KLUTZ = CORE_ABILITY_IDS.klutz;
const EMBARGO = CORE_VOLATILE_IDS.embargo;
const SHADOW_FORCE_CHARGING = CORE_VOLATILE_IDS.shadowForceCharging;
const PHANTOM_FORCE_MOVE = dataManager.getMove(PHANTOM_FORCE);

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
      uid: "test-active",
      level: 50,
      experience: 0,
      nature: DEFAULT_NATURE_ID,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
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
      moves: overrides.moves ?? [{ moveId: PHANTOM_FORCE }],
      nickname: overrides.nickname ?? null,
      speciesId: DEFAULT_SPECIES_ID,
    },
    ability: overrides.ability ?? DEFAULT_ABILITY,
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: [CORE_TYPE_IDS.normal] as const,
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
    ...dataManager.getMove(id),
    target: dataManager.getMove(id).target as MoveTarget,
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
    const ctx = makeContext(PHANTOM_FORCE, {
      attacker: {
        heldItem: POWER_HERB,
        moves: [{ moveId: PHANTOM_FORCE }],
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
    const ctx = makeContext(PHANTOM_FORCE, {
      attacker: {
        heldItem: POWER_HERB,
        ability: KLUTZ,
        moves: [{ moveId: PHANTOM_FORCE }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    // Power Herb NOT consumed
    expect(result!.attackerItemConsumed).toBeUndefined();
    // Charge turn proceeds normally — forcedMoveSet is set with expected fields
    expect(result!.forcedMoveSet!.moveId).toBe(PHANTOM_FORCE);
    expect(result!.forcedMoveSet!.volatileStatus).toBe(SHADOW_FORCE_CHARGING);
    // Message should be the normal charge message, not Power Herb
    expect(result!.messages[0]).toContain("vanished");
  });

  it("given Pokemon holds Power Herb but has Embargo volatile, when Phantom Force charge turn executes, then Power Herb is NOT consumed and charge proceeds normally", () => {
    // Source: Showdown data/moves.ts -- embargo: prevents item use
    // Embargo suppresses item effects similarly to Klutz.
    const embargoVolatiles = new Map([[EMBARGO, { turnsLeft: 3 }]]);
    const ctx = makeContext(PHANTOM_FORCE, {
      attacker: {
        heldItem: POWER_HERB,
        volatileStatuses: embargoVolatiles,
        moves: [{ moveId: PHANTOM_FORCE }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    // Power Herb NOT consumed
    expect(result!.attackerItemConsumed).toBeUndefined();
    // Charge turn proceeds normally — forcedMoveSet is set with expected move
    expect(result!.forcedMoveSet!.moveId).toBe(PHANTOM_FORCE);
  });

  it("given Pokemon holds no item and uses Phantom Force, when charge turn executes, then normal charge behavior (forcedMoveSet set, no item consumed)", () => {
    // Source: Showdown data/moves.ts -- phantomforce without Power Herb = normal 2-turn
    // Baseline: no Power Herb, so charge proceeds as normal.
    const ctx = makeContext(PHANTOM_FORCE, {
      attacker: {
        heldItem: null,
        moves: [{ moveId: PHANTOM_FORCE }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.attackerItemConsumed).toBeUndefined();
    expect(result!.forcedMoveSet!.moveId).toBe(PHANTOM_FORCE);
    expect(result!.forcedMoveSet!.volatileStatus).toBe(SHADOW_FORCE_CHARGING);
    expect(result!.messages[0]).toContain("vanished");
  });

  it("given Pokemon holds Power Herb and already has the charge volatile (second turn), when Phantom Force executes, then returns null (attack proceeds, no item consumed)", () => {
    // Source: Showdown data/moves.ts -- second turn: attack, no charge check
    // On the second turn the volatile is already set, so Power Herb check is irrelevant.
    const chargeVolatiles = new Map([[SHADOW_FORCE_CHARGING, { turnsLeft: 1 }]]);
    const ctx = makeContext(PHANTOM_FORCE, {
      attacker: {
        heldItem: POWER_HERB,
        volatileStatuses: chargeVolatiles,
        moves: [{ moveId: PHANTOM_FORCE }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    // Second turn: returns null so the engine handles normal damage
    expect(result).toBeNull();
  });
});
