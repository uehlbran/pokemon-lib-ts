import type {
  AbilityContext,
  BattleSide,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  DataManager,
  Gender,
  MoveData,
  PokemonInstance,
  PokemonType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { applyGen4HeldItem } from "../src/Gen4Items";
import { canInflictGen4Status, executeGen4MoveEffect } from "../src/Gen4MoveEffects";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Gen 4 Wave 4 — Status/Utility Ability Tests
 *
 * Tests for: Leaf Guard, Storm Drain, Klutz, Suction Cups, Stench,
 *            Anticipation (fix), Forewarn (fix)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: Bulbapedia — individual ability mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
  attack?: number;
  spAttack?: number;
  speed?: number;
  gender?: Gender;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number; ppUps: number }>;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: overrides.moves ?? [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: (overrides.gender ?? "male") as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: overrides.attack ?? 100,
      defense: overrides.defense ?? 100,
      spAttack: overrides.spAttack ?? 100,
      spDefense: overrides.spDefense ?? 100,
      speed: overrides.speed ?? 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  defense?: number;
  spDefense?: number;
  attack?: number;
  spAttack?: number;
  speed?: number;
  gender?: Gender;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number; ppUps: number }>;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      defense: overrides.defense,
      spDefense: overrides.spDefense,
      attack: overrides.attack,
      spAttack: overrides.spAttack,
      speed: overrides.speed,
      gender: overrides.gender,
      moves: overrides.moves,
    }),
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
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
  };
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

function makeBattleState(weather?: {
  type: "sand" | "hail" | "rain" | "sun";
  turnsLeft: number;
  source: string;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: weather ?? null,
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

function makeMove(type: PokemonType, overrides?: Partial<MoveData>): MoveData {
  return {
    id: overrides?.id ?? "test-move",
    displayName: overrides?.displayName ?? "Test Move",
    type,
    category: overrides?.category ?? "physical",
    power: overrides?.power ?? 80,
    accuracy: overrides?.accuracy ?? 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "single",
    generation: 4,
    flags: overrides?.flags ?? { contact: true },
    effectChance: null,
    secondaryEffects: [],
    effect: overrides?.effect ?? null,
    ...overrides,
  } as unknown as MoveData;
}

function makeAbilityContext(opts: {
  ability: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  weather?: { type: "sand" | "hail" | "rain" | "sun"; turnsLeft: number; source: string };
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  rngNextValues?: number[];
  rngChance?: boolean;
  move?: MoveData;
}): AbilityContext {
  const state = makeBattleState(opts.weather);
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
  });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: "on-switch-in",
    move: opts.move,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
      int: () => 1,
      chance: (_p: number) => opts.rngChance ?? false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

/**
 * Minimal DataManager mock that only supports getMove().
 * Used for Anticipation/Forewarn tests.
 */
function makeMockDataManager(moves: Record<string, MoveData>): DataManager {
  return {
    getMove: (id: string) => {
      const move = moves[id];
      if (!move) throw new Error(`Move "${id}" not found`);
      return move;
    },
  } as unknown as DataManager;
}

// ---------------------------------------------------------------------------
// Leaf Guard
// ---------------------------------------------------------------------------

describe("Leaf Guard — prevent all status in sun", () => {
  it("given Leaf Guard in sun, when status infliction attempted, then status blocked", () => {
    // Source: Bulbapedia — Leaf Guard: "Prevents status conditions in sunny weather"
    // Source: Showdown data/abilities.ts — Leaf Guard onSetStatus
    const target = makeActivePokemon({ ability: "leaf-guard", types: ["grass"] });
    const state = makeBattleState({ type: "sun", turnsLeft: -1, source: "drought" });

    const result = canInflictGen4Status("paralysis", target, state);

    expect(result).toBe(false);
  });

  it("given Leaf Guard NOT in sun, when status infliction attempted, then status applied normally", () => {
    // Source: Bulbapedia — Leaf Guard only activates in harsh sunlight
    const target = makeActivePokemon({ ability: "leaf-guard", types: ["grass"] });
    const state = makeBattleState({ type: "rain", turnsLeft: 5, source: "drizzle" });

    const result = canInflictGen4Status("paralysis", target, state);

    expect(result).toBe(true);
  });

  it("given no Leaf Guard in sun, when status infliction attempted, then status applied normally", () => {
    // Triangulation: confirm Leaf Guard is ability-specific, not weather-only
    const target = makeActivePokemon({ ability: "overgrow", types: ["grass"] });
    const state = makeBattleState({ type: "sun", turnsLeft: -1, source: "drought" });

    const result = canInflictGen4Status("paralysis", target, state);

    expect(result).toBe(true);
  });

  it("given Leaf Guard in sun, when burn attempted, then burn also blocked", () => {
    // Source: Bulbapedia — Leaf Guard blocks ALL primary status conditions in sun
    const target = makeActivePokemon({ ability: "leaf-guard", types: ["grass"] });
    const state = makeBattleState({ type: "sun", turnsLeft: -1, source: "drought" });

    const result = canInflictGen4Status("burn", target, state);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Storm Drain
// ---------------------------------------------------------------------------

describe("Storm Drain — Gen 4: redirect-only in doubles, no singles immunity", () => {
  it("given Storm Drain, when hit by Water move in singles, then damage is NOT blocked (no immunity in Gen 4)", () => {
    // Source: Bulbapedia — Storm Drain (Generation IV): "Draws all single-target Water-type
    //   moves to this Pokemon. Has no effect in single battles."
    // Source: Showdown Gen 4 mod — Storm Drain is doubles-redirect only; no Water immunity
    //
    // Bug #350/#351: Previous behavior granted Water immunity + SpAtk boost (Gen 5+).
    // Gen 4 Storm Drain does nothing in singles — Water moves deal normal damage.
    const attacker = makeActivePokemon({ types: ["water"], spAttack: 100 });
    const defender = makeActivePokemon({ ability: "storm-drain", types: ["ground"] });
    const move = makeMove("water", { power: 90, category: "special" });
    const state = makeBattleState();

    const damageResult = calculateGen4Damage(
      {
        attacker,
        defender,
        move,
        state,
        rng: { next: () => 0.5, int: () => 100, chance: () => false } as any,
        isCrit: false,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // In Gen 4 singles, Storm Drain does NOT grant Water immunity — Water deals normal damage.
    // Derivation: level=50, spAtk=100, spDef=100, power=90, Water vs Ground = 2x (super effective)
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDamage = floor(floor((22*90*100)/100)/50) = floor(1980/50) = 39
    //   +2 = 41; random=100 → floor(41*1.0)=41; STAB (water/water) 1.5x → floor(61.5)=61
    //   effectiveness 2.0 → floor(61*2) = 122; no items → 122
    // Source: Bulbapedia — Storm Drain (Gen 4): "Has no effect in single battles."
    // Source: Gen 4 type chart — Water is super effective against Ground (2x)
    expect(damageResult.damage).toBe(122);
    expect(damageResult.effectiveness).toBe(2);
  });

  it("given Storm Drain, when passive-immunity is checked for Water move in singles, then ability does not activate", () => {
    // Source: Bulbapedia — Storm Drain (Gen 4): no effect in singles
    // Triangulation: passive-immunity must return not-activated for Water moves
    const ctx = makeAbilityContext({
      ability: "storm-drain",
      types: ["ground"],
      move: makeMove("water"),
    });
    const result = applyGen4Ability("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Storm Drain, when hit by non-Water move, then ability does not activate", () => {
    // Triangulation: Storm Drain also does nothing against non-Water moves
    const ctx = makeAbilityContext({
      ability: "storm-drain",
      types: ["ground"],
      move: makeMove("fire"),
    });
    const result = applyGen4Ability("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Klutz
// ---------------------------------------------------------------------------

describe("Klutz — held item has no effect", () => {
  it("given Klutz holding Choice Scarf, when getEffectiveSpeed called (via damage calc item check), then Choice Band does not boost attack", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    // Source: Showdown data/abilities.ts — Klutz gates item modifiers
    // Test via damage calc: Choice Band should NOT boost attack when holder has Klutz
    const attacker = makeActivePokemon({
      ability: "klutz",
      types: ["normal"],
      heldItem: "choice-band",
      attack: 100,
    });
    const attackerNoKlutz = makeActivePokemon({
      ability: "intimidate",
      types: ["normal"],
      heldItem: "choice-band",
      attack: 100,
    });
    const defender = makeActivePokemon({ types: ["normal"], defense: 100 });
    const move = makeMove("normal", { power: 80, category: "physical" });
    const state = makeBattleState();
    const rng = {
      next: () => 0.5,
      int: (_min: number, _max: number) => 100,
      chance: () => false,
    } as any;

    const resultKlutz = calculateGen4Damage(
      { attacker, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const resultNormal = calculateGen4Damage(
      { attacker: attackerNoKlutz, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Klutz holder should deal LESS damage (no Choice Band 1.5x boost)
    expect(resultKlutz.damage).toBeLessThan(resultNormal.damage);
  });

  it("given Klutz holding Sitrus Berry, when item trigger fires, then Sitrus Berry does NOT heal", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    const pokemon = makeActivePokemon({
      ability: "klutz",
      heldItem: "sitrus-berry",
      currentHp: 50,
      maxHp: 200,
    });
    const state = makeBattleState();

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state,
      rng: { next: () => 0, int: () => 0, chance: () => false } as any,
    });

    expect(result.activated).toBe(false);
  });

  it("given no Klutz holding Sitrus Berry, when HP drops to 50% at end of turn, then Sitrus Berry DOES heal", () => {
    // Triangulation: without Klutz, Sitrus Berry activates normally
    const pokemon = makeActivePokemon({
      ability: "overgrow",
      heldItem: "sitrus-berry",
      currentHp: 50,
      maxHp: 200,
    });
    const state = makeBattleState();

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state,
      rng: { next: () => 0, int: () => 0, chance: () => false } as any,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "heal", value: 50 })]),
    );
  });

  it("given Klutz holding Life Orb, when damage calc runs, then Life Orb 1.3x boost is NOT applied", () => {
    // Source: Showdown data/abilities.ts — Klutz gates all item damage modifiers
    const attacker = makeActivePokemon({
      ability: "klutz",
      types: ["normal"],
      heldItem: "life-orb",
      attack: 100,
    });
    const attackerNoKlutz = makeActivePokemon({
      ability: "intimidate",
      types: ["normal"],
      heldItem: "life-orb",
      attack: 100,
    });
    const defender = makeActivePokemon({ types: ["normal"], defense: 100 });
    const move = makeMove("normal", { power: 80, category: "physical" });
    const state = makeBattleState();
    const rng = {
      next: () => 0.5,
      int: (_min: number, _max: number) => 100,
      chance: () => false,
    } as any;

    const resultKlutz = calculateGen4Damage(
      { attacker, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const resultNormal = calculateGen4Damage(
      { attacker: attackerNoKlutz, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Klutz holder should deal LESS damage (no Life Orb 1.3x boost)
    expect(resultKlutz.damage).toBeLessThan(resultNormal.damage);
  });
});

// ---------------------------------------------------------------------------
// Suction Cups
// ---------------------------------------------------------------------------

describe("Suction Cups — prevent forced switching", () => {
  it("given Suction Cups defender, when Whirlwind is used, then forced switch is prevented", () => {
    // Source: Bulbapedia — Suction Cups: "Prevents the Pokemon from being forced to switch out"
    // Source: Showdown data/abilities.ts — Suction Cups onDragOut
    const attacker = makeActivePokemon({ types: ["normal"] });
    const defender = makeActivePokemon({ ability: "suction-cups", types: ["rock"] });
    const move = makeMove("normal", {
      id: "whirlwind",
      displayName: "Whirlwind",
      power: null,
      category: "status",
      effect: null,
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    // Switch should NOT happen
    expect(result.switchOut).toBe(false);
    // Message should mention Suction Cups
    expect(result.messages.some((m) => m.includes("Suction Cups"))).toBe(true);
  });

  it("given no Suction Cups, when Whirlwind is used, then forced switch succeeds", () => {
    // Triangulation: without Suction Cups, Whirlwind forces switch
    const attacker = makeActivePokemon({ types: ["normal"] });
    const defender = makeActivePokemon({ ability: "sturdy", types: ["rock"] });
    const move = makeMove("normal", {
      id: "whirlwind",
      displayName: "Whirlwind",
      power: null,
      category: "status",
      effect: null,
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    // Switch should happen
    expect(result.switchOut).toBe(true);
  });

  it("given Suction Cups defender, when Roar is used, then forced switch is also prevented", () => {
    // Source: Showdown — Suction Cups blocks both Whirlwind and Roar
    const attacker = makeActivePokemon({ types: ["normal"] });
    const defender = makeActivePokemon({ ability: "suction-cups", types: ["rock"] });
    const move = makeMove("normal", {
      id: "roar",
      displayName: "Roar",
      power: null,
      category: "status",
      effect: null,
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    expect(result.switchOut).toBe(false);
    expect(result.messages.some((m) => m.includes("Suction Cups"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stench
// ---------------------------------------------------------------------------

describe("Stench — Gen 4: no battle effect (flinch is Gen 5+)", () => {
  it("given Stench and RNG < 0.1 (guaranteed flinch check), when on-after-move-hit triggers, then flinch is NOT applied (Stench has no Gen 4 battle effect)", () => {
    // Source: Bulbapedia — Stench (Generation IV): "Has no effect in battle."
    //   The 10% flinch chance was introduced in Generation V.
    // Source: Showdown — Stench onModifyMove flinch only in Gen 5+ scripts
    //
    // Bug #384: Previous code gave Stench a 10% flinch chance (Gen 5+ behavior).
    // In Gen 4, Stench only reduces wild encounter rate in the overworld.
    const ctx = makeAbilityContext({
      ability: "stench",
      rngNextValues: [0.05], // < 0.1 threshold (would trigger Gen 5+ flinch if bug present)
    });

    const result = applyGen4Ability("on-after-move-hit", ctx);

    expect(result.activated).toBe(false);
    const flinchEffect = result.effects.find(
      (e) => e.effectType === "volatile-inflict" && "volatile" in e && e.volatile === "flinch",
    );
    expect(flinchEffect).toBeUndefined();
  });

  it("given Stench with any RNG value, when on-after-move-hit triggers, then no flinch is applied (battle-inert in Gen 4)", () => {
    // Triangulation: Stench is always no-op in Gen 4, regardless of RNG
    const ctx = makeAbilityContext({
      ability: "stench",
      rngNextValues: [0.5],
    });

    const result = applyGen4Ability("on-after-move-hit", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Anticipation
// ---------------------------------------------------------------------------

describe("Anticipation — scan opponent moveset for SE/OHKO moves", () => {
  it("given foe has a SE move, when Pokemon with Anticipation switches in, then shudder message appears", () => {
    // Source: Bulbapedia — Anticipation: warns if foe has SE or OHKO move
    // Source: Showdown data/abilities.ts — Anticipation onStart
    const opponent = makeActivePokemon({
      types: ["fire"],
      moves: [{ moveId: "flamethrower", currentPP: 15, maxPP: 15, ppUps: 0 }],
    });

    const dataManager = makeMockDataManager({
      flamethrower: makeMove("fire", {
        id: "flamethrower",
        displayName: "Flamethrower",
        power: 95,
        category: "special",
      }),
    });

    const ctx = makeAbilityContext({
      ability: "anticipation",
      types: ["grass"], // Fire is SE against Grass
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("shudder");
  });

  it("given foe has only neutral/resisted moves, when Pokemon with Anticipation switches in, then no activation", () => {
    // Triangulation: Anticipation should NOT trigger for neutral/resisted moves
    const opponent = makeActivePokemon({
      types: ["normal"],
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
    });

    const dataManager = makeMockDataManager({
      tackle: makeMove("normal", {
        id: "tackle",
        displayName: "Tackle",
        power: 40,
        category: "physical",
      }),
    });

    const ctx = makeAbilityContext({
      ability: "anticipation",
      types: ["normal"], // Normal is neutral against Normal
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(false);
  });

  it("given foe has an OHKO move, when Pokemon with Anticipation switches in, then shudder message appears", () => {
    // Source: Bulbapedia — Anticipation triggers for OHKO moves regardless of type
    const opponent = makeActivePokemon({
      types: ["ground"],
      moves: [{ moveId: "fissure", currentPP: 5, maxPP: 5, ppUps: 0 }],
    });

    const dataManager = makeMockDataManager({
      fissure: makeMove("ground", {
        id: "fissure",
        displayName: "Fissure",
        power: null,
        category: "physical",
      }),
    });

    const ctx = makeAbilityContext({
      ability: "anticipation",
      types: ["steel"], // Ground is SE against Steel, but OHKO should trigger regardless
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("shudder");
  });
});

// ---------------------------------------------------------------------------
// Forewarn
// ---------------------------------------------------------------------------

describe("Forewarn — identify strongest move by base power", () => {
  it("given foe has moves of varying power, when Pokemon with Forewarn switches in, then strongest move is revealed", () => {
    // Source: Bulbapedia — Forewarn: reveals opponent's highest base power move
    // Source: Showdown data/abilities.ts — Forewarn onStart
    const opponent = makeActivePokemon({
      types: ["fire"],
      moves: [
        { moveId: "ember", currentPP: 25, maxPP: 25, ppUps: 0 },
        { moveId: "fire-blast", currentPP: 5, maxPP: 5, ppUps: 0 },
      ],
    });

    const dataManager = makeMockDataManager({
      ember: makeMove("fire", {
        id: "ember",
        displayName: "Ember",
        power: 40,
        category: "special",
      }),
      "fire-blast": makeMove("fire", {
        id: "fire-blast",
        displayName: "Fire Blast",
        power: 110,
        category: "special",
      }),
    });

    const ctx = makeAbilityContext({
      ability: "forewarn",
      types: ["grass"],
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(true);
    // Should mention the strongest move (Fire Blast, 110 BP)
    expect(result.messages[0]).toContain("Fire Blast");
  });

  it("given foe has an OHKO move, when Pokemon with Forewarn switches in, then OHKO move treated as 160 BP (revealed as strongest)", () => {
    // Source: Bulbapedia — Forewarn counts OHKO moves as BP 160
    const opponent = makeActivePokemon({
      types: ["ground"],
      moves: [
        { moveId: "earthquake", currentPP: 10, maxPP: 10, ppUps: 0 },
        { moveId: "fissure", currentPP: 5, maxPP: 5, ppUps: 0 },
      ],
    });

    const dataManager = makeMockDataManager({
      earthquake: makeMove("ground", {
        id: "earthquake",
        displayName: "Earthquake",
        power: 100,
        category: "physical",
      }),
      fissure: makeMove("ground", {
        id: "fissure",
        displayName: "Fissure",
        power: null, // OHKO moves have null power in data but Forewarn treats them as 160
        category: "physical",
      }),
    });

    const ctx = makeAbilityContext({
      ability: "forewarn",
      types: ["steel"],
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(true);
    // Should mention Fissure (treated as 160 BP, > Earthquake's 100 BP)
    expect(result.messages[0]).toContain("Fissure");
  });

  it("given foe has no moves with power, when Pokemon with Forewarn switches in, then no activation", () => {
    // Edge case: foe with only status moves (no base power)
    const opponent = makeActivePokemon({
      types: ["psychic"],
      moves: [{ moveId: "thunder-wave", currentPP: 20, maxPP: 20, ppUps: 0 }],
    });

    const dataManager = makeMockDataManager({
      "thunder-wave": makeMove("electric", {
        id: "thunder-wave",
        displayName: "Thunder Wave",
        power: null,
        category: "status",
      }),
    });

    const ctx = makeAbilityContext({
      ability: "forewarn",
      types: ["normal"],
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(false);
  });
});
