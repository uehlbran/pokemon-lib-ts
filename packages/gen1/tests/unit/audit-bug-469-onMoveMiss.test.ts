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
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager } from "../../src/data";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createActivePokemon(opts: {
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

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? opts.hp ?? 200,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

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

function createMoveData(id: string, handler?: string): MoveData {
  return {
    id,
    displayName: id.charAt(0).toUpperCase() + id.slice(1),
    type: "normal" as PokemonType,
    category: "physical" as const,
    power: id === "explosion" ? 250 : 40,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe" as const,
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
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: handler ? { type: "custom" as const, handler } : null,
    description: "",
    generation: 1,
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
    const actor = createActivePokemon({ types: ["normal"], currentHp: 200 });
    actor.volatileStatuses.set("rage", { turnsLeft: -1 });
    const rageMove = createMoveData("rage");
    const state = createMinimalState();

    ruleset.onMoveMiss(actor, rageMove, state);

    expect(actor.volatileStatuses.has("rage-miss-lock")).toBe(true);
    expect(actor.volatileStatuses.get("rage-miss-lock")!.turnsLeft).toBe(-1);
  });

  it("given actor does NOT have rage volatile and Rage misses, when onMoveMiss called, then rage-miss-lock is NOT set", () => {
    // Source: pret/pokered — rage-miss-lock only triggers if the Rage volatile is active.
    // Triangulation: same move (Rage) but without the rage volatile = no miss-lock.
    const actor = createActivePokemon({ types: ["normal"], currentHp: 200 });
    const rageMove = createMoveData("rage");
    const state = createMinimalState();

    ruleset.onMoveMiss(actor, rageMove, state);

    expect(actor.volatileStatuses.has("rage-miss-lock")).toBe(false);
  });

  it("given actor has rage volatile and a non-Rage move misses, when onMoveMiss called, then rage-miss-lock IS still set (any miss while in rage volatile)", () => {
    // Source: pret/pokered — the miss-lock check is on the rage volatile presence,
    // not on which specific move missed. If the actor is locked into rage and any
    // move misses (which would only be rage in practice), the lock activates.
    const actor = createActivePokemon({ types: ["normal"], currentHp: 200 });
    actor.volatileStatuses.set("rage", { turnsLeft: -1 });
    const tackleMove = createMoveData("tackle");
    const state = createMinimalState();

    ruleset.onMoveMiss(actor, tackleMove, state);

    // The code checks actor.volatileStatuses.has("rage"), not move.id === "rage"
    expect(actor.volatileStatuses.has("rage-miss-lock")).toBe(true);
  });

  it("given Explosion misses in Gen 1, when onMoveMiss called, then actor HP is set to 0", () => {
    // Source: pret/pokered — Self-Destruct/Explosion: user faints even on miss (all gens)
    // This verifies the Gen 1 implementation inherits the explosion behavior too.
    const actor = createActivePokemon({ types: ["normal"], currentHp: 200 });
    const explosionMove = createMoveData("explosion", "explosion");
    const state = createMinimalState();

    ruleset.onMoveMiss(actor, explosionMove, state);

    expect(actor.pokemon.currentHp).toBe(0);
  });
});
