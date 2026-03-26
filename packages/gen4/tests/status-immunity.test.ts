import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createFriendship,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager, GEN4_ABILITY_IDS, GEN4_NATURE_IDS, GEN4_SPECIES_IDS } from "../src";
import {
  canInflictGen4Status,
  isStatusBlockedByAbility,
  isVolatileBlockedByAbility,
} from "../src/Gen4MoveEffects";

/**
 * Gen 4 Status Immunity Tests — ability-based status and volatile immunities
 *
 * Covers:
 *   Primary status immunities:
 *     - Immunity: blocks poison, badly-poisoned
 *     - Insomnia: blocks sleep
 *     - Vital Spirit: blocks sleep
 *     - Limber: blocks paralysis
 *     - Water Veil: blocks burn
 *     - Magma Armor: blocks freeze
 *
 *   Volatile status immunities:
 *     - Inner Focus: blocks flinch
 *     - Own Tempo: blocks confusion
 *     - Oblivious: blocks infatuation
 *
 * Source: Showdown sim/abilities.ts Gen 4 mod
 * Source: Bulbapedia — individual ability pages
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const STATUS_IDS = CORE_STATUS_IDS;
const TYPE_IDS = CORE_TYPE_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const DEFAULT_SPECIES = dataManager.getSpecies(GEN4_SPECIES_IDS.bibarel);
const DEFAULT_NATURE = dataManager.getNature(GEN4_NATURE_IDS.hardy).id;
const DEFAULT_LEVEL = 50;
const DEFAULT_HP = 200;

function createSyntheticOnFieldPokemon(opts: {
  ability?: string;
  types?: PokemonType[];
  status?: PrimaryStatus | null;
}): ActivePokemon {
  const pokemon = createPokemonInstance(DEFAULT_SPECIES, DEFAULT_LEVEL, new SeededRandom(4), {
    nature: DEFAULT_NATURE,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    friendship: createFriendship(0),
    pokeball: CORE_ITEM_IDS.pokeBall,
  });

  pokemon.currentHp = DEFAULT_HP;
  pokemon.status = opts.status ?? null;
  pokemon.calculatedStats = {
    hp: DEFAULT_HP,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  if (opts.ability != null) {
    pokemon.ability = opts.ability;
  }

  const onFieldPokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    opts.types ? [...opts.types] : [...DEFAULT_SPECIES.types],
  );
  if (opts.ability != null) {
    onFieldPokemon.ability = opts.ability;
  }
  return onFieldPokemon;
}

// ===========================================================================
// isStatusBlockedByAbility — unit tests
// ===========================================================================

describe("isStatusBlockedByAbility", () => {
  it("given Immunity target, when checking poison, then returns true", () => {
    // Source: Bulbapedia — Immunity: prevents the Pokemon from being poisoned
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.immunity });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.poison)).toBe(true);
  });

  it("given Immunity target, when checking badly-poisoned, then returns true", () => {
    // Source: Bulbapedia — Immunity: prevents all forms of poison
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.immunity });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.badlyPoisoned)).toBe(true);
  });

  it("given Immunity target, when checking burn, then returns false", () => {
    // Source: Bulbapedia — Immunity: only blocks poison, not other statuses
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.immunity });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.burn)).toBe(false);
  });

  it("given Insomnia target, when checking sleep, then returns true", () => {
    // Source: Bulbapedia — Insomnia: prevents the Pokemon from falling asleep
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.insomnia });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.sleep)).toBe(true);
  });

  it("given Vital Spirit target, when checking sleep, then returns true", () => {
    // Source: Bulbapedia — Vital Spirit: prevents the Pokemon from falling asleep
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.vitalSpirit });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.sleep)).toBe(true);
  });

  it("given Limber target, when checking paralysis, then returns true", () => {
    // Source: Bulbapedia — Limber: prevents the Pokemon from being paralyzed
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.limber });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.paralysis)).toBe(true);
  });

  it("given Water Veil target, when checking burn, then returns true", () => {
    // Source: Bulbapedia — Water Veil: prevents the Pokemon from being burned
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.waterVeil });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.burn)).toBe(true);
  });

  it("given Magma Armor target, when checking freeze, then returns true", () => {
    // Source: Bulbapedia — Magma Armor: prevents the Pokemon from being frozen
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.magmaArmor });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.freeze)).toBe(true);
  });

  it("given a Pokemon with no special ability, when checking any status, then returns false", () => {
    // Verify that non-immunity abilities don't block statuses
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.blaze });
    expect(isStatusBlockedByAbility(target, STATUS_IDS.poison)).toBe(false);
    expect(isStatusBlockedByAbility(target, STATUS_IDS.sleep)).toBe(false);
    expect(isStatusBlockedByAbility(target, STATUS_IDS.burn)).toBe(false);
  });
});

// ===========================================================================
// canInflictGen4Status — integration with ability immunities
// ===========================================================================

describe("canInflictGen4Status — ability immunity integration", () => {
  it("given Immunity target with no existing status, when checking poison infliction, then returns false", () => {
    // Source: Bulbapedia — Immunity blocks poison even if the target has no status
    // Source: Showdown Gen 4 mod — ability immunity check in canInflictStatus
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.immunity });
    expect(canInflictGen4Status(STATUS_IDS.poison, target)).toBe(false);
  });

  it("given Immunity target with no existing status, when checking badly-poisoned, then returns false", () => {
    // Source: Bulbapedia — Immunity blocks both regular and bad poison
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.immunity });
    expect(canInflictGen4Status(STATUS_IDS.badlyPoisoned, target)).toBe(false);
  });

  it("given Insomnia target with no existing status, when checking sleep infliction, then returns false", () => {
    // Source: Bulbapedia — Insomnia prevents sleep
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.insomnia });
    expect(canInflictGen4Status(STATUS_IDS.sleep, target)).toBe(false);
  });

  it("given Vital Spirit target with no existing status, when checking sleep infliction, then returns false", () => {
    // Source: Bulbapedia — Vital Spirit prevents sleep
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.vitalSpirit });
    expect(canInflictGen4Status(STATUS_IDS.sleep, target)).toBe(false);
  });

  it("given Limber target with no existing status, when checking paralysis infliction, then returns false", () => {
    // Source: Bulbapedia — Limber prevents paralysis
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.limber });
    expect(canInflictGen4Status(STATUS_IDS.paralysis, target)).toBe(false);
  });

  it("given Water Veil target with no existing status, when checking burn infliction, then returns false", () => {
    // Source: Bulbapedia — Water Veil prevents burn
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.waterVeil });
    expect(canInflictGen4Status(STATUS_IDS.burn, target)).toBe(false);
  });

  it("given Magma Armor target with no existing status, when checking freeze infliction, then returns false", () => {
    // Source: Bulbapedia — Magma Armor prevents freeze
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.magmaArmor });
    expect(canInflictGen4Status(STATUS_IDS.freeze, target)).toBe(false);
  });

  it("given a target with no immunity ability, when checking poison, then returns true (status can be inflicted)", () => {
    // Verify that the base case still works — non-immune targets are still vulnerable
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.blaze });
    expect(canInflictGen4Status(STATUS_IDS.poison, target)).toBe(true);
  });

  it("given Immunity target, when checking burn, then returns true (Immunity only blocks poison)", () => {
    // Source: Bulbapedia — Immunity: only prevents poison, not other statuses
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.immunity });
    expect(canInflictGen4Status(STATUS_IDS.burn, target)).toBe(true);
  });

  it("given Limber target, when checking sleep, then returns true (Limber only blocks paralysis)", () => {
    // Source: Bulbapedia — Limber: only prevents paralysis
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.limber });
    expect(canInflictGen4Status(STATUS_IDS.sleep, target)).toBe(true);
  });

  // Verify type immunity still takes priority
  it("given Fire-type target with no special ability, when checking burn, then returns false (type immunity)", () => {
    // Source: Bulbapedia — Fire types are immune to burn (type-based)
    const target = createSyntheticOnFieldPokemon({
      ability: ABILITIES.blaze,
      types: [TYPE_IDS.fire],
    });
    expect(canInflictGen4Status(STATUS_IDS.burn, target)).toBe(false);
  });

  // Verify existing status still blocks
  it("given already-poisoned target with Limber, when checking paralysis, then returns false (already has status)", () => {
    // canInflictGen4Status checks existing status first, then type, then ability
    const target = createSyntheticOnFieldPokemon({
      ability: ABILITIES.limber,
      status: STATUS_IDS.poison,
    });
    expect(canInflictGen4Status(STATUS_IDS.paralysis, target)).toBe(false);
  });
});

// ===========================================================================
// isVolatileBlockedByAbility — unit tests
// ===========================================================================

describe("isVolatileBlockedByAbility", () => {
  it("given Inner Focus target, when checking flinch, then returns true", () => {
    // Source: Bulbapedia — Inner Focus: prevents flinching
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.innerFocus });
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.flinch)).toBe(true);
  });

  it("given Inner Focus target, when checking confusion, then returns false", () => {
    // Source: Bulbapedia — Inner Focus: only blocks flinch
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.innerFocus });
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.confusion)).toBe(false);
  });

  it("given Own Tempo target, when checking confusion, then returns true", () => {
    // Source: Bulbapedia — Own Tempo: prevents confusion
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.ownTempo });
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.confusion)).toBe(true);
  });

  it("given Own Tempo target, when checking flinch, then returns false", () => {
    // Source: Bulbapedia — Own Tempo: only blocks confusion
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.ownTempo });
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.flinch)).toBe(false);
  });

  it("given Oblivious target, when checking infatuation, then returns true", () => {
    // Source: Bulbapedia — Oblivious: prevents infatuation
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.oblivious });
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.infatuation)).toBe(true);
  });

  it("given Oblivious target, when checking confusion, then returns false", () => {
    // Source: Bulbapedia — Oblivious: only blocks infatuation
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.oblivious });
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.confusion)).toBe(false);
  });

  it("given a Pokemon with no volatile-immunity ability, when checking any volatile, then returns false", () => {
    // Verify that normal abilities don't block volatiles
    const target = createSyntheticOnFieldPokemon({ ability: ABILITIES.static });
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.flinch)).toBe(false);
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.confusion)).toBe(false);
    expect(isVolatileBlockedByAbility(target, VOLATILE_IDS.infatuation)).toBe(false);
  });
});
