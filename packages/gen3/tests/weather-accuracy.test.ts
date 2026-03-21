import type { AccuracyContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { Gen3Ruleset } from "../src/Gen3Ruleset";

/**
 * Gen 3 Weather-Based Accuracy Tests
 *
 * Tests for:
 *   - Thunder: 100% accuracy in Rain, 50% accuracy in Sun
 *   - Blizzard: 100% accuracy in Hail
 *
 * Source: pret/pokeemerald src/battle_script_commands.c — Cmd_accuracycheck
 * Source: Showdown data/moves.ts — Thunder/Blizzard onModifyMove
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number) {
  return {
    next: () => 0.5,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_percent: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** Create a minimal ActivePokemon mock. */
function createMockPokemon(opts?: { types?: PokemonType[]; ability?: string }): ActivePokemon {
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
    currentHp: 200,
    moves: [],
    ability: opts?.ability ?? "",
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
    types: opts?.types ?? ["normal"],
    ability: opts?.ability ?? "",
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

function createMockState(
  weather?: { type: string; turnsLeft: number; source: string } | null,
): BattleState {
  return {
    weather: weather ?? null,
  } as BattleState;
}

function createAccuracyContext(opts: {
  move: MoveData;
  weather?: { type: string; turnsLeft: number; source: string } | null;
  rng: ReturnType<typeof createMockRng>;
  attackerAbility?: string;
  defenderAbility?: string;
}): AccuracyContext {
  return {
    attacker: createMockPokemon({ ability: opts.attackerAbility }),
    defender: createMockPokemon({ ability: opts.defenderAbility }),
    move: opts.move,
    state: createMockState(opts.weather),
    rng: opts.rng,
  } as AccuracyContext;
}

function createMove(opts: {
  id: string;
  type: PokemonType;
  accuracy: number | null;
  power: number;
}): MoveData {
  return {
    id: opts.id,
    displayName: opts.id,
    type: opts.type,
    category: "special",
    power: opts.power,
    accuracy: opts.accuracy,
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
    effect: null,
    description: "",
    generation: 3,
  } as MoveData;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

describe("Gen 3 Weather Accuracy — Thunder", () => {
  const thunder = createMove({
    id: "thunder",
    type: "electric",
    accuracy: 70,
    power: 110,
  });

  it("given rain weather, when Thunder's accuracy is checked, then it always hits regardless of RNG", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Thunder bypasses accuracy in rain
    // Source: Showdown data/moves.ts — Thunder: move.accuracy = true in raindance
    const weather = { type: "rain", turnsLeft: 3, source: "rain-dance" };

    // Even with a terrible RNG roll (100 out of 1-100), Thunder should hit
    const ctx = createAccuracyContext({ move: thunder, weather, rng: createMockRng(100) });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given rain weather, when Thunder's accuracy is checked with minimum RNG roll, then it still always hits", () => {
    // Source: pret/pokeemerald — Thunder in rain bypasses accuracy entirely
    const weather = { type: "rain", turnsLeft: 3, source: "rain-dance" };
    const ctx = createAccuracyContext({ move: thunder, weather, rng: createMockRng(1) });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given sun weather, when Thunder's accuracy is checked with roll = 50, then it hits (roll <= 50 from 50% accuracy)", () => {
    // Source: pret/pokeemerald — Thunder has 50% accuracy in sun
    // Source: Showdown data/moves.ts — Thunder: move.accuracy = 50 in sunnyday
    // Normal check: roll 1-100, hit if roll <= calc
    // With 50% accuracy at stage 0: calc = floor(1/1 * 50) = 50
    // roll = 50: 50 <= 50 → hit
    const weather = { type: "sun", turnsLeft: 3, source: "sunny-day" };
    const ctx = createAccuracyContext({ move: thunder, weather, rng: createMockRng(50) });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given sun weather, when Thunder's accuracy is checked with roll = 51, then it misses (roll > 50 from 50% accuracy)", () => {
    // Source: pret/pokeemerald — Thunder has 50% accuracy in sun
    // With 50% accuracy at stage 0: calc = 50
    // roll = 51: 51 <= 50 → false → miss
    const weather = { type: "sun", turnsLeft: 3, source: "sunny-day" };
    const ctx = createAccuracyContext({ move: thunder, weather, rng: createMockRng(51) });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given no weather, when Thunder's accuracy is checked, then normal 70% accuracy applies", () => {
    // Source: pret/pokeemerald — Thunder has normal 70% accuracy without weather
    // Roll = 70: 70 <= 70 → hit
    const ctx = createAccuracyContext({ move: thunder, weather: null, rng: createMockRng(70) });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);

    // Roll = 71: 71 <= 70 → miss
    const ctx2 = createAccuracyContext({ move: thunder, weather: null, rng: createMockRng(71) });
    expect(ruleset.doesMoveHit(ctx2)).toBe(false);
  });

  it("given hail weather, when Thunder's accuracy is checked, then normal 70% accuracy applies (hail has no effect on Thunder)", () => {
    // Source: pret/pokeemerald — Hail does not affect Thunder's accuracy
    const weather = { type: "hail", turnsLeft: 3, source: "hail" };
    const ctx = createAccuracyContext({ move: thunder, weather, rng: createMockRng(70) });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);

    const ctx2 = createAccuracyContext({ move: thunder, weather, rng: createMockRng(71) });
    expect(ruleset.doesMoveHit(ctx2)).toBe(false);
  });
});

describe("Gen 3 Weather Accuracy — Blizzard", () => {
  const blizzard = createMove({
    id: "blizzard",
    type: "ice",
    accuracy: 70,
    power: 110,
  });

  it("given hail weather, when Blizzard's accuracy is checked with roll <= 70, then it hits (Gen 3: hail does NOT make Blizzard always hit)", () => {
    // Gen 3 behavior: Blizzard has normal 70% accuracy in hail.
    // Auto-hit in hail was added in Gen 4.
    // Source: pret/pokeemerald — Blizzard has no special hail interaction
    // Source: Bulbapedia — "In Generation IV, [Blizzard] never misses in hail."
    const weather = { type: "hail", turnsLeft: 3, source: "hail" };
    const ctx = createAccuracyContext({ move: blizzard, weather, rng: createMockRng(70) });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given hail weather, when Blizzard's accuracy is checked with roll > 70, then it misses (Gen 3: normal accuracy in hail)", () => {
    // Gen 3 behavior: Blizzard does not bypass accuracy checks in hail.
    // Source: pret/pokeemerald — no special hail handling for Blizzard
    const weather = { type: "hail", turnsLeft: 3, source: "hail" };
    const ctx = createAccuracyContext({ move: blizzard, weather, rng: createMockRng(71) });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given rain weather, when Blizzard's accuracy is checked, then normal 70% accuracy applies", () => {
    // Source: pret/pokeemerald — Rain does not affect Blizzard's accuracy
    const weather = { type: "rain", turnsLeft: 3, source: "rain-dance" };
    const ctx = createAccuracyContext({ move: blizzard, weather, rng: createMockRng(70) });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);

    const ctx2 = createAccuracyContext({ move: blizzard, weather, rng: createMockRng(71) });
    expect(ruleset.doesMoveHit(ctx2)).toBe(false);
  });

  it("given no weather, when Blizzard's accuracy is checked, then normal 70% accuracy applies", () => {
    // Source: pret/pokeemerald — Blizzard has normal 70% accuracy without weather
    const ctx = createAccuracyContext({ move: blizzard, weather: null, rng: createMockRng(70) });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);

    const ctx2 = createAccuracyContext({ move: blizzard, weather: null, rng: createMockRng(71) });
    expect(ruleset.doesMoveHit(ctx2)).toBe(false);
  });
});
