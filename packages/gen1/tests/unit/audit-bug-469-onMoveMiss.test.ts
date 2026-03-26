/**
 * Gen 1 onMoveMiss tests for audit bug #469.
 *
 * #469 — Gen1-specific: onMoveMiss sets rage-miss-lock volatile when Rage misses
 *        while the user has the "rage" volatile active.
 *
 * Source: pret/pokered engine/battle/core.asm — RageEffect miss loop
 * Source: pret/pokered — Explosion/Self-Destruct user faints even on miss
 */
import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createPokemonInstance,
  type MoveData,
  type PokemonType,
  SeededRandom,
  type StatBlock,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS } from "../../src";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const GENDERS = CORE_GENDERS;
const NATURES = CORE_NATURE_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const ITEMS = CORE_ITEM_IDS;

function createSyntheticActivePokemon(opts: {
  types: PokemonType[];
  currentHp?: number;
  hp?: number;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: opts.hp ?? 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = createPokemonInstance(
    dataManager.getSpecies(GEN1_SPECIES_IDS.bulbasaur),
    50,
    new SeededRandom(0),
    {
      nature: NATURES.hardy,
      ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: opts.currentHp ?? opts.hp ?? 200,
      moves: [GEN1_MOVE_IDS.tackle],
      abilitySlot: ABILITY_SLOTS.normal1,
      heldItem: null,
      status: null,
      friendship: 0,
      gender: GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: stats,
    },
  );

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMinimalState(): BattleState {
  return {
    sides: [],
    weather: null,
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createCanonicalMove(id: string, handler?: string): MoveData {
  const sourceMove = dataManager.getMove(id);
  return {
    ...sourceMove,
    effect: handler ? { type: "custom" as const, handler } : sourceMove.effect,
    id,
  } as MoveData;
}

const dataManager = createGen1DataManager();
const ruleset = new Gen1Ruleset(dataManager);

// ═══════════════════════════════════════════════════════════════════════════
// #469 — Gen 1 onMoveMiss: rage-miss-lock
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen 1 onMoveMiss — #469 rage-miss-lock", () => {
  it("given actor has rage volatile and Rage misses, when onMoveMiss called, then rage-miss-lock volatile is set", () => {
    // Source: pret/pokered RageEffect — once Rage misses while locked into Rage,
    // all subsequent Rage uses auto-miss (replicating the cartridge infinite loop).
    const actor = createSyntheticActivePokemon({ types: [TYPES.normal], currentHp: 200 });
    actor.volatileStatuses.set(VOLATILES.rage, { turnsLeft: -1 });
    const rageMove = createCanonicalMove(GEN1_MOVE_IDS.rage);
    const state = createMinimalState();

    ruleset.onMoveMiss(actor, rageMove, state);

    expect(actor.volatileStatuses.has("rage-miss-lock")).toBe(true);
    expect(actor.volatileStatuses.get("rage-miss-lock")!.turnsLeft).toBe(-1);
  });

  it("given actor does NOT have rage volatile and Rage misses, when onMoveMiss called, then rage-miss-lock is NOT set", () => {
    // Source: pret/pokered — rage-miss-lock only triggers if the Rage volatile is active.
    // Triangulation: same move (Rage) but without the rage volatile = no miss-lock.
    const actor = createSyntheticActivePokemon({ types: [TYPES.normal], currentHp: 200 });
    const rageMove = createCanonicalMove(GEN1_MOVE_IDS.rage);
    const state = createMinimalState();

    ruleset.onMoveMiss(actor, rageMove, state);

    expect(actor.volatileStatuses.has("rage-miss-lock")).toBe(false);
  });

  it("given actor has rage volatile and a non-Rage move misses, when onMoveMiss called, then rage-miss-lock IS still set (any miss while in rage volatile)", () => {
    // Source: pret/pokered — the miss-lock check is on the rage volatile presence,
    // not on which specific move missed. If the actor is locked into rage and any
    // move misses (which would only be rage in practice), the lock activates.
    const actor = createSyntheticActivePokemon({ types: [TYPES.normal], currentHp: 200 });
    actor.volatileStatuses.set(VOLATILES.rage, { turnsLeft: -1 });
    const tackleMove = createCanonicalMove(GEN1_MOVE_IDS.tackle);
    const state = createMinimalState();

    ruleset.onMoveMiss(actor, tackleMove, state);

    // The code checks actor.volatileStatuses.has("rage"), not move.id === "rage"
    expect(actor.volatileStatuses.has("rage-miss-lock")).toBe(true);
  });

  it("given Explosion misses in Gen 1, when onMoveMiss called, then actor HP is set to 0", () => {
    // Source: pret/pokered — Self-Destruct/Explosion: user faints even on miss (all gens)
    // This verifies the Gen 1 implementation inherits the explosion behavior too.
    const actor = createSyntheticActivePokemon({ types: [TYPES.normal], currentHp: 200 });
    const explosionMove = createCanonicalMove(GEN1_MOVE_IDS.explosion, GEN1_MOVE_IDS.explosion);
    const state = createMinimalState();

    ruleset.onMoveMiss(actor, explosionMove, state);

    expect(actor.pokemon.currentHp).toBe(0);
  });
});
