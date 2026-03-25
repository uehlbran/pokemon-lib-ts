/**
 * Gen 4 Testing-Gap Coverage Tests
 *
 * Covers issues #426, #427, #428, #432, #442, #443, #446, #455
 *
 * Issues addressed:
 *   #426 — EXP gain tests: fixed circular assertions, added Lucky Egg doc test,
 *           2-participant split, minimum-1 clamp
 *   #427 — Tangled Feet evasion branch coverage
 *   #428 — Natural Cure on-switch-out coverage
 *   #432 — Gen4Abilities default switch branch coverage
 *   #443 — Electric-type NOT immune to paralysis in Gen 4
 *   #446 — No Guard accuracy bypass
 *   #455 — Download raises SpAtk when foe SpDef < Def
 */

import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  NEUTRAL_NATURES,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { canInflictGen4Status } from "../src/Gen4MoveEffects";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

const dataManager = createGen4DataManager();
const MOVES = { ...GEN4_MOVE_IDS } as const;
const SPECIES = GEN4_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const STATUSES = CORE_STATUS_IDS;
const WEATHER = CORE_WEATHER_IDS;
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const DEFAULT_NATURE = NEUTRAL_NATURES[0];
type WeatherId = (typeof WEATHER)[keyof typeof WEATHER];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(dataManager);
}

function makePokemonInstance(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
  heldItem?: string | null;
  calculatedDefense?: number;
  calculatedSpDefense?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: SPECIES.bulbasaur,
    nickname: null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: ABILITIES.none,
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: GEN4_ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: overrides.calculatedDefense ?? 100,
      spAttack: 100,
      spDefense: overrides.calculatedSpDefense ?? 100,
      speed: overrides.speed ?? 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  maxHp?: number;
  speed?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  calculatedDefense?: number;
  calculatedSpDefense?: number;
}): ActivePokemon {
  const pokemon = makePokemonInstance({
    maxHp: overrides.maxHp,
    speed: overrides.speed,
    status: overrides.status,
    heldItem: overrides.heldItem,
    calculatedDefense: overrides.calculatedDefense,
    calculatedSpDefense: overrides.calculatedSpDefense,
  });
    pokemon.ability = overrides.ability ?? ABILITIES.none;
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
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
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

function makeSide(index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

function makeStubState(weather?: { type: WeatherId }): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: weather ? { type: weather.type, turnsLeft: 5, source: WEATHER.sun } : null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeAbilityContext(opts: {
  ability: string;
  opponent?: ReturnType<typeof makeActivePokemon>;
  status?: PokemonInstance["status"];
  volatiles?: Map<string, unknown>;
  maxHp?: number;
  weather?: { type: WeatherId };
  move?: Partial<MoveData>;
}): AbilityContext {
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    status: opts.status,
    maxHp: opts.maxHp,
  });
  if (opts.volatiles) {
    for (const [k, v] of opts.volatiles) {
      pokemon.volatileStatuses.set(k, v);
    }
  }
  return {
    pokemon,
    opponent: opts.opponent,
    state: makeStubState(opts.weather),
    trigger: "on-switch-in",
    move: opts.move as MoveData | undefined,
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  };
}

type AccuracyCtx = Parameters<Gen4Ruleset["doesMoveHit"]>[0];

function makeAccuracyCtx(opts: {
  attackerAbility?: string;
  defenderAbility?: string;
  defenderVolatiles?: Map<string, unknown>;
  moveAccuracy?: number | null;
  seed?: number;
}): AccuracyCtx {
  const attacker = makeActivePokemon({ ability: opts.attackerAbility ?? "" });
  const defender = makeActivePokemon({ ability: opts.defenderAbility ?? "" });
  if (opts.defenderVolatiles) {
    for (const [k, v] of opts.defenderVolatiles) {
      defender.volatileStatuses.set(k, v);
    }
  }
  return {
    attacker,
    defender,
    move: {
      ...dataManager.getMove(MOVES.tackle),
      accuracy: opts.moveAccuracy !== undefined ? opts.moveAccuracy : 100,
    } as AccuracyCtx["move"],
    state: makeStubState(),
    rng: new SeededRandom(opts.seed ?? 1),
  };
}

// ---------------------------------------------------------------------------
// Issue #426 — EXP gain: fixed assertions + new cases
// ---------------------------------------------------------------------------

describe("Gen4Ruleset calculateExpGain — issue #426 fixes", () => {
  it("given wild level 50 Abra (baseExp=62), when calculateExpGain, then returns 442", () => {
    // Source: pret/pokeplatinum src/battle/battle_script.c — classic EXP formula
    // Derivation: floor(62 * 50 / 7 / 1 * 1.0) = floor(442.857) = 442
    // Abra baseExp=62 verified from packages/gen4/data/pokemon.json
    const ruleset = makeRuleset();
    const abra = dataManager.getSpecies(SPECIES.abra);
    expect(abra.baseExp).toBe(62);

    const result = ruleset.calculateExpGain({
      defeatedSpecies: abra,
      defeatedLevel: 50,
      participantLevel: 40,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });

    expect(result).toBe(442);
  });

  it("given trainer battle level 30 Bulbasaur (baseExp=64), when calculateExpGain, then returns 411", () => {
    // Source: pret/pokeplatinum src/battle/battle_script.c — trainer battle gives 1.5x EXP
    // Derivation: floor(64 * 30 / 7 / 1 * 1.5) = floor(274.285 * 1.5) = floor(411.428) = 411
    // Bulbasaur baseExp=64 verified from packages/gen4/data/pokemon.json
    const ruleset = makeRuleset();
    const bulbasaur = dataManager.getSpecies(SPECIES.bulbasaur);
    expect(bulbasaur.baseExp).toBe(64);

    const result = ruleset.calculateExpGain({
      defeatedSpecies: bulbasaur,
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: true,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });

    expect(result).toBe(411);
  });

  it("given wild Abra at level 50 with 2 participants, when calculateExpGain, then each gets 221", () => {
    // Source: pret/pokeplatinum — EXP is split equally among all participants
    // Derivation: floor(62 * 50 / 7 / 2 * 1.0) = floor(221.428) = 221
    const ruleset = makeRuleset();
    const abra = dataManager.getSpecies(SPECIES.abra);

    const result = ruleset.calculateExpGain({
      defeatedSpecies: abra,
      defeatedLevel: 50,
      participantLevel: 40,
      isTrainerBattle: false,
      participantCount: 2,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });

    expect(result).toBe(221);
  });

  it("given Pokemon with baseExp=1 fainted at level 1, when calculateExpGain, then returns minimum 1 EXP", () => {
    // Source: pret/pokeplatinum — Math.max(1, ...) ensures at least 1 EXP is always awarded
    // Derivation: floor(1 * 1 / 7 / 1 * 1.0) = floor(0.142) = 0 → clamped to 1
    // We use a synthetic species with baseExp=1 to hit the clamp branch
    const ruleset = makeRuleset();
    // Use Magikarp-like synthetic: get any species and override baseExp
    const magikarp = dataManager.getSpecies(SPECIES.magikarp);
    const syntheticSpecies = { ...magikarp, baseExp: 1 };

    const result = ruleset.calculateExpGain({
      defeatedSpecies: syntheticSpecies,
      defeatedLevel: 1,
      participantLevel: 50,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });

    expect(result).toBe(1);
  });

  it("given Lucky Egg holder (hasLuckyEgg=true), when calculateExpGain, then returns 1.5x the base EXP", () => {
    // Source: pret/pokeemerald — Lucky Egg applies a 1.5x multiplier after trainer bonus
    //   Without Lucky Egg: floor(62 * 50 / 7) = floor(442.857) = 442
    //   With Lucky Egg: floor(442 * 1.5) = floor(663) = 663
    const ruleset = makeRuleset();
    const abra = dataManager.getSpecies(SPECIES.abra);

    const withoutLuckyEgg = ruleset.calculateExpGain({
      defeatedSpecies: abra,
      defeatedLevel: 50,
      participantLevel: 40,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    });

    const withLuckyEgg = ruleset.calculateExpGain({
      defeatedSpecies: abra,
      defeatedLevel: 50,
      participantLevel: 40,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: true,
      hasExpShare: false,
      affectionBonus: false,
    });

    expect(withoutLuckyEgg).toBe(442);
    expect(withLuckyEgg).toBe(663);
  });

  it("given a traded (same-language) Pokemon in Gen 4, when calculateExpGain with isTradedPokemon=true, then returns 1.5x boosted EXP", () => {
    // Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9984
    //   BattleSystem_PokemonIsOT == FALSE, MON_DATA_LANGUAGE == gGameLanguage → totalExp * 150 / 100
    // b=64 (Bulbasaur), L_d=30, s=1, t=1.0 (wild):
    //   step1 = floor(64 * 30 / 7) = floor(1920/7) = 274
    //   step2 = floor(274 / 1) = 274
    //   step3 = floor(274 * 1.0) = 274
    //   traded: floor(274 * 1.5) = 411
    const ruleset = makeRuleset();
    const bulbasaur = dataManager.getSpecies(SPECIES.bulbasaur);
    expect(bulbasaur.baseExp).toBe(64);

    const notTradedResult = ruleset.calculateExpGain({
      defeatedSpecies: bulbasaur,
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: false,
    });
    const tradedResult = ruleset.calculateExpGain({
      defeatedSpecies: bulbasaur,
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: true,
      isInternationalTrade: false,
    });

    expect(notTradedResult).toBe(274);
    expect(tradedResult).toBe(411);
  });

  it("given a traded international Pokemon in Gen 4, when calculateExpGain with isTradedPokemon=true and isInternationalTrade=true, then returns 1.7x boosted EXP", () => {
    // Source: pret/pokeplatinum src/battle/battle_script.c lines 9981-9982
    //   BattleSystem_PokemonIsOT == FALSE, MON_DATA_LANGUAGE != gGameLanguage → totalExp * 170 / 100
    // b=64 (Bulbasaur), L_d=30, s=1, t=1.0 → base=274; floor(274 * 1.7) = floor(465.8) = 465
    const ruleset = makeRuleset();
    const bulbasaur = dataManager.getSpecies(SPECIES.bulbasaur);

    const result = ruleset.calculateExpGain({
      defeatedSpecies: bulbasaur,
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: true,
      isInternationalTrade: true,
    });

    expect(result).toBe(465);
  });
});

// ---------------------------------------------------------------------------
// Issue #427 — Tangled Feet evasion branch coverage
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Tangled Feet (issue #427)", () => {
  it("given defender has Tangled Feet and is confused, when checking hit with 100% accuracy move, then some rolls miss", () => {
    // Source: Showdown data/abilities.ts — Tangled Feet: onModifyAccuracy returns accuracy * 0.5
    //   when the holder is confused (halves the attacker's effective accuracy)
    // Derivation: base calc = 100; Tangled Feet: floor(100 * 0.5) = 50
    //   With calc=50, rolls > 50 miss. Seeded rng will show misses with confused + Tangled Feet.
    const ruleset = makeRuleset();

    let tangledFeetConfusedMisses = 0;
    let noAbilityMisses = 0;
    const trials = 200;

    for (let seed = 1; seed <= trials; seed++) {
      // Defender has Tangled Feet + confusion volatile
      const confusedVolatiles = new Map<string, unknown>([
        [CORE_VOLATILE_IDS.confusion, { turnsLeft: 3 }],
      ]);
      const ctxTangled = makeAccuracyCtx({
        moveAccuracy: 100,
        defenderAbility: ABILITIES.tangledFeet,
        defenderVolatiles: confusedVolatiles,
        seed,
      });

      // Defender has no ability, no confusion
      const ctxNormal = makeAccuracyCtx({ moveAccuracy: 100, seed });

      if (!ruleset.doesMoveHit(ctxTangled)) tangledFeetConfusedMisses++;
      if (!ruleset.doesMoveHit(ctxNormal)) noAbilityMisses++;
    }

    // A 100% accuracy move never misses without Tangled Feet
    expect(noAbilityMisses).toBe(0);
    // Tangled Feet + confusion halves accuracy to 50%, so ~50% miss rate expected
    expect(tangledFeetConfusedMisses).toBeGreaterThan(0);
  });

  it("given defender has Tangled Feet but is NOT confused, when checking hit, then accuracy is not reduced", () => {
    // Source: Showdown data/abilities.ts — Tangled Feet only activates when holder is confused
    // Without confusion, Tangled Feet has no effect on accuracy
    const ruleset = makeRuleset();

    let misses = 0;
    for (let seed = 1; seed <= 200; seed++) {
      // Tangled Feet but NOT confused — no volatiles
      const ctx = makeAccuracyCtx({
        moveAccuracy: 100,
        defenderAbility: ABILITIES.tangledFeet,
        seed,
      });
      if (!ruleset.doesMoveHit(ctx)) misses++;
    }

    // 100% accuracy, no confusion — Tangled Feet inactive, should never miss
    expect(misses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Issue #428 — Natural Cure on-switch-out coverage
// ---------------------------------------------------------------------------

describe("Gen4Ruleset onSwitchOut — Natural Cure (issue #428)", () => {
  it("given Pokemon with Natural Cure and burn status, when switched out, then status is cleared", () => {
    // Source: Bulbapedia — Natural Cure: "All status conditions heal when the Pokemon switches out."
    // Source: Showdown data/abilities.ts — Natural Cure onSwitchOut: pokemon.status = null
    const ruleset = makeRuleset();
    const pokemon = makeActivePokemon({
      ability: ABILITIES.naturalCure,
      status: STATUSES.burn,
    });
    expect(pokemon.pokemon.status).toBe(STATUSES.burn);

    ruleset.onSwitchOut(pokemon, makeStubState());

    expect(pokemon.pokemon.status).toBeNull();
  });

  it("given Pokemon with Natural Cure and paralysis, when switched out, then paralysis is cleared", () => {
    // Source: Bulbapedia — Natural Cure cures ALL primary status conditions on switch-out
    // Derivation: same mechanic applies to paralysis, poison, sleep, freeze
    const ruleset = makeRuleset();
    const pokemon = makeActivePokemon({
      ability: ABILITIES.naturalCure,
      status: STATUSES.paralysis,
    });
    expect(pokemon.pokemon.status).toBe(STATUSES.paralysis);

    ruleset.onSwitchOut(pokemon, makeStubState());

    expect(pokemon.pokemon.status).toBeNull();
  });

  it("given Pokemon WITHOUT Natural Cure and a burn status, when switched out, then status is preserved", () => {
    // Source: Showdown — only Natural Cure triggers on switch-out for status cure
    // Other abilities do not clear status on switch-out
    const ruleset = makeRuleset();
    const pokemon = makeActivePokemon({ ability: ABILITIES.blaze, status: STATUSES.burn });
    expect(pokemon.pokemon.status).toBe(STATUSES.burn);

    ruleset.onSwitchOut(pokemon, makeStubState());

    expect(pokemon.pokemon.status).toBe(STATUSES.burn);
  });

  it("given Pokemon with Natural Cure and no status condition, when switched out, then status remains null", () => {
    // Source: Showdown — Natural Cure does nothing if already healthy
    const ruleset = makeRuleset();
    const pokemon = makeActivePokemon({ ability: ABILITIES.naturalCure });
    expect(pokemon.pokemon.status).toBeNull();

    ruleset.onSwitchOut(pokemon, makeStubState());

    expect(pokemon.pokemon.status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Issue #432 — Gen4Abilities default switch branch coverage
// ---------------------------------------------------------------------------

describe("applyGen4Ability — default branches coverage (issue #432)", () => {
  it("given an unrecognized trigger type, when applyGen4Ability is called, then returns activated:false", () => {
    // Exercises Gen4Abilities.ts default branch at line 91 (main switch)
    // An unrecognized trigger falls through to the top-level default case
    const ctx = makeAbilityContext({ ability: ABILITIES.speedBoost });
    // Cast to bypass TypeScript type-checking to exercise the runtime default branch
    const result = applyGen4Ability(
      "unknown-trigger" as Parameters<typeof applyGen4Ability>[0],
      ctx,
    );

    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given an unrecognized ability on 'on-turn-end', when applyGen4Ability is called, then returns activated:false", () => {
    // Exercises Gen4Abilities.ts default branch at line 601 (handleTurnEnd switch)
    // An ability not handled by on-turn-end falls to default
    const ctx = makeAbilityContext({ ability: "unknown-ability-xyz" });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given an unrecognized ability on 'on-contact', when applyGen4Ability is called, then returns activated:false", () => {
    // Exercises Gen4Abilities.ts default branch at line 770 (handleOnContact switch)
    // An ability not handled by on-contact falls to default
    const ctx = makeAbilityContext({ ability: "unknown-ability-xyz" });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given an unrecognized ability on 'passive-immunity', when applyGen4Ability is called, then returns activated:false", () => {
    // Exercises Gen4Abilities.ts default branch at line 892 (handlePassiveImmunity switch)
    // An ability not handled by passive-immunity falls to default
    const ctx = makeAbilityContext({
      ability: "unknown-ability-xyz",
      move: dataManager.getMove(MOVES.flamethrower),
    });
    const result = applyGen4Ability("passive-immunity", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given an unrecognized ability on 'on-switch-in', when applyGen4Ability is called, then returns activated:false", () => {
    // Exercises Gen4Abilities.ts default branch at line 434 (handleSwitchIn switch)
    // An ability not recognized on switch-in falls to default
    const ctx = makeAbilityContext({ ability: "unknown-ability-xyz" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Issue #443 — Electric type NOT immune to paralysis in Gen 4
// ---------------------------------------------------------------------------

describe("Gen4 canInflictGen4Status — Electric type paralysis (issue #443)", () => {
  it("given an Electric-type Pokemon in Gen 4, when checking if paralysis can be inflicted, then returns true", () => {
    // Source: Showdown Gen 4 mod — Electric paralysis immunity was introduced in Gen 6
    // Source: Gen4MoveEffects.ts GEN4_STATUS_IMMUNITIES — no entry for paralysis
    // In Gen 4, Electric types ARE susceptible to paralysis (unlike Gen 6+)
    const electricPokemon = makeActivePokemon({ types: [TYPES.electric] });

    const canParalyze = canInflictGen4Status(STATUSES.paralysis, electricPokemon);

    expect(canParalyze).toBe(true);
  });

  it("given a dual Electric/Flying-type Pokemon in Gen 4, when checking if paralysis can be inflicted, then returns true", () => {
    // Source: Showdown Gen 4 mod — no type-based paralysis immunity in Gen 4
    // Derivation: GEN4_STATUS_IMMUNITIES has no entry for 'paralysis' key
    const electricFlyingPokemon = makeActivePokemon({ types: [TYPES.electric, TYPES.flying] });

    const canParalyze = canInflictGen4Status(STATUSES.paralysis, electricFlyingPokemon);

    expect(canParalyze).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue #446 — No Guard accuracy bypass
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — No Guard (issue #446)", () => {
  it("given attacker has No Guard and move has 50% accuracy, when checking hit, then always hits", () => {
    // Source: Bulbapedia — No Guard: "Ensures that all moves used by or against the Pokemon land."
    // Source: pret/pokeplatinum src/battle_util.c — ABILITY_NO_GUARD check before accuracy roll
    // Source: Showdown Gen 4 — No Guard bypasses the accuracy check entirely
    // With 50% accuracy normally ~50% misses, but No Guard makes it 100% hit rate
    const ruleset = makeRuleset();

    let misses = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const ctx = makeAccuracyCtx({
        moveAccuracy: 50,
        attackerAbility: ABILITIES.noGuard,
        seed,
      });
      if (!ruleset.doesMoveHit(ctx)) misses++;
    }

    // No Guard: 0 misses regardless of seed
    expect(misses).toBe(0);
  });

  it("given defender has No Guard and move has 50% accuracy, when checking hit, then always hits", () => {
    // Source: Bulbapedia — No Guard also prevents the holder from being missed
    // Source: Showdown Gen 4 — No Guard on defender: attacker also bypasses accuracy check
    const ruleset = makeRuleset();

    let misses = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const ctx = makeAccuracyCtx({
        moveAccuracy: 50,
        defenderAbility: ABILITIES.noGuard,
        seed,
      });
      if (!ruleset.doesMoveHit(ctx)) misses++;
    }

    // No Guard on defender: attacker also never misses
    expect(misses).toBe(0);
  });

  it("given neither side has No Guard and move has 50% accuracy, when checking hit, then misses occur", () => {
    // Control case: without No Guard a 50% accuracy move follows the seeded RNG path.
    // SeededRandom over seeds 1..200 currently produces 101 misses for a 50%-accuracy move.
    const ruleset = makeRuleset();

    let misses = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const ctx = makeAccuracyCtx({ moveAccuracy: 50, seed });
      if (!ruleset.doesMoveHit(ctx)) misses++;
    }

    // Source: deterministic SeededRandom probe over seeds 1..200 with 50% move accuracy yields 101 misses.
    expect(misses).toBe(101);
  });
});

// ---------------------------------------------------------------------------
// Issue #455 — Download: SpAtk raised when foe SpDef < foe Def
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Download SpAtk scenario (issue #455)", () => {
  it("given Download and foe's SpDef < foe's Def, when Pokemon switches in, then raises SpAtk by 1", () => {
    // Source: Bulbapedia — Download: raises SpAtk if foe SpDef < Def (i.e., Def >= SpDef)
    // Source: Gen4Abilities.ts line 223 — raisesAtk = foeStats.defense < foeStats.spDefense
    // When Def >= SpDef (here Def=120, SpDef=80), raisesAtk is false → raises SpAtk
    // Derivation: foe has Def=120, SpDef=80 → 120 >= 80 → +1 SpAtk (foe's SpDef is the weaker stat)
    const opponent = makeActivePokemon({ calculatedDefense: 120, calculatedSpDefense: 80 });
    const ctx = makeAbilityContext({ ability: ABILITIES.download, opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Download and foe's SpDef > foe's Def, when Pokemon switches in, then raises Atk by 1", () => {
    // Source: Gen4Abilities.ts line 223 — raisesAtk = foeStats.defense < foeStats.spDefense
    // Derivation: foe has Def=80, SpDef=120 → 80 < 120 → +1 Atk (foe's Def is the weaker stat)
    const opponent = makeActivePokemon({ calculatedDefense: 80, calculatedSpDefense: 120 });
    const ctx = makeAbilityContext({ ability: ABILITIES.download, opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });
});
