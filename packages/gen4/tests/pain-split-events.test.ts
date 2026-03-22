import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen4Ruleset } from "../src";
import { createGen4DataManager } from "../src/data";

/**
 * Gen 4 Pain Split -- event stream tests.
 *
 * Bug #311 fix: Pain Split was directly mutating currentHp for both Pokemon
 * without going through the event pipeline. Now it uses result fields
 * (healAmount, recoilDamage, customDamage) to communicate HP changes.
 *
 * Source: Showdown Gen 4 -- Pain Split sets both to floor((a + b) / 2)
 * Source: Bulbapedia -- "each have their HP set to the average of the two"
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number, chanceResult = false) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  types: PokemonType[];
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  level?: number;
  ability?: string;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
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
      hp: 0,
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
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        index: 1,
        active: [defender],
        team: [defender.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
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

const dataManager = createGen4DataManager();
const ruleset = new Gen4Ruleset(dataManager);

describe("Gen 4 Pain Split -- event stream result fields (#311)", () => {
  it("given attacker at 20 HP and defender at 80 HP (both maxHp=100), when Pain Split is used, then attacker heals via healAmount and defender takes damage via customDamage", () => {
    // Source: Showdown Gen 4 -- Pain Split sets both to floor((a + b) / 2)
    // average = floor((20 + 80) / 2) = 50
    // attacker gains 30 HP (50 - 20), defender loses 30 HP (80 - 50)
    const attacker = createActivePokemon({
      types: ["ghost"],
      maxHp: 100,
      currentHp: 20,
    });
    const defender = createActivePokemon({
      types: ["normal"],
      maxHp: 100,
      currentHp: 80,
    });
    const move = dataManager.getMove("pain-split");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Attacker gains HP via healAmount
    expect(result.healAmount).toBe(30);
    // Defender loses HP via customDamage
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 30,
      source: "pain-split",
    });
    // No recoil on attacker (attacker gained HP)
    expect(result.recoilDamage).toBe(0);
    expect(result.messages).toContain("The battlers shared their pain!");
  });

  it("given attacker at 80 HP and defender at 20 HP (both maxHp=100), when Pain Split is used, then attacker takes damage via recoilDamage and defender is healed", () => {
    // Source: Showdown Gen 4 -- Pain Split sets both to floor((a + b) / 2)
    // average = floor((80 + 20) / 2) = 50
    // attacker loses 30 HP (80 - 50), defender gains 30 HP (50 - 20)
    const attacker = createActivePokemon({
      types: ["ghost"],
      maxHp: 100,
      currentHp: 80,
    });
    const defender = createActivePokemon({
      types: ["normal"],
      maxHp: 100,
      currentHp: 20,
    });
    const move = dataManager.getMove("pain-split");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Attacker loses HP via recoilDamage
    expect(result.recoilDamage).toBe(30);
    // Defender gains HP -- direct mutation (no defenderHealAmount field exists)
    // Verify defender HP was updated
    expect(defender.pokemon.currentHp).toBe(50);
    // No customDamage on defender (defender gained HP)
    expect(result.customDamage).toBeUndefined();
    // No healing on attacker (attacker lost HP)
    expect(result.healAmount).toBe(0);
    expect(result.messages).toContain("The battlers shared their pain!");
  });

  it("given both at same HP, when Pain Split is used, then no HP changes occur", () => {
    // Source: Showdown Gen 4 -- Pain Split sets both to floor((a + b) / 2)
    // average = floor((100 + 100) / 2) = 100, no change for either
    const attacker = createActivePokemon({
      types: ["ghost"],
      maxHp: 200,
      currentHp: 100,
    });
    const defender = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 100,
    });
    const move = dataManager.getMove("pain-split");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(0);
    expect(result.recoilDamage).toBe(0);
    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("The battlers shared their pain!");
  });

  it("given average exceeds defender maxHp, when Pain Split is used, then defender HP is capped at maxHp", () => {
    // Source: Showdown Gen 4 -- Pain Split caps at maxHp
    // attacker at 180 HP (maxHp=200), defender at 60 HP (maxHp=100)
    // average = floor((180 + 60) / 2) = 120
    // defender new HP = min(120, 100) = 100 (capped at maxHp)
    // defender gains 40 HP (100 - 60)
    // attacker new HP = min(120, 200) = 120
    // attacker loses 60 HP (180 - 120)
    const attacker = createActivePokemon({
      types: ["ghost"],
      maxHp: 200,
      currentHp: 180,
    });
    const defender = createActivePokemon({
      types: ["normal"],
      maxHp: 100,
      currentHp: 60,
    });
    const move = dataManager.getMove("pain-split");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    // Attacker loses 60 HP via recoilDamage
    expect(result.recoilDamage).toBe(60);
    // Defender gains HP (capped at maxHp=100), direct mutation
    expect(defender.pokemon.currentHp).toBe(100);
    expect(result.messages).toContain("The battlers shared their pain!");
  });
});
