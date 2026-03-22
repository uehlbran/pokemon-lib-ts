import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, VolatileStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  AURORA_VEIL_DEFAULT_TURNS,
  AURORA_VEIL_LIGHT_CLAY_TURNS,
  handleAuroraVeil,
} from "../src/Gen7MoveEffects";
import { Gen7Ruleset } from "../src/Gen7Ruleset";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const AURORA_VEIL_MOVE: MoveData = {
  id: "aurora-veil",
  displayName: "Aurora Veil",
  type: "ice",
  category: "status",
  power: null,
  accuracy: null,
  pp: 20,
  priority: 0,
  target: "user-field",
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
    protect: false,
    mirror: false,
    snatch: true,
    gravity: false,
    defrost: false,
    recharge: false,
    charge: false,
    bypassSubstitute: false,
  },
  effect: null,
  description: "Aurora Veil",
  generation: 7,
} as unknown as MoveData;

function makeActivePokemon(overrides: {
  maxHp?: number;
  types?: string[];
  ability?: string;
  nickname?: string;
  heldItem?: string | null;
  volatiles?: Map<string, { turnsLeft: number }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: maxHp,
      nickname: overrides.nickname ?? "TestMon",
      speciesId: 1,
      heldItem: overrides.heldItem ?? null,
      status: null,
      moves: [{ moveId: "aurora-veil", pp: 20, maxPp: 20 }],
    },
    ability: overrides.ability ?? "snow-warning",
    types: overrides.types ?? ["ice"],
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses:
      (overrides.volatiles as Map<VolatileStatus, { turnsLeft: number }>) ?? new Map(),
    turnsOnField: 0,
    consecutiveProtects: 0,
  } as unknown as ActivePokemon;
}

function makeSide(
  active: ActivePokemon,
  index: 0 | 1 = 0,
  screens: Array<{ type: string; turnsLeft: number }> = [],
): BattleSide {
  return {
    index,
    active: [active],
    hazards: [],
    screens,
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    team: [],
    trainer: null,
  } as unknown as BattleSide;
}

function makeState(
  weatherType: string | null,
  attacker: ActivePokemon,
  defender: ActivePokemon,
  attackerScreens: Array<{ type: string; turnsLeft: number }> = [],
): BattleState {
  return {
    weather: weatherType ? { type: weatherType, turnsLeft: 5, source: "test" } : null,
    sides: [makeSide(attacker, 0, attackerScreens), makeSide(defender, 1)],
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    terrain: null,
  } as unknown as BattleState;
}

function makeMoveEffectContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  state: BattleState,
): MoveEffectContext {
  return {
    attacker,
    defender,
    move: AURORA_VEIL_MOVE,
    damage: 0,
    state,
    rng: new SeededRandom(42),
  } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Aurora Veil Tests
// ---------------------------------------------------------------------------

describe("Gen7 Aurora Veil", () => {
  it("given Hail is not active, when Aurora Veil used, then it fails", () => {
    // Source: Showdown data/moves.ts -- onTry: source.effectiveWeather() === 'hail'
    // Source: Bulbapedia -- "This move can only be used during hail"
    const attacker = makeActivePokemon({ nickname: "Alolan Ninetales" });
    const defender = makeActivePokemon({ types: ["normal"], nickname: "Snorlax" });
    const state = makeState(null, attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given sun is active, when Aurora Veil used, then it fails", () => {
    // Source: Showdown -- onTry only returns true for hail
    const attacker = makeActivePokemon({ nickname: "Ninetales" });
    const defender = makeActivePokemon({ types: ["normal"] });
    const state = makeState("sun", attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given rain is active, when Aurora Veil used, then it fails", () => {
    // Source: Showdown -- onTry only returns true for hail
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({});
    const state = makeState("rain", attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given sandstorm is active, when Aurora Veil used, then it fails", () => {
    // Source: Showdown -- onTry only returns true for hail
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({});
    const state = makeState("sand", attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given Hail is active, when Aurora Veil used, then sets screen on attacker's side for 5 turns", () => {
    // Source: Showdown data/moves.ts -- auroraveil: sideCondition, duration: 5
    // Source: Bulbapedia -- "Aurora Veil lasts for five turns"
    const attacker = makeActivePokemon({ nickname: "Alolan Ninetales" });
    const defender = makeActivePokemon({ types: ["normal"] });
    const state = makeState("hail", attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toEqual({
      screen: "aurora-veil",
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it("given Hail is active and attacker holds Light Clay, when Aurora Veil used, then lasts 8 turns", () => {
    // Source: Showdown data/items.ts -- lightclay: extends screen duration by 3 turns
    // Source: Bulbapedia -- "Lasts for 8 turns if the user is holding Light Clay"
    const attacker = makeActivePokemon({ nickname: "Alolan Ninetales", heldItem: "light-clay" });
    const defender = makeActivePokemon({ types: ["normal"] });
    const state = makeState("hail", attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toEqual({
      screen: "aurora-veil",
      turnsLeft: 8,
      side: "attacker",
    });
  });

  it("given Aurora Veil already active on attacker's side, when Aurora Veil used again, then fails", () => {
    // Source: Showdown -- sideCondition check: cannot stack
    const attacker = makeActivePokemon({ nickname: "Alolan Ninetales" });
    const defender = makeActivePokemon({ types: ["normal"] });
    const state = makeState("hail", attacker, defender, [{ type: "aurora-veil", turnsLeft: 3 }]);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given Aurora Veil succeeds, when message checked, then contains descriptive text", () => {
    // Source: Showdown -- aurora veil message
    const attacker = makeActivePokemon({ nickname: "Alolan Ninetales" });
    const defender = makeActivePokemon({ types: ["normal"] });
    const state = makeState("hail", attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = handleAuroraVeil(ctx);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("Aurora Veil");
    expect(result.messages[0]).toContain("Alolan Ninetales");
  });
});

// ---------------------------------------------------------------------------
// Aurora Veil Constants Tests
// ---------------------------------------------------------------------------

describe("Gen7 Aurora Veil constants", () => {
  it("given the aurora veil default turns constant, when checked, then equals 5", () => {
    // Source: Showdown data/moves.ts -- auroraveil: duration: 5
    expect(AURORA_VEIL_DEFAULT_TURNS).toBe(5);
  });

  it("given the Light Clay turns constant, when checked, then equals 8", () => {
    // Source: Showdown data/items.ts -- lightclay: extends screens by 3 turns (5+3=8)
    expect(AURORA_VEIL_LIGHT_CLAY_TURNS).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Integration: executeMoveEffect via Gen7Ruleset
// ---------------------------------------------------------------------------

describe("Gen7 Ruleset executeMoveEffect - Aurora Veil", () => {
  it("given Hail active, when Gen7Ruleset.executeMoveEffect called with aurora-veil, then returns screen set", () => {
    // Source: Showdown data/moves.ts -- auroraveil handler
    const ruleset = new Gen7Ruleset();
    const attacker = makeActivePokemon({ nickname: "Alolan Ninetales" });
    const defender = makeActivePokemon({ types: ["normal"] });
    const state = makeState("hail", attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = ruleset.executeMoveEffect(ctx);
    expect(result.screenSet).toEqual({
      screen: "aurora-veil",
      turnsLeft: 5,
      side: "attacker",
    });
  });

  it("given no Hail, when Gen7Ruleset.executeMoveEffect called with aurora-veil, then fails", () => {
    // Source: Showdown -- onTry: effectiveWeather() === 'hail'
    const ruleset = new Gen7Ruleset();
    const attacker = makeActivePokemon({ nickname: "Alolan Ninetales" });
    const defender = makeActivePokemon({ types: ["normal"] });
    const state = makeState(null, attacker, defender);
    const ctx = makeMoveEffectContext(attacker, defender, state);

    const result = ruleset.executeMoveEffect(ctx);
    expect(result.screenSet).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});
