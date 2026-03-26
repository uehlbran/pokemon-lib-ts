import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { Gender, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager, GEN4_ABILITY_IDS, GEN4_NATURE_IDS, GEN4_SPECIES_IDS } from "../src";
import { applyGen4Ability } from "../src/Gen4Abilities";

// ---------------------------------------------------------------------------
// RNG helpers
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS };
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(GEN4_SPECIES_IDS.bibarel);
const DEFAULT_NATURE = DATA_MANAGER.getNature(GEN4_NATURE_IDS.hardy).id;

/** RNG that always passes the 30% roll (next() returns 0) */
function createAlwaysTriggersRng() {
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

function createPokemonInstance(overrides: {
  speciesId?: (typeof GEN4_SPECIES_IDS)[keyof typeof GEN4_SPECIES_IDS];
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  gender?: Gender;
}): PokemonInstance {
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: species.id,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? species.abilities.normal[0] ?? ABILITIES.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: overrides.gender ?? CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
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

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: (typeof GEN4_SPECIES_IDS)[keyof typeof GEN4_SPECIES_IDS];
  nickname?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  gender?: Gender;
}) {
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  return {
    pokemon: createPokemonInstance({
      ability: overrides.ability,
      speciesId: species.id,
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
    types: overrides.types ?? [...species.types],
    ability: overrides.ability ?? species.abilities.normal[0] ?? ABILITIES.none,
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
  };
}

function createBattleSide(index: 0 | 1): BattleSide {
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

function createBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
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

function createAbilityContext(opts: {
  ability: string;
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  currentHp?: number;
  maxHp?: number;
}): AbilityContext {
  const state = createBattleState();
  const pokemon = createOnFieldPokemon({
    ability: opts.ability,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: TRIGGERS.onContact,
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
    const attacker = createOnFieldPokemon({ maxHp: 200, currentHp: 100 });
    const ctx = createAbilityContext({
      ability: ABILITIES.aftermath,
      opponent: attacker,
      currentHp: 0, // holder fainted
      maxHp: 150,
    });
    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

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
    const attacker = createOnFieldPokemon({ maxHp: 320, currentHp: 200 });
    const ctx = createAbilityContext({
      ability: ABILITIES.aftermath,
      opponent: attacker,
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

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
    const attacker = createOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: ABILITIES.aftermath,
      opponent: attacker,
      currentHp: 50, // NOT fainted
      maxHp: 150,
    });
    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Aftermath holder fainted and attacker with very low maxHp=1, when contact triggers, then deals at least 1 chip damage", () => {
    // Source: Bulbapedia — Aftermath: minimum damage floor
    // Derivation: floor(1/4) = 0, Math.max(1, 0) = 1
    const attacker = createOnFieldPokemon({ maxHp: 1, currentHp: 1 });
    const ctx = createAbilityContext({
      ability: ABILITIES.aftermath,
      opponent: attacker,
      currentHp: 0,
      maxHp: 50,
    });
    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 1,
    });
  });

  it("given Aftermath holder fainted but no opponent present, when contact triggers, then does not activate", () => {
    // Edge case: no opponent means on-contact cannot fire
    const ctx = createAbilityContext({
      ability: ABILITIES.aftermath,
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Aftermath, when activated, then message mentions Aftermath", () => {
    // Verify message content
    const attacker = createOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: ABILITIES.aftermath,
      opponent: attacker,
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

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
    const attacker = createOnFieldPokemon({ ability: ABILITIES.limber });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.static });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given attacker without status immunity, when Static triggers, then paralysis is inflicted", () => {
    // Triangulation: confirm Static does fire when no immunity is present.
    // Source: Bulbapedia — Static: 30% chance to paralyze attacker on contact
    const attacker = createOnFieldPokemon({ ability: ABILITIES.blaze });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.static });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      status: STATUSES.paralysis,
    });
  });
});

describe("applyGen4Ability on-contact -- Flame Body immunity checks", () => {
  it("given Fire-type attacker, when Flame Body triggers, then burn is blocked", () => {
    // Source: Bulbapedia — Fire-types are immune to burn
    // Source: Showdown Gen 4 mod — GEN4_STATUS_IMMUNITIES: burn: ['fire']
    const attacker = createOnFieldPokemon({ types: [TYPES.fire] });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.flameBody });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given attacker with Water Veil, when Flame Body triggers, then burn is blocked", () => {
    // Source: Bulbapedia — Water Veil: prevents burn
    // Source: Showdown Gen 4 mod — ABILITY_STATUS_IMMUNITIES: 'water-veil': ['burn']
    const attacker = createOnFieldPokemon({ ability: ABILITIES.waterVeil, types: [TYPES.water] });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.flameBody });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4Ability on-contact -- Poison Point immunity checks", () => {
  it("given attacker with Immunity ability, when Poison Point triggers, then poison is blocked", () => {
    // Source: Bulbapedia — Immunity: prevents poisoning
    // Source: Showdown Gen 4 mod — ABILITY_STATUS_IMMUNITIES: immunity: ['poison', 'badly-poisoned']
    const attacker = createOnFieldPokemon({ ability: ABILITIES.immunity });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.poisonPoint });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Poison-type attacker, when Poison Point triggers, then poison is blocked", () => {
    // Source: Bulbapedia — Poison-types are immune to being poisoned
    // Source: Showdown Gen 4 mod — GEN4_STATUS_IMMUNITIES: poison: ['poison', 'steel']
    const attacker = createOnFieldPokemon({ types: [TYPES.poison] });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.poisonPoint });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Steel-type attacker, when Poison Point triggers, then poison is blocked", () => {
    // Source: Bulbapedia — Steel-types are immune to being poisoned
    // Source: Showdown Gen 4 mod — GEN4_STATUS_IMMUNITIES: poison: ['poison', 'steel']
    const attacker = createOnFieldPokemon({ types: [TYPES.steel] });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.poisonPoint });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4Ability on-contact -- Effect Spore immunity checks", () => {
  // Gen 4 Effect Spore uses a SINGLE random(100) roll:
  //   0-9 = sleep, 10-19 = paralysis, 20-29 = poison
  // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts

  it("given Steel-type attacker, when Effect Spore rolls poison (roll in [20,30)), then poison is blocked", () => {
    // Source: Bulbapedia — Steel-types are immune to poison
    // Source: Showdown Gen 4 mod — GEN4_STATUS_IMMUNITIES: poison: ['poison', 'steel']
    // rng.next() = 0.25 => Math.floor(0.25 * 100) = 25 => poison path, blocked by Steel type
    const attacker = createOnFieldPokemon({ types: [TYPES.steel] });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.effectSpore });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createSequenceRng([0.25]), // single roll: 25 => poison path, Steel immune
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given attacker with Insomnia, when Effect Spore rolls sleep (roll in [0,10)), then sleep is blocked", () => {
    // Source: Bulbapedia — Insomnia: prevents sleep
    // Source: Showdown Gen 4 mod — ABILITY_STATUS_IMMUNITIES: insomnia: ['sleep']
    // rng.next() = 0.05 => Math.floor(0.05 * 100) = 5 => sleep path, blocked by Insomnia
    const attacker = createOnFieldPokemon({ ability: ABILITIES.insomnia });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.effectSpore });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createSequenceRng([0.05]), // single roll: 5 => sleep path, Insomnia immune
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Positive triangulation: abilities successfully inflict status
// ===========================================================================

/**
 * Creates an RNG mock where next() returns values from a provided sequence.
 * Each successive call to next() returns the next value in the array.
 * After the array is exhausted, returns 0.
 */
function createSequenceRng(values: number[]) {
  let callIndex = 0;
  return {
    next: () => {
      const val = values[callIndex] ?? 0;
      callIndex++;
      return val;
    },
    int: () => 1,
    chance: (_p: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  };
}

describe("applyGen4Ability on-contact -- positive status infliction (triangulation)", () => {
  it("given non-Fire non-Water-Veil attacker, when Flame Body triggers (rng < 0.3), then attacker is burned", () => {
    // Source: Bulbapedia — Flame Body: 30% chance to burn attacker on contact
    // Source: Showdown Gen 4 mod — Flame Body trigger fires when rng.next() < 0.3
    // RNG returns 0.1 (< 0.3) to guarantee activation.
    const attacker = createOnFieldPokemon({ types: [TYPES.normal], ability: ABILITIES.blaze });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.flameBody });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createSequenceRng([0.1]), // below 30% threshold
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.burn,
    });
  });

  it("given non-Poison non-Steel non-Immunity attacker, when Poison Point triggers (rng < 0.3), then attacker is poisoned", () => {
    // Source: Bulbapedia — Poison Point: 30% chance to poison attacker on contact
    // Source: Showdown Gen 4 mod — Poison Point trigger fires when rng.next() < 0.3
    // RNG returns 0.1 (< 0.3) to guarantee activation.
    const attacker = createOnFieldPokemon({ types: [TYPES.normal], ability: ABILITIES.blaze });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.poisonPoint });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createSequenceRng([0.1]), // below 30% threshold
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.poison,
    });
  });

  it("given non-immune attacker, when Effect Spore triggers and roll selects poison (roll in [20,30)), then attacker is poisoned", () => {
    // Gen 4 Effect Spore uses a SINGLE random(100) roll:
    //   0-9 = sleep, 10-19 = paralysis, 20-29 = poison
    // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts
    // rng.next() = 0.25 => Math.floor(0.25 * 100) = 25 => poison path
    const attacker = createOnFieldPokemon({ types: [TYPES.normal], ability: ABILITIES.blaze });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.effectSpore });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createSequenceRng([0.25]), // single roll: 25 => poison path
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.poison,
    });
  });

  it("given non-immune attacker, when Effect Spore triggers and type roll selects paralysis (1/3 <= roll < 2/3), then attacker is paralyzed", () => {
    // Source: Bulbapedia — Effect Spore: 30% total; 1/3 splits
    // Source: Showdown Gen 4 mod — Effect Spore paralysis path
    // First rng.next() = 0.1 (gate passes), second rng.next() = 0.5 (>= 1/3, < 2/3 = paralysis)
    const attacker = createOnFieldPokemon({ types: [TYPES.normal], ability: ABILITIES.blaze });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.effectSpore });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createSequenceRng([0.1, 0.5]), // gate passes, roll 0.5 = paralysis path
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.paralysis,
    });
  });

  it("given non-immune attacker, when Effect Spore triggers and roll selects sleep (roll in [0,10)), then attacker is put to sleep", () => {
    // Gen 4 Effect Spore uses a SINGLE random(100) roll:
    //   0-9 = sleep, 10-19 = paralysis, 20-29 = poison
    // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts
    // rng.next() = 0.05 => Math.floor(0.05 * 100) = 5 => sleep path
    const attacker = createOnFieldPokemon({ types: [TYPES.normal], ability: ABILITIES.blaze });
    const state = createBattleState();
    const defender = createOnFieldPokemon({ ability: ABILITIES.effectSpore });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createSequenceRng([0.05]), // single roll: 5 => sleep path
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.sleep,
    });
  });
});

describe("applyGen4Ability on-contact -- Cute Charm immunity checks", () => {
  it("given attacker with Oblivious, when Cute Charm triggers, then infatuation is blocked", () => {
    // Source: Bulbapedia — Oblivious: prevents infatuation
    // Source: Showdown Gen 4 mod — ABILITY_VOLATILE_IMMUNITIES: oblivious: ['infatuation']
    const attacker = createOnFieldPokemon({
      ability: ABILITIES.oblivious,
      gender: CORE_GENDERS.male,
    });
    const state = createBattleState();
    const defender = createOnFieldPokemon({
      ability: ABILITIES.cuteCharm,
      gender: CORE_GENDERS.female,
    });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given attacker without Oblivious and opposite gender, when Cute Charm triggers, then infatuation is inflicted", () => {
    // Triangulation: confirm Cute Charm fires when no immunity is present.
    // Source: Bulbapedia — Cute Charm: 30% chance to infatuate attacker of opposite gender
    const attacker = createOnFieldPokemon({ ability: ABILITIES.blaze, gender: CORE_GENDERS.male });
    const state = createBattleState();
    const defender = createOnFieldPokemon({
      ability: ABILITIES.cuteCharm,
      gender: CORE_GENDERS.female,
    });
    const ctx: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      trigger: TRIGGERS.onContact,
      rng: createAlwaysTriggersRng(),
    } as unknown as AbilityContext;

    const result = applyGen4Ability(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "volatile-inflict",
      volatile: VOLATILES.infatuation,
    });
  });
});
