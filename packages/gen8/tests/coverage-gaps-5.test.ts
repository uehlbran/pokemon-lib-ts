/**
 * Targeted branch-coverage tests for Gen 8 Wave 9 — batch 5.
 *
 * Covers previously-uncovered false branches in Gen8Items.ts:
 *   1. getItemDamageModifier — non-matching type-boost, plate, incense; life-orb on status
 *   2. getPinchBerryThreshold — gluttony with fraction > 0.25 (no change); non-gluttony
 *   3. handleEndOfTurn — NO_ACTIVATION false branches for orbs, berries, mental-herb
 *   4. handleOnDamageTaken — NO_ACTIVATION paths for pinch berries, jaboca/rowap, absorb-bulb,
 *      cell-battery, weakness-policy, kee/maranga/luminous-moss/snowball
 *   5. handleOnHit — false branches for shell-bell, life-orb, kings-rock, razor-fang
 *   6. handleOnContact — rocky-helmet with non-contact or missing opponent
 *   7. Positive activation cases — cover the true branch of the same switch arms
 *
 * Source authority: Showdown data/items.ts (Gen 5–9 primary), Bulbapedia item pages.
 */

import type { ActivePokemon, BattleState, ItemContext, ItemResult } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_IDS,
  CORE_GENDERS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
  createEvs,
  createIvs,
  createPokemonInstance,
  type MoveData,
  type PokemonType,
} from "@pokemon-lib-ts/core";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "@pokemon-lib-ts/gen8";
import { describe, expect, it } from "vitest";
import { applyGen8HeldItem, getItemDamageModifier, getPinchBerryThreshold } from "../src/Gen8Items";
import { GEN8_TEST_VALUES } from "./helpers/reference-data";

const {
  battle: battleValues,
  categories: moveCategories,
  pokemon: pokemonDefaults,
} = GEN8_TEST_VALUES;
const dataManager = createGen8DataManager();
const defaultSpecies = dataManager.getSpecies(GEN8_SPECIES_IDS.bulbasaur);
const defaultNature = dataManager.getNature(GEN8_NATURE_IDS.hardy).id;

const abilityIds = {
  ...CORE_ABILITY_IDS,
  ...GEN8_ABILITY_IDS,
};

const itemIds = GEN8_ITEM_IDS;
const moveIds = GEN8_MOVE_IDS;
const statusIds = CORE_STATUS_IDS;
const typeIds = CORE_TYPE_IDS;
type Gen8MoveId = (typeof moveIds)[keyof typeof moveIds];

function expectNoActivation(result: ItemResult): void {
  expect(result).toEqual({ activated: false, effects: [], messages: [] });
}

// ---------------------------------------------------------------------------
// Helper factories (mirror the style used in items.test.ts)
// ---------------------------------------------------------------------------

function createOnFieldPokemon(overrides: {
  heldItem?: string | null;
  ability?: string;
  types?: PokemonType[];
  hp?: number;
  currentHp?: number;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  speciesId?: number;
  nickname?: string | null;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(8), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: pokemonDefaults.abilitySlot ?? CORE_ABILITY_SLOTS.normal1,
    gender: pokemonDefaults.gender ?? CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });

  pokemon.nickname = overrides.nickname ?? null;
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = (overrides.status ?? null) as typeof pokemon.status;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.calculatedStats = {
    hp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const activePokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(species.types as PokemonType[])],
  );
  activePokemon.volatileStatuses = overrides.volatiles ?? new Map();
  activePokemon.ability = overrides.ability ?? abilityIds.none;
  activePokemon.itemKnockedOff = false;
  activePokemon.suppressedAbility = null;
  activePokemon.forcedMove = null;
  return activePokemon;
}

function createBattleState(): BattleState {
  return {
    format: { generation: 8, battleType: battleValues.singles },
    sides: [
      { active: [], bench: [], entryHazards: {} } as any,
      { active: [], bench: [], entryHazards: {} } as any,
    ],
    weather: null,
    terrain: null,
    trickRoom: null,
    magicRoom: null,
    wonderRoom: null,
    gravity: null,
    turnNumber: 1,
  } as BattleState;
}

function createRng(flinch = false): ItemContext["rng"] {
  return {
    chance: (_p: number) => flinch,
    next: () => 0.5,
    nextInt: (min: number) => min,
    seed: 12345,
    getState: () => 12345,
  };
}

function createCanonicalMove(
  moveId: Gen8MoveId,
  overrides: Partial<MoveData> = {},
): MoveData {
  const baseMove = dataManager.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
  };
}

function createItemContext(overrides: {
  heldItem?: string | null;
  ability?: string;
  types?: PokemonType[];
  hp?: number;
  currentHp?: number;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  damage?: number;
  move?: MoveData;
  opponent?: ActivePokemon;
  rng?: any;
}): ItemContext {
  return {
    pokemon: createOnFieldPokemon({
      heldItem: overrides.heldItem ?? null,
      ability: overrides.ability ?? abilityIds.none,
      types: overrides.types ?? [typeIds.normal],
      hp: overrides.hp ?? 200,
      currentHp: overrides.currentHp ?? overrides.hp ?? 200,
      status: overrides.status ?? null,
      volatiles: overrides.volatiles ?? new Map(),
    }),
    state: createBattleState(),
    rng: overrides.rng ?? createRng(),
    move: overrides.move,
    damage: overrides.damage,
    opponent: overrides.opponent,
  } as ItemContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1: getItemDamageModifier — non-matching type (false branches)
// ─────────────────────────────────────────────────────────────────────────────

describe("getItemDamageModifier — non-matching type returns no boost", () => {
  it(
    "given charcoal (fire boost) and water move, " +
      "when getItemDamageModifier, then returns 4096 (no boost)",
    () => {
      // Source: Showdown data/items.ts — type-boost items only apply when type matches
      const result = getItemDamageModifier(itemIds.charcoal, {
        moveType: typeIds.water,
        moveCategory: moveCategories.physical,
      });
      expect(result).toBe(4096);
    },
  );

  it(
    "given flame-plate (fire boost) and grass move, " +
      "when getItemDamageModifier, then returns 4096",
    () => {
      // Source: Showdown data/items.ts — plate items only match the holder's plate type
      const result = getItemDamageModifier(itemIds.flamePlate, {
        moveType: typeIds.grass,
        moveCategory: moveCategories.physical,
      });
      expect(result).toBe(4096);
    },
  );

  it(
    "given odd-incense (psychic incense boost) and fire move, " +
      "when getItemDamageModifier, then returns 4096",
    () => {
      // Source: Showdown data/items.ts — incense items only match their specific type
      const result = getItemDamageModifier(itemIds.oddIncense, {
        moveType: typeIds.fire,
        moveCategory: moveCategories.special,
      });
      expect(result).toBe(4096);
    },
  );

  it(
    "given life-orb and status move, " +
      "when getItemDamageModifier, then returns 4096 (status moves are not damaging)",
    () => {
      // Source: Showdown data/items.ts — Life Orb onModifyDamage only fires for damaging moves
      const result = getItemDamageModifier(itemIds.lifeOrb, {
        moveType: typeIds.fire,
        moveCategory: moveCategories.status,
      });
      expect(result).toBe(4096);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2: getPinchBerryThreshold
// ─────────────────────────────────────────────────────────────────────────────

describe("getPinchBerryThreshold", () => {
  it(
    "given gluttony and normalFraction = 0.25, " +
      "when getPinchBerryThreshold, then returns 0.5 (gluttony doubles threshold)",
    () => {
      // Source: Bulbapedia — Gluttony: makes Pokemon eat a held Berry when HP drops
      //   to 50% or less instead of the usual 25%
      const result = getPinchBerryThreshold({ ability: abilityIds.gluttony }, 0.25);
      expect(result).toBe(0.5);
    },
  );

  it(
      "given gluttony and normalFraction = 0.5 (> 0.25), " +
      "when getPinchBerryThreshold, then returns 0.5 unchanged (condition not met)",
    () => {
      // Source: Showdown data/abilities.ts — Gluttony only doubles fractions <= 0.25
      // 0.5 > 0.25 so the gluttony branch is skipped; returns normalFraction (0.5)
      const result = getPinchBerryThreshold({ ability: abilityIds.gluttony }, 0.5);
      expect(result).toBe(0.5);
    },
  );

  it(
    "given non-gluttony ability and normalFraction = 0.25, " +
      "when getPinchBerryThreshold, then returns 0.25 (no change)",
    () => {
      // Source: Showdown data/abilities.ts — only Gluttony modifies the pinch threshold
      const result = getPinchBerryThreshold({ ability: abilityIds.blaze }, 0.25);
      expect(result).toBe(0.25);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3: handleEndOfTurn — NO_ACTIVATION false branches
// ─────────────────────────────────────────────────────────────────────────────

describe("handleEndOfTurn — NO_ACTIVATION paths", () => {
  it(
    "given toxic-orb holder already paralyzed, " +
      "when end-of-turn, then NO_ACTIVATION (already has status)",
    () => {
      // Source: Showdown data/items.ts — Toxic Orb onResidual: skip if pokemon already
      //   has a status condition
      const ctx = createItemContext({ heldItem: itemIds.toxicOrb, status: statusIds.paralysis });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given toxic-orb and steel type, " +
      "when end-of-turn, then NO_ACTIVATION (steel is immune to poison)",
    () => {
      // Source: Showdown data/items.ts — Toxic Orb immune check: steel and poison types
      const ctx = createItemContext({ heldItem: itemIds.toxicOrb, types: [typeIds.steel] });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given toxic-orb and poison type, " +
      "when end-of-turn, then NO_ACTIVATION (poison type is immune to poisoning)",
    () => {
      // Source: Showdown data/items.ts — Toxic Orb immune check: steel and poison types
      const ctx = createItemContext({ heldItem: itemIds.toxicOrb, types: [typeIds.poison] });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given flame-orb holder already burned, " +
      "when end-of-turn, then NO_ACTIVATION (already has status)",
    () => {
      // Source: Showdown data/items.ts — Flame Orb onResidual: skip if pokemon already
      //   has a status condition
      const ctx = createItemContext({ heldItem: itemIds.flameOrb, status: statusIds.burn });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given flame-orb and fire type, " +
      "when end-of-turn, then NO_ACTIVATION (fire type is immune to burn)",
    () => {
      // Source: Showdown data/items.ts — Flame Orb immune check: fire types
      const ctx = createItemContext({ heldItem: itemIds.flameOrb, types: [typeIds.fire] });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given sitrus-berry holder at 60% HP, " +
      "when end-of-turn, then NO_ACTIVATION (HP above 50% threshold)",
    () => {
      // Source: Showdown data/items.ts — Sitrus Berry onUpdate: activates at <= 50% HP
      // 120/200 = 60% > 50%, so no activation
      const ctx = createItemContext({ heldItem: itemIds.sitrusBerry, hp: 200, currentHp: 120 });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given oran-berry holder at 60% HP, " +
      "when end-of-turn, then NO_ACTIVATION (HP above 50% threshold)",
    () => {
      // Source: Showdown data/items.ts — Oran Berry activates at <= 50% HP
      const ctx = createItemContext({ heldItem: itemIds.oranBerry, hp: 200, currentHp: 120 });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given lum-berry with no status and no confusion, " +
      "when end-of-turn, then NO_ACTIVATION (nothing to cure)",
    () => {
      // Source: Showdown data/items.ts — Lum Berry onUpdate: requires status or confusion
      const ctx = createItemContext({ heldItem: itemIds.lumBerry });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given cheri-berry holder with burn status, " +
      "when end-of-turn, then NO_ACTIVATION (cheri-berry only cures paralysis)",
    () => {
      // Source: Showdown data/items.ts — Cheri Berry cures paralysis only
      const ctx = createItemContext({ heldItem: itemIds.cheriBerry, status: statusIds.burn });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given chesto-berry holder with paralysis, " +
      "when end-of-turn, then NO_ACTIVATION (chesto-berry only cures sleep)",
    () => {
      // Source: Showdown data/items.ts — Chesto Berry cures sleep only
      const ctx = createItemContext({ heldItem: itemIds.chestoBerry, status: statusIds.paralysis });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given pecha-berry holder with burn, " +
      "when end-of-turn, then NO_ACTIVATION (pecha-berry only cures poison/badly-poisoned)",
    () => {
      // Source: Showdown data/items.ts — Pecha Berry cures poison and badly-poisoned only
      const ctx = createItemContext({ heldItem: itemIds.pechaBerry, status: statusIds.burn });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given rawst-berry holder with paralysis, " +
      "when end-of-turn, then NO_ACTIVATION (rawst-berry only cures burn)",
    () => {
      // Source: Showdown data/items.ts — Rawst Berry cures burn only
      const ctx = createItemContext({ heldItem: itemIds.rawstBerry, status: statusIds.paralysis });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given aspear-berry holder with sleep status, " +
      "when end-of-turn, then NO_ACTIVATION (aspear-berry only cures freeze)",
    () => {
      // Source: Showdown data/items.ts — Aspear Berry cures freeze only
      const ctx = createItemContext({ heldItem: itemIds.aspearBerry, status: statusIds.sleep });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given persim-berry holder without confusion, " +
      "when end-of-turn, then NO_ACTIVATION (nothing to cure)",
    () => {
      // Source: Showdown data/items.ts — Persim Berry cures confusion volatile only
      const ctx = createItemContext({ heldItem: itemIds.persimBerry });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );

  it(
    "given mental-herb holder without taunt or encore, " +
      "when end-of-turn, then NO_ACTIVATION (no mental volatile present)",
    () => {
      // Source: Showdown data/items.ts — Mental Herb onUpdate: requires one of the
      //   mental volatiles (infatuation, taunt, encore, disable, torment, heal-block)
      const ctx = createItemContext({ heldItem: itemIds.mentalHerb });
      expectNoActivation(applyGen8HeldItem("end-of-turn", ctx));
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4: handleOnDamageTaken — NO_ACTIVATION paths
// ─────────────────────────────────────────────────────────────────────────────

describe("handleOnDamageTaken — NO_ACTIVATION paths", () => {
  it("given sitrus-berry, when damage taken but HP stays above 50%, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Sitrus Berry activates at <= 50% HP
    // 150/200 = 75% HP, still above threshold
    const ctx = createItemContext({ heldItem: itemIds.sitrusBerry, hp: 200, currentHp: 150, damage: 10 });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it("given oran-berry, when damage taken but HP stays above 50%, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Oran Berry activates at <= 50% HP
    const ctx = createItemContext({ heldItem: itemIds.oranBerry, hp: 200, currentHp: 150, damage: 10 });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it(
    "given liechi-berry holder at 60% HP after damage, " +
      "when on-damage-taken, then NO_ACTIVATION (HP above 25% threshold)",
    () => {
      // Source: Showdown data/items.ts — Liechi Berry activates at <= 25% HP
      // 120/200 = 60% HP, above threshold
      const ctx = createItemContext({ heldItem: itemIds.liechiBerry, hp: 200, currentHp: 120, damage: 10 });
      expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
    },
  );

  it("given ganlon-berry holder at 60% HP, when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Ganlon Berry activates at <= 25% HP
    const ctx = createItemContext({ heldItem: itemIds.ganlonBerry, hp: 200, currentHp: 120, damage: 10 });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it("given salac-berry holder at 60% HP, when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Salac Berry activates at <= 25% HP
    const ctx = createItemContext({ heldItem: itemIds.salacBerry, hp: 200, currentHp: 120, damage: 10 });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it("given petaya-berry holder at 60% HP, when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Petaya Berry activates at <= 25% HP
    const ctx = createItemContext({ heldItem: itemIds.petayaBerry, hp: 200, currentHp: 120, damage: 10 });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it("given apicot-berry holder at 60% HP, when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Apicot Berry activates at <= 25% HP
    const ctx = createItemContext({ heldItem: itemIds.apicotBerry, hp: 200, currentHp: 120, damage: 10 });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it(
    "given jaboca-berry and a special move, " +
      "when on-damage-taken, then NO_ACTIVATION (jaboca only reacts to physical moves)",
    () => {
      // Source: Showdown data/items.ts — Jaboca Berry onDamagingHit: physical only
      const ctx = createItemContext({
        heldItem: itemIds.jabocaBerry,
        damage: 50,
        move: createCanonicalMove(moveIds.surf),
      });
      expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
    },
  );

  it(
    "given rowap-berry and a physical move, " +
      "when on-damage-taken, then NO_ACTIVATION (rowap only reacts to special moves)",
    () => {
      // Source: Showdown data/items.ts — Rowap Berry onDamagingHit: special only
      const ctx = createItemContext({
        heldItem: itemIds.rowapBerry,
        damage: 50,
        move: createCanonicalMove(moveIds.tackle),
      });
      expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
    },
  );

  it(
    "given sticky-barb defender and a non-contact move, " +
      "when on-damage-taken, then NO_ACTIVATION",
    () => {
      // Source: Showdown data/items.ts — Sticky Barb transfer: contact move required
      const ctx = createItemContext({
        heldItem: itemIds.stickyBarb,
        damage: 50,
        move: createCanonicalMove(moveIds.surf),
      });
      expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
    },
  );

  it("given red-card and damage = 0, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Red Card requires actual damage dealt (> 0)
    const ctx = createItemContext({ heldItem: itemIds.redCard, damage: 0 });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it("given eject-button and damage = 0, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Eject Button requires actual damage dealt (> 0)
    const ctx = createItemContext({ heldItem: itemIds.ejectButton, damage: 0 });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it(
    "given absorb-bulb and a fire move (not water), " + "when on-damage-taken, then NO_ACTIVATION",
    () => {
      // Source: Showdown data/items.ts — Absorb Bulb only triggers on Water-type moves
      const ctx = createItemContext({
        heldItem: itemIds.absorbBulb,
        damage: 50,
        move: createCanonicalMove(moveIds.flamethrower),
      });
      expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
    },
  );

  it("given cell-battery and a water move, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Cell Battery only triggers on Electric-type moves
    const ctx = createItemContext({
      heldItem: itemIds.cellBattery,
      damage: 50,
      move: createCanonicalMove(moveIds.surf),
    });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it(
    "given weakness-policy and normal-type holder hit by normal-type move (neutral effectiveness), " +
      "when on-damage-taken, then NO_ACTIVATION (not super-effective)",
    () => {
      // Source: Showdown data/items.ts — Weakness Policy requires >= 2x effectiveness
      // Normal vs Normal = 1x; condition `effectiveness >= 2` is false
      const ctx = createItemContext({
        heldItem: itemIds.weaknessPolicy,
        types: [typeIds.normal],
        damage: 50,
        move: createCanonicalMove(moveIds.tackle),
      });
      expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
    },
  );

  it(
    "given kee-berry and a special move, " +
      "when on-damage-taken, then NO_ACTIVATION (kee-berry only triggers on physical moves)",
    () => {
      // Source: Showdown data/items.ts — Kee Berry onDamagingHit: physical category only
      const ctx = createItemContext({
        heldItem: itemIds.keeBerry,
        damage: 50,
        move: createCanonicalMove(moveIds.surf),
      });
      expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
    },
  );

  it(
    "given maranga-berry and a physical move, " +
      "when on-damage-taken, then NO_ACTIVATION (maranga-berry only triggers on special moves)",
    () => {
      // Source: Showdown data/items.ts — Maranga Berry onDamagingHit: special category only
      const ctx = createItemContext({
        heldItem: itemIds.marangaBerry,
        damage: 50,
        move: createCanonicalMove(moveIds.tackle),
      });
      expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
    },
  );

  it("given luminous-moss and a fire move, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Luminous Moss only triggers on Water-type moves
    const ctx = createItemContext({
      heldItem: itemIds.luminousMoss,
      damage: 50,
      move: createCanonicalMove(moveIds.flamethrower),
    });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });

  it("given snowball and a fire move, " + "when on-damage-taken, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Snowball only triggers on Ice-type moves
    const ctx = createItemContext({
      heldItem: itemIds.snowball,
      damage: 50,
      move: createCanonicalMove(moveIds.flamethrower),
    });
    expectNoActivation(applyGen8HeldItem("on-damage-taken", ctx));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5: handleOnHit — false branches (attacker perspective)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleOnHit — NO_ACTIVATION paths", () => {
  it("given shell-bell attacker with damage = 0, " + "when on-hit, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Shell Bell onAfterMoveSecondarySelf:
    //   requires damageDealt > 0
    const ctx = createItemContext({ heldItem: itemIds.shellBell, damage: 0 });
    expectNoActivation(applyGen8HeldItem("on-hit", ctx));
  });

  it("given life-orb attacker with damage = 0, " + "when on-hit, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Life Orb onAfterMoveSecondarySelf:
    //   requires damageDealt > 0
    const ctx = createItemContext({ heldItem: itemIds.lifeOrb, damage: 0 });
    expectNoActivation(applyGen8HeldItem("on-hit", ctx));
  });

  it(
    "given kings-rock attacker with damage > 0 and RNG returns false, " +
      "when on-hit, then NO_ACTIVATION (no flinch)",
    () => {
      // Source: Showdown data/items.ts — King's Rock: 10% flinch via RNG chance
      // createRng(false) means chance() always returns false → no flinch
      const ctx = createItemContext({ heldItem: itemIds.kingsRock, damage: 50, rng: createRng(false) });
      expectNoActivation(applyGen8HeldItem("on-hit", ctx));
    },
  );

  it("given kings-rock attacker with damage = 0, " + "when on-hit, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — King's Rock: damage guard check before RNG
    const ctx = createItemContext({ heldItem: itemIds.kingsRock, damage: 0 });
    expectNoActivation(applyGen8HeldItem("on-hit", ctx));
  });

  it(
    "given razor-fang attacker with damage > 0 and RNG returns false, " +
      "when on-hit, then NO_ACTIVATION (no flinch)",
    () => {
      // Source: Showdown data/items.ts — Razor Fang: 10% flinch via RNG chance
      const ctx = createItemContext({ heldItem: itemIds.razorFang, damage: 50, rng: createRng(false) });
      expectNoActivation(applyGen8HeldItem("on-hit", ctx));
    },
  );

  it("given razor-fang attacker with damage = 0, " + "when on-hit, then NO_ACTIVATION", () => {
    // Source: Showdown data/items.ts — Razor Fang: damage guard check before RNG
    const ctx = createItemContext({ heldItem: itemIds.razorFang, damage: 0 });
    expectNoActivation(applyGen8HeldItem("on-hit", ctx));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 6: handleOnContact — false branches
// ─────────────────────────────────────────────────────────────────────────────

describe("handleOnContact — NO_ACTIVATION paths", () => {
  it(
    "given rocky-helmet defender and a non-contact move, " + "when on-contact, then NO_ACTIVATION",
    () => {
      // Source: Showdown data/items.ts — Rocky Helmet onDamagingHit: contact flag required
      const ctx = createItemContext({
        heldItem: itemIds.rockyHelmet,
        move: createCanonicalMove(moveIds.surf),
      });
      expectNoActivation(applyGen8HeldItem("on-contact", ctx));
    },
  );

  it(
    "given rocky-helmet defender with a contact move but no opponent in state, " +
      "when on-contact, then NO_ACTIVATION (attacker HP cannot be resolved)",
    () => {
      // Source: Gen8Items.ts getOpponentMaxHp — returns null when context.opponent is
      //   undefined and pokemon cannot be found in state.sides; callers skip activation
      // The state.sides have empty active arrays and the pokemon is not in sides,
      // so getOpponentMaxHp returns null.
      const ctx = {
        pokemon: createOnFieldPokemon({ heldItem: itemIds.rockyHelmet }),
        state: createBattleState(),
        rng: createRng(),
        move: createCanonicalMove(moveIds.tackle),
        opponent: undefined,
      } as ItemContext;
      expectNoActivation(applyGen8HeldItem("on-contact", ctx));
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 7: Positive activation cases (cover the true branch of the same arms)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleEndOfTurn — activation (true branches)", () => {
  it(
    "given toxic-orb and normal type with no status, " +
      "when end-of-turn, then activates and inflicts badly-poisoned",
    () => {
      // Source: Showdown data/items.ts — Toxic Orb inflicts badly-poisoned at end of turn
      // Source: Gen8Items.ts line ~851 — effects: [{ type: "inflict-status", status: "badly-poisoned" }]
      const ctx = createItemContext({ heldItem: itemIds.toxicOrb, types: [typeIds.normal] });
      const result = applyGen8HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "inflict-status", target: "self", status: statusIds.badlyPoisoned },
      ]);
    },
  );

  it(
    "given flame-orb and normal type with no status, " +
      "when end-of-turn, then activates and inflicts burn",
    () => {
      // Source: Showdown data/items.ts — Flame Orb inflicts burn at end of turn
      // Source: Gen8Items.ts line ~866 — effects: [{ type: "inflict-status", status: "burn" }]
      const ctx = createItemContext({ heldItem: itemIds.flameOrb, types: [typeIds.normal] });
      const result = applyGen8HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "inflict-status", target: "self", status: statusIds.burn },
      ]);
    },
  );

  it(
    "given sitrus-berry holder at 40% HP (80/200), " +
      "when end-of-turn, then activates and heals floor(200/4)=50 HP",
    () => {
      // Source: Showdown data/items.ts — Sitrus Berry heals 1/4 HP when at <= 50% HP
      // 80/200 = 40% HP, below 50% threshold. healAmount = floor(200/4) = 50
      // Source: Gen8Items.ts line ~877 — effects: [{ type: "heal", value: 50 }, { type: "consume" }]
      const ctx = createItemContext({ heldItem: itemIds.sitrusBerry, hp: 200, currentHp: 80 });
      const result = applyGen8HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "heal", target: "self", value: 50 },
        { type: "consume", target: "self", value: itemIds.sitrusBerry },
      ]);
    },
  );

  it(
    "given cheri-berry holder with paralysis, " +
      "when end-of-turn, then activates and cures paralysis",
    () => {
      // Source: Showdown data/items.ts — Cheri Berry cures paralysis at end of turn
      // Source: Gen8Items.ts line ~932 — effects: [{ type: "status-cure" }, { type: "consume" }]
      const ctx = createItemContext({ heldItem: itemIds.cheriBerry, status: statusIds.paralysis });
      const result = applyGen8HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "status-cure", target: "self" },
        { type: "consume", target: "self", value: itemIds.cheriBerry },
      ]);
    },
  );
});

describe("handleOnHit — activation (true branches)", () => {
  it(
    "given kings-rock attacker with damage > 0 and RNG returns true, " +
      "when on-hit, then activates with flinch effect on opponent",
    () => {
      // Source: Showdown data/items.ts — King's Rock: 10% flinch chance on damaging hits
      // Source: Gen8Items.ts line ~1518 — effects: [{ type: "flinch", target: "opponent" }]
      const ctx = createItemContext({ heldItem: itemIds.kingsRock, damage: 50, rng: createRng(true) });
      const result = applyGen8HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "flinch", target: "opponent" }]);
    },
  );

  it(
    "given shell-bell attacker with damage = 80, " +
      "when on-hit, then activates and heals floor(80/8)=10 HP",
    () => {
      // Source: Showdown data/items.ts — Shell Bell heals floor(damageDealt/8)
      // floor(80/8) = 10 HP heal
      // Source: Gen8Items.ts line ~1552 — effects: [{ type: "heal", target: "self", value: 10 }]
      const ctx = createItemContext({ heldItem: itemIds.shellBell, damage: 80 });
      const result = applyGen8HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "heal", target: "self", value: 10 }]);
    },
  );
});

describe("handleOnDamageTaken — activation (true branches)", () => {
  it(
    "given kee-berry and a physical move with damage > 0, " +
      "when on-damage-taken, then activates with +1 Defense stat-boost and consume",
    () => {
      // Source: Showdown data/items.ts — Kee Berry raises Defense when hit by physical move
      // Source: Gen8Items.ts line ~1394 — effects: [{ type: "stat-boost", value: "defense" }, consume]
      const ctx = createItemContext({
        heldItem: itemIds.keeBerry,
        damage: 50,
        move: createCanonicalMove(moveIds.tackle),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "defense" },
        { type: "consume", target: "self", value: itemIds.keeBerry },
      ]);
    },
  );

  it(
    "given maranga-berry and a special move with damage > 0, " +
      "when on-damage-taken, then activates with +1 SpDef stat-boost and consume",
    () => {
      // Source: Showdown data/items.ts — Maranga Berry raises SpDef when hit by special move
      // Source: Gen8Items.ts line ~1410 — effects: [{ type: "stat-boost", value: "spDefense" }, consume]
      const ctx = createItemContext({
        heldItem: itemIds.marangaBerry,
        damage: 50,
        move: createCanonicalMove(moveIds.surf),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "spDefense" },
        { type: "consume", target: "self", value: itemIds.marangaBerry },
      ]);
    },
  );

  it(
    "given absorb-bulb and a water move with damage > 0, " +
      "when on-damage-taken, then activates with +1 SpAtk stat-boost and consume",
    () => {
      // Source: Showdown data/items.ts — Absorb Bulb raises SpAtk when hit by Water move
      // Source: Gen8Items.ts line ~1338 — effects: [{ type: "stat-boost", value: "spAttack" }, consume]
      const ctx = createItemContext({
        heldItem: itemIds.absorbBulb,
        damage: 50,
        move: createCanonicalMove(moveIds.surf),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "spAttack" },
        { type: "consume", target: "self", value: itemIds.absorbBulb },
      ]);
    },
  );

  it(
    "given snowball and an ice move with damage > 0, " +
      "when on-damage-taken, then activates with +1 Attack stat-boost and consume",
    () => {
      // Source: Showdown data/items.ts — Snowball raises Attack when hit by Ice move
      // Source: Gen8Items.ts line ~1441 — effects: [{ type: "stat-boost", value: "attack" }, consume]
      const ctx = createItemContext({
        heldItem: itemIds.snowball,
        damage: 50,
        move: createCanonicalMove(moveIds.iceBeam),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "attack" },
        { type: "consume", target: "self", value: itemIds.snowball },
      ]);
    },
  );

  it(
    "given weakness-policy and water-type holder hit by electric move (2x SE), " +
      "when on-damage-taken, then activates with +2 Atk and +2 SpAtk and consume",
    () => {
      // Source: Showdown data/items.ts — Weakness Policy triggers on >= 2x effectiveness
      // Electric vs Water = 2x super-effective
      // Source: Gen8Items.ts line ~1376 — effects: [{ stat-boost Atk +2 }, { stat-boost SpAtk +2 }, consume]
      const ctx = createItemContext({
        heldItem: itemIds.weaknessPolicy,
        types: [typeIds.water],
        damage: 50,
        move: createCanonicalMove(moveIds.thunderbolt),
      });
      const result = applyGen8HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "stat-boost", target: "self", value: "attack", stages: 2 },
        { type: "stat-boost", target: "self", value: "spAttack", stages: 2 },
        { type: "consume", target: "self", value: itemIds.weaknessPolicy },
      ]);
    },
  );
});
