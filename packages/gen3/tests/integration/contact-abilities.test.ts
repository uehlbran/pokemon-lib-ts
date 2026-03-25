import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType } from "@pokemon-lib-ts/core";
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
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  applyGen3Ability,
} from "../../src";

/**
 * Gen 3 On-Contact Ability Tests
 *
 * Tests for abilities that trigger when the defender is hit by a contact move:
 *   - Static: 30% chance to paralyze attacker
 *   - Flame Body: 30% chance to burn attacker
 *   - Poison Point: 30% chance to poison attacker
 *   - Rough Skin: 1/16 attacker's max HP chip damage (Gen 3 = 1/16, Gen 4+ = 1/8)
 *   - Effect Spore: 30% chance; 1/3 each for poison/paralysis/sleep
 *   - Cute Charm: 30% chance to infatuate (opposite gender only)
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen3DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN3_ABILITY_IDS } as const;
const TYPES = CORE_TYPE_IDS;
const STATUSES = CORE_STATUS_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const GENDERS = CORE_GENDERS;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(GEN3_SPECIES_IDS.bulbasaur);
const DEFAULT_NATURE = DATA_MANAGER.getNature(GEN3_NATURE_IDS.hardy).id;
const CONTACT_MOVE = DATA_MANAGER.getMove(GEN3_MOVE_IDS.tackle);
type PokemonGender = (typeof GENDERS)[keyof typeof GENDERS];

function createMockRng(nextValues: number[] = [0]) {
  let index = 0;
  return {
    next: () => {
      const val = nextValues[index % nextValues.length]!;
      index++;
      return val;
    },
    int: (_min: number, _max: number) => 85,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createOnFieldPokemon(opts: {
  speciesId?: number;
  types?: PokemonType[];
  ability?: string;
  status?: string | null;
  hp?: number;
  maxHp?: number;
  gender?: PokemonGender;
  nickname?: string | null;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const species = opts.speciesId ? DATA_MANAGER.getSpecies(opts.speciesId) : DEFAULT_SPECIES;

  const pokemon = {
    uid: "test-mon",
    speciesId: species.id,
    nickname: opts.nickname ?? null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: opts.hp ?? maxHp,
    moves: [CONTACT_MOVE],
    ability: opts.ability ?? ABILITIES.none,
    abilitySlot: ABILITY_SLOTS.normal1,
    heldItem: CORE_ITEM_IDS.pokeBall,
    status: opts.status ?? null,
    friendship: 0,
    gender: opts.gender ?? GENDERS.male,
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
  };

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
    types: opts.types ?? (species.types as PokemonType[]),
    ability: opts.ability ?? ABILITIES.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
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
  } as unknown as ActivePokemon;
}

function createBattleState(
  side0Active: ActivePokemon,
  side1Active: ActivePokemon,
): BattleState {
  return {
    sides: [
      {
        active: [side0Active],
        team: [side0Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [side1Active],
        team: [side1Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
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

// ===========================================================================
// Static -- 30% paralysis on contact
// ===========================================================================

describe("Gen 3 Static ability (on-contact)", () => {
  // Source: pret/pokeemerald -- Static: 30% chance to paralyze on contact
  // Source: Bulbapedia -- "Static has a 30% chance of paralyzing the attacker on contact"

  it("given defender with Static and rng < 0.3, when attacker makes contact, then paralysis is inflicted", () => {
    // rng.next() returns 0.1 (< 0.3 = triggers)
    // Source: pret/pokeemerald -- Static triggers when Random() % 100 < 30
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.pikachu, ability: ABILITIES.static });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.paralysis,
    });
  });

  it("given defender with Static and rng >= 0.3, when attacker makes contact, then no paralysis", () => {
    // rng.next() returns 0.5 (>= 0.3 = does not trigger)
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.pikachu, ability: ABILITIES.static });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.5]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });

  it("given attacker is Electric-type, when Static triggers, then paralysis IS inflicted (no Electric immunity in Gen 3)", () => {
    // Source: pret/pokeemerald src/battle_util.c — CanBeStatusd has no Electric-type paralysis check.
    // Electric-type paralysis immunity was introduced in Gen 6 (blanket).
    // Source: Bulbapedia — "In Generation VI onward, Electric-type Pokemon are immune to paralysis."
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.pikachu, ability: ABILITIES.static });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.pikachu });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]); // would trigger

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("status-inflict");
  });

  it("given attacker has Limber, when Static triggers, then paralysis is blocked by ability immunity", () => {
    // Source: pret/pokeemerald -- Limber prevents paralysis from any source
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.pikachu, ability: ABILITIES.static });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, ability: ABILITIES.limber });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]); // would trigger

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });

  it("given attacker already has a status, when Static would trigger, then no additional status", () => {
    // Source: pret/pokeemerald -- primary status prevents additional primary status
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.pikachu, ability: ABILITIES.static });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, status: STATUSES.burn });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]); // would trigger

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Flame Body -- 30% burn on contact
// ===========================================================================

describe("Gen 3 Flame Body ability (on-contact)", () => {
  // Source: pret/pokeemerald -- Flame Body: 30% chance to burn on contact

  it("given defender with Flame Body and rng < 0.3, when attacker makes contact, then burn is inflicted", () => {
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.magcargo, ability: ABILITIES.flameBody });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.2]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.burn,
    });
  });

  it("given attacker is Fire-type, when Flame Body triggers, then burn is blocked by type immunity", () => {
    // Source: pret/pokeemerald -- Fire types immune to burn
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.magcargo, ability: ABILITIES.flameBody });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.charizard });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Poison Point -- 30% poison on contact
// ===========================================================================

describe("Gen 3 Poison Point ability (on-contact)", () => {
  // Source: pret/pokeemerald -- Poison Point: 30% chance to poison on contact

  it("given defender with Poison Point and rng < 0.3, when attacker makes contact, then poison is inflicted", () => {
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.nidoking, ability: ABILITIES.poisonPoint });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.15]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.poison,
    });
  });

  it("given attacker is Poison-type, when Poison Point triggers, then poison is blocked by type immunity", () => {
    // Source: pret/pokeemerald -- Poison/Steel types immune to poison
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.nidoking, ability: ABILITIES.poisonPoint });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.nidoranFemale });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });

  it("given attacker has Immunity ability, when Poison Point triggers, then poison is blocked", () => {
    // Source: pret/pokeemerald -- Immunity prevents poison from any source
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.nidoking, ability: ABILITIES.poisonPoint });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, ability: ABILITIES.immunity });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Rough Skin -- 1/16 max HP chip damage on contact (Gen 3 specific)
// ===========================================================================

describe("Gen 3 Rough Skin ability (on-contact)", () => {
  // Source: pret/pokeemerald -- Rough Skin: 1/16 max HP chip damage
  // Source: Bulbapedia -- "In Generation III, it causes 1/16 of the attacker's maximum HP"
  // This is a key Gen 3 difference: Gen 4+ uses 1/8.

  it("given defender with Rough Skin and attacker has 160 max HP, when contact is made, then chip = floor(160/16) = 10", () => {
    // Source: Bulbapedia -- Gen 3 Rough Skin = 1/16 max HP
    // 160 / 16 = 10
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.gligar, ability: ABILITIES.roughSkin });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, maxHp: 160 });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 10,
    });
  });

  it("given defender with Rough Skin and attacker has 200 max HP, when contact is made, then chip = floor(200/16) = 12", () => {
    // Source: Bulbapedia -- Gen 3 Rough Skin = 1/16 max HP
    // 200 / 16 = 12.5 => floor = 12
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.gligar, ability: ABILITIES.roughSkin });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, maxHp: 200 });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 12,
    });
  });

  it("given attacker has 1 max HP, when Rough Skin triggers, then chip is clamped to minimum 1", () => {
    // Source: pret/pokeemerald -- minimum 1 HP damage
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.gligar, ability: ABILITIES.roughSkin });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, maxHp: 1, hp: 1 });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 1,
    });
  });
});

// ===========================================================================
// Effect Spore -- 10% chance (Gen 3), then 1/3 each for sleep/poison/paralysis
// ===========================================================================

describe("Gen 3 Effect Spore ability (on-contact)", () => {
  // Source: pret/pokeemerald src/battle_util.c:2782-2804 — Effect Spore:
  //   (Random() % 10) == 0 = 10% total trigger chance
  //   Then picks via (Random() & 3), rerolling 0:
  //     1 = MOVE_EFFECT_SLEEP, 2 = MOVE_EFFECT_POISON, 3 = PARALYSIS

  it("given rng triggers (< 0.1) and sub-roll < 1/3, when contact made, then sleep is inflicted", () => {
    // Source: pret/pokeemerald src/battle_util.c:2788 — (Random() % 10) == 0 → 10% trigger
    // Source: pret/pokeemerald — MOVE_EFFECT_SLEEP (value 1) is first status in 1/3 split
    // First rng.next() = 0.05 (< 0.1, triggers)
    // Second rng.next() = 0.1 (< 1/3, picks sleep)
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.breloom, ability: ABILITIES.effectSpore });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.05, 0.1]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.sleep,
    });
  });

  it("given rng triggers (< 0.1) and sub-roll between 1/3 and 2/3, when contact made, then poison is inflicted", () => {
    // Source: pret/pokeemerald — MOVE_EFFECT_POISON (value 2) is second status in 1/3 split
    // First rng.next() = 0.05 (< 0.1, triggers)
    // Second rng.next() = 0.5 (1/3 <= 0.5 < 2/3, picks poison)
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.breloom, ability: ABILITIES.effectSpore });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.05, 0.5]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.poison,
    });
  });

  it("given rng triggers (< 0.1) and sub-roll >= 2/3, when contact made, then paralysis is inflicted", () => {
    // Source: pret/pokeemerald — MOVE_EFFECT_BURN→PARALYSIS (value 3) is third in 1/3 split
    // First rng.next() = 0.05 (< 0.1, triggers)
    // Second rng.next() = 0.8 (>= 2/3, picks paralysis)
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.breloom, ability: ABILITIES.effectSpore });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.05, 0.8]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.paralysis,
    });
  });

  it("given rng does not trigger (>= 0.1), when contact made, then no effect", () => {
    // Source: pret/pokeemerald — (Random() % 10) == 0, so >= 0.1 does not trigger
    const defender = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.breloom, ability: ABILITIES.effectSpore });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.15]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Cute Charm -- 30% infatuation on contact (opposite gender)
// ===========================================================================

describe("Gen 3 Cute Charm ability (on-contact)", () => {
  // Source: pret/pokeemerald -- Cute Charm: 30% infatuation, requires opposite gender
  // Source: Bulbapedia -- gender check for Cute Charm

  it("given opposite genders and rng < 0.3, when contact made, then infatuation is inflicted", () => {
    const defender = createOnFieldPokemon({
      speciesId: GEN3_SPECIES_IDS.jigglypuff,
      ability: ABILITIES.cuteCharm,
      gender: GENDERS.female,
    });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, gender: GENDERS.male });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.2]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "opponent",
      volatile: VOLATILES.infatuation,
    });
  });

  it("given same genders, when Cute Charm triggers, then no infatuation", () => {
    const defender = createOnFieldPokemon({
      speciesId: GEN3_SPECIES_IDS.jigglypuff,
      ability: ABILITIES.cuteCharm,
      gender: GENDERS.male,
    });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, gender: GENDERS.male });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });

  it("given genderless attacker, when Cute Charm triggers, then no infatuation", () => {
    const defender = createOnFieldPokemon({
      speciesId: GEN3_SPECIES_IDS.jigglypuff,
      ability: ABILITIES.cuteCharm,
      gender: GENDERS.female,
    });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, gender: GENDERS.genderless });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });

  it("given attacker has Oblivious, when Cute Charm triggers, then infatuation is blocked", () => {
    // Source: pret/pokeemerald -- Oblivious blocks infatuation from Cute Charm
    const defender = createOnFieldPokemon({
      speciesId: GEN3_SPECIES_IDS.jigglypuff,
      ability: ABILITIES.cuteCharm,
      gender: GENDERS.female,
    });
    const attacker = createOnFieldPokemon({ speciesId: GEN3_SPECIES_IDS.rattata, ability: ABILITIES.oblivious, gender: GENDERS.male });
    const state = createBattleState(attacker, defender);
    const rng = createMockRng([0.1]);

    const context: AbilityContext = {
      pokemon: defender,
      opponent: attacker,
      state,
      rng,
      trigger: TRIGGERS.onContact,
      move: CONTACT_MOVE,
    };

    const result = applyGen3Ability(TRIGGERS.onContact, context);
    expect(result.activated).toBe(false);
  });
});
