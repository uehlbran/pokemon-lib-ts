import type { ActivePokemon, BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { DataManager, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { Gen3Ruleset } from "../src/Gen3Ruleset";

/**
 * Gen 3 Swift Swim / Chlorophyll Speed Tests
 *
 * Tests for:
 *   - Swift Swim: 2x Speed in Rain
 *   - Chlorophyll: 2x Speed in Sun
 *   - No activation in wrong weather or no weather
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_SWIFT_SWIM / ABILITY_CHLOROPHYLL
 * Source: Showdown data/abilities.ts — Swift Swim/Chlorophyll onModifySpe
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createActivePokemon(opts: {
  types: PokemonType[];
  ability?: string;
  speed?: number;
  moves?: Array<{ moveId: string; currentPp: number; maxPp: number }>;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: opts.speed ?? 100,
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
    currentHp: 200,
    moves: opts.moves ?? [{ moveId: "tackle", currentPp: 35, maxPp: 35 }],
    ability: opts.ability ?? "",
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
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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

function createBattleState(opts: {
  side0Active: ActivePokemon;
  side1Active: ActivePokemon;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): BattleState {
  return {
    sides: [
      {
        active: [opts.side0Active],
        team: [opts.side0Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [opts.side1Active],
        team: [opts.side1Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: opts.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

describe("Gen 3 Swift Swim — 2x Speed in Rain", () => {
  it("given rain weather and Swift Swim user (speed 50) vs normal user (speed 80), when turn order is resolved, then Swift Swim user moves first", () => {
    // Source: pret/pokeemerald — Swift Swim doubles speed in rain
    // Source: Showdown data/abilities.ts — Swift Swim onModifySpe: 2x in rain
    // Swift Swim user: speed 50 * 2 = 100 → faster than 80
    const swiftSwimMon = createActivePokemon({
      types: ["water"],
      ability: "swift-swim",
      speed: 50,
    });
    const normalMon = createActivePokemon({
      types: ["normal"],
      speed: 80,
    });

    const state = createBattleState({
      side0Active: swiftSwimMon,
      side1Active: normalMon,
      weather: { type: "rain", turnsLeft: 3, source: "rain-dance" },
    });

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const sorted = ruleset.resolveTurnOrder(actions, state, rng);

    // Swift Swim user (side 0, speed 100 after 2x) should go before normal (side 1, speed 80)
    expect(sorted[0]!.side).toBe(0);
    expect(sorted[1]!.side).toBe(1);
  });

  it("given no weather and Swift Swim user (speed 50) vs normal user (speed 80), when turn order is resolved, then normal user moves first", () => {
    // Source: pret/pokeemerald — Swift Swim only activates in rain
    const swiftSwimMon = createActivePokemon({
      types: ["water"],
      ability: "swift-swim",
      speed: 50,
    });
    const normalMon = createActivePokemon({
      types: ["normal"],
      speed: 80,
    });

    const state = createBattleState({
      side0Active: swiftSwimMon,
      side1Active: normalMon,
      weather: null,
    });

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const sorted = ruleset.resolveTurnOrder(actions, state, rng);

    // Without rain: side 0 speed 50, side 1 speed 80 → side 1 first
    expect(sorted[0]!.side).toBe(1);
    expect(sorted[1]!.side).toBe(0);
  });
});

describe("Gen 3 Chlorophyll — 2x Speed in Sun", () => {
  it("given sun weather and Chlorophyll user (speed 50) vs normal user (speed 80), when turn order is resolved, then Chlorophyll user moves first", () => {
    // Source: pret/pokeemerald — Chlorophyll doubles speed in sun
    // Source: Showdown data/abilities.ts — Chlorophyll onModifySpe: 2x in sun
    // Chlorophyll user: speed 50 * 2 = 100 → faster than 80
    const chlorophyllMon = createActivePokemon({
      types: ["grass"],
      ability: "chlorophyll",
      speed: 50,
    });
    const normalMon = createActivePokemon({
      types: ["normal"],
      speed: 80,
    });

    const state = createBattleState({
      side0Active: chlorophyllMon,
      side1Active: normalMon,
      weather: { type: "sun", turnsLeft: 3, source: "sunny-day" },
    });

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const sorted = ruleset.resolveTurnOrder(actions, state, rng);

    // Chlorophyll user (side 0, speed 100 after 2x) should go before normal (side 1, speed 80)
    expect(sorted[0]!.side).toBe(0);
    expect(sorted[1]!.side).toBe(1);
  });

  it("given rain weather and Chlorophyll user (speed 50) vs normal user (speed 80), when turn order is resolved, then normal user moves first (Chlorophyll needs sun)", () => {
    // Source: pret/pokeemerald — Chlorophyll only activates in sun, not rain
    const chlorophyllMon = createActivePokemon({
      types: ["grass"],
      ability: "chlorophyll",
      speed: 50,
    });
    const normalMon = createActivePokemon({
      types: ["normal"],
      speed: 80,
    });

    const state = createBattleState({
      side0Active: chlorophyllMon,
      side1Active: normalMon,
      weather: { type: "rain", turnsLeft: 3, source: "rain-dance" },
    });

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const sorted = ruleset.resolveTurnOrder(actions, state, rng);

    // Without sun: side 0 speed 50, side 1 speed 80 → side 1 first
    expect(sorted[0]!.side).toBe(1);
    expect(sorted[1]!.side).toBe(0);
  });

  it("given sun weather and Swift Swim user (speed 50) vs normal user (speed 80), when turn order is resolved, then normal user moves first (Swift Swim needs rain, not sun)", () => {
    // Source: pret/pokeemerald — Swift Swim needs rain, Chlorophyll needs sun
    const swiftSwimMon = createActivePokemon({
      types: ["water"],
      ability: "swift-swim",
      speed: 50,
    });
    const normalMon = createActivePokemon({
      types: ["normal"],
      speed: 80,
    });

    const state = createBattleState({
      side0Active: swiftSwimMon,
      side1Active: normalMon,
      weather: { type: "sun", turnsLeft: 3, source: "sunny-day" },
    });

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const sorted = ruleset.resolveTurnOrder(actions, state, rng);

    // Swift Swim in sun: no activation, side 0 speed 50, side 1 speed 80 → side 1 first
    expect(sorted[0]!.side).toBe(1);
    expect(sorted[1]!.side).toBe(0);
  });
});
