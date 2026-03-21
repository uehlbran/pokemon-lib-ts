import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { Gen3Ruleset } from "../src/Gen3Ruleset";

/**
 * Gen 3 Liquid Ooze Tests
 *
 * Tests for:
 *   - Liquid Ooze: drain moves (Absorb, Mega Drain, Giga Drain, Leech Life, Dream Eater)
 *     deal damage to the attacker instead of healing
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_LIQUID_OOZE
 * Source: Showdown data/abilities.ts — Liquid Ooze onSourceTryHeal
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number, chanceResult = false) {
  return {
    next: () => 0.5,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_percent: number) => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  types: PokemonType[];
  ability?: string;
  currentHp?: number;
  heldItem?: string | null;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
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
    currentHp: opts.currentHp ?? 200,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
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
  } as ActivePokemon;
}

function createMinimalBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createDrainMove(id: string, type: PokemonType, power: number): MoveData {
  return {
    id,
    displayName: id,
    type,
    category: "special",
    power,
    accuracy: 100,
    pp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
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
    effect: { type: "drain", amount: 0.5 },
    description: "",
    generation: 3,
  } as MoveData;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

describe("Gen 3 Liquid Ooze — drain moves become damage", () => {
  it("given defender with Liquid Ooze, when drain move hits, then attacker takes recoil damage instead of healing", () => {
    // Source: pret/pokeemerald ABILITY_LIQUID_OOZE — drain causes damage instead of heal
    // Source: Showdown data/abilities.ts — Liquid Ooze: this.damage(damage); return 0;
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: ["poison"], ability: "liquid-ooze" });
    const gigaDrain = createDrainMove("giga-drain", "grass", 60);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, gigaDrain, 80, rng);

    const result = ruleset.executeMoveEffect(ctx);

    // damage = 80, drain fraction = 0.5 → drain amount = floor(80 * 0.5) = 40
    // With Liquid Ooze: attacker takes 40 recoil instead of healing 40
    expect(result.healAmount).toBe(0);
    expect(result.recoilDamage).toBe(40);
  });

  it("given defender with Liquid Ooze, when drain move hits for 100 damage, then recoil = floor(100 * 0.5) = 50", () => {
    // Source: pret/pokeemerald — Liquid Ooze recoil matches what would have been drained
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: ["poison"], ability: "liquid-ooze" });
    const absorb = createDrainMove("absorb", "grass", 20);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, absorb, 100, rng);

    const result = ruleset.executeMoveEffect(ctx);

    // damage = 100, drain fraction = 0.5 → drain amount = floor(100 * 0.5) = 50
    expect(result.healAmount).toBe(0);
    expect(result.recoilDamage).toBe(50);
  });

  it("given defender without Liquid Ooze, when drain move hits, then attacker heals normally", () => {
    // Source: pret/pokeemerald — without Liquid Ooze, drain works normally
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: ["poison"] });
    const gigaDrain = createDrainMove("giga-drain", "grass", 60);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, gigaDrain, 80, rng);

    const result = ruleset.executeMoveEffect(ctx);

    // Normal drain: floor(80 * 0.5) = 40 healing
    expect(result.healAmount).toBe(40);
    expect(result.recoilDamage).toBe(0);
  });

  it("given defender with Liquid Ooze, when drain move hits for 1 damage, then minimum recoil is 1", () => {
    // Source: pret/pokeemerald — minimum drain/recoil is 1
    const attacker = createActivePokemon({ types: ["grass"] });
    const defender = createActivePokemon({ types: ["poison"], ability: "liquid-ooze" });
    const absorb = createDrainMove("absorb", "grass", 20);
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, absorb, 1, rng);

    const result = ruleset.executeMoveEffect(ctx);

    // damage = 1, drain = max(1, floor(1*0.5)) = max(1, 0) = 1
    expect(result.recoilDamage).toBe(1);
    expect(result.healAmount).toBe(0);
  });
});
