import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { Gender, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen4Ability } from "../src/Gen4Abilities";

// ---------------------------------------------------------------------------
// RNG helpers
// ---------------------------------------------------------------------------

/** RNG that always passes the 30% roll (next() returns 0) */
function makeAlwaysTriggersRng() {
  return {
    next: () => 0,
    int: () => 1,
    chance: (_p: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  };
}

/**
 * Gen 4 Contact Abilities Tests — Aftermath
 *
 * Tests the Aftermath ability added in Gen 4:
 *   - Aftermath: when the holder faints from a contact move, the attacker
 *     takes 1/4 of its max HP in damage.
 *
 * Note: Poison Point, Cute Charm, Static, Flame Body, Rough Skin, and Effect Spore
 * are already tested in abilities.test.ts — this file only covers Aftermath.
 *
 * Source: Bulbapedia — Aftermath: "Damages the attacker landing the finishing hit
 *   by 1/4 its max HP."
 * Source: Showdown Gen 4 mod — Aftermath on-contact trigger
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
  gender?: Gender;
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
    moves: [],
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
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
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
  gender?: Gender;
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
      gender: overrides.gender,
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

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: null,
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

function makeContext(opts: {
  ability: string;
  opponent?: ReturnType<typeof makeActivePokemon>;
  currentHp?: number;
  maxHp?: number;
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: "on-contact",
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// Aftermath
// ===========================================================================

describe("applyGen4Ability on-contact -- Aftermath (NEW in Gen 4)", () => {
  it("given Aftermath holder that has fainted (0 HP) and attacker with maxHp=200, when contact triggers, then deals 1/4 attacker max HP (50) as chip damage", () => {
    // Source: Bulbapedia — Aftermath: "Damages the attacker landing the finishing hit
    //   by 1/4 its max HP." Only triggers when the holder faints.
    // Source: Showdown Gen 4 mod — Aftermath trigger
    // Derivation: floor(200/4) = 50
    const attacker = makeActivePokemon({ maxHp: 200, currentHp: 100 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 0, // holder fainted
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 50,
    });
  });

  it("given Aftermath holder that has fainted and attacker with maxHp=320, when contact triggers, then deals floor(320/4)=80 chip damage (triangulation)", () => {
    // Source: Bulbapedia — Aftermath: 1/4 attacker max HP
    // Triangulation: second input to confirm formula scales
    // Derivation: floor(320/4) = 80
    const attacker = makeActivePokemon({ maxHp: 320, currentHp: 200 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 80,
    });
  });

  it("given Aftermath holder that has NOT fainted (currentHp > 0), when contact triggers, then does not activate", () => {
    // Source: Bulbapedia — Aftermath: only triggers when the holder faints
    // Source: Showdown Gen 4 mod — Aftermath requires 0 HP
    const attacker = makeActivePokemon({ maxHp: 200 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 50, // NOT fainted
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Aftermath holder fainted and attacker with very low maxHp=1, when contact triggers, then deals at least 1 chip damage", () => {
    // Source: Bulbapedia — Aftermath: minimum damage floor
    // Derivation: floor(1/4) = 0, Math.max(1, 0) = 1
    const attacker = makeActivePokemon({ maxHp: 1, currentHp: 1 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 0,
      maxHp: 50,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 1,
    });
  });

  it("given Aftermath holder fainted but no opponent present, when contact triggers, then does not activate", () => {
    // Edge case: no opponent means on-contact cannot fire
    const ctx = makeContext({
      ability: "aftermath",
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Aftermath, when activated, then message mentions Aftermath", () => {
    // Verify message content
    const attacker = makeActivePokemon({ maxHp: 200 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Aftermath");
  });
});

// ===========================================================================
// Status immunity checks for contact abilities
// ===========================================================================

describe("applyGen4Ability on-contact -- Static immunity checks", () => {
  it("given attacker with Limber ability, when Static triggers, then paralysis is blocked", () => {
    // Source: Bulbapedia — Limber: prevents paralysis
    // Source: Showdown Gen 4 mod — ability immunity table (ABILITY_STATUS_IMMUNITIES)
    // Static fires (rng returns 0) but Limber blocks the paralysis infliction.
    const attacker = makeActivePokemon({ ability: "limber" });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "static" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given attacker without status immunity, when Static triggers, then paralysis is inflicted", () => {
    // Triangulation: confirm Static does fire when no immunity is present.
    // Source: Bulbapedia — Static: 30% chance to paralyze attacker on contact
    const attacker = makeActivePokemon({ ability: "blaze" });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "static" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({ effectType: "status-inflict", status: "paralysis" });
  });
});

describe("applyGen4Ability on-contact -- Flame Body immunity checks", () => {
  it("given Fire-type attacker, when Flame Body triggers, then burn is blocked", () => {
    // Source: Bulbapedia — Fire-types are immune to burn
    // Source: Showdown Gen 4 mod — GEN4_STATUS_IMMUNITIES: burn: ['fire']
    const attacker = makeActivePokemon({ types: ["fire"] });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "flame-body" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given attacker with Water Veil, when Flame Body triggers, then burn is blocked", () => {
    // Source: Bulbapedia — Water Veil: prevents burn
    // Source: Showdown Gen 4 mod — ABILITY_STATUS_IMMUNITIES: 'water-veil': ['burn']
    const attacker = makeActivePokemon({ ability: "water-veil", types: ["water"] });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "flame-body" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4Ability on-contact -- Poison Point immunity checks", () => {
  it("given attacker with Immunity ability, when Poison Point triggers, then poison is blocked", () => {
    // Source: Bulbapedia — Immunity: prevents poisoning
    // Source: Showdown Gen 4 mod — ABILITY_STATUS_IMMUNITIES: immunity: ['poison', 'badly-poisoned']
    const attacker = makeActivePokemon({ ability: "immunity" });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "poison-point" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Poison-type attacker, when Poison Point triggers, then poison is blocked", () => {
    // Source: Bulbapedia — Poison-types are immune to being poisoned
    // Source: Showdown Gen 4 mod — GEN4_STATUS_IMMUNITIES: poison: ['poison', 'steel']
    const attacker = makeActivePokemon({ types: ["poison"] });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "poison-point" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Steel-type attacker, when Poison Point triggers, then poison is blocked", () => {
    // Source: Bulbapedia — Steel-types are immune to being poisoned
    // Source: Showdown Gen 4 mod — GEN4_STATUS_IMMUNITIES: poison: ['poison', 'steel']
    const attacker = makeActivePokemon({ types: ["steel"] });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "poison-point" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4Ability on-contact -- Effect Spore immunity checks", () => {
  it("given Steel-type attacker, when Effect Spore rolls poison (roll < 1/3), then poison is blocked", () => {
    // Source: Bulbapedia — Steel-types are immune to poison
    // Source: Showdown Gen 4 mod — GEN4_STATUS_IMMUNITIES: poison: ['poison', 'steel']
    // Effect Spore gate roll = 0 (triggers), effect roll = 0 (< 1/3 → poison path)
    const attacker = makeActivePokemon({ types: ["steel"] });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "effect-spore" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(), // next() always returns 0: gate passes, roll=0 → poison path
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given attacker with Insomnia, when Effect Spore rolls sleep (roll >= 2/3), then sleep is blocked", () => {
    // Source: Bulbapedia — Insomnia: prevents sleep
    // Source: Showdown Gen 4 mod — ABILITY_STATUS_IMMUNITIES: insomnia: ['sleep']
    // Effect Spore gate roll = 0 (triggers), then second roll = 0.9 (>= 2/3 → sleep path)
    const attacker = makeActivePokemon({ ability: "insomnia" });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "effect-spore" });
    let callCount = 0;
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: {
        next: () => {
          // First call: gate check (0 = triggers); second call: effect roll (0.9 → sleep)
          return callCount++ === 0 ? 0 : 0.9;
        },
        int: () => 1,
        chance: (_p: number) => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4Ability on-contact -- Cute Charm immunity checks", () => {
  it("given attacker with Oblivious, when Cute Charm triggers, then infatuation is blocked", () => {
    // Source: Bulbapedia — Oblivious: prevents infatuation
    // Source: Showdown Gen 4 mod — ABILITY_VOLATILE_IMMUNITIES: oblivious: ['infatuation']
    const attacker = makeActivePokemon({ ability: "oblivious", gender: "male" });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "cute-charm", gender: "female" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given attacker without Oblivious and opposite gender, when Cute Charm triggers, then infatuation is inflicted", () => {
    // Triangulation: confirm Cute Charm fires when no immunity is present.
    // Source: Bulbapedia — Cute Charm: 30% chance to infatuate attacker of opposite gender
    const attacker = makeActivePokemon({ ability: "blaze", gender: "male" });
    const state = makeBattleState();
    const defender = makeActivePokemon({ ability: "cute-charm", gender: "female" });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: "on-contact",
      rng: makeAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "volatile-inflict",
      volatile: "infatuation",
    });
  });
});
