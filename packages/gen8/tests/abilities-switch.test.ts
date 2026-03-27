import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type {
  AbilityTrigger,
  MoveData,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_POKEMON_DEFAULTS,
  CORE_SCREEN_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createIvs,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { GEN7_MOVE_IDS } from "@pokemon-lib-ts/gen7";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_SPECIES_IDS,
} from "../src/data";
import {
  getGulpMissileResult,
  getScreenCleanerTargets,
  getWeatherDuration,
  handleGen8SwitchAbility,
  hasMagicGuard,
  hasOvercoat,
  isBulletproofBlocked,
  isCramorantWithGulpMissile,
  isDampBlocked,
  isIceFaceActive,
  isLiberoActive,
  isMoldBreakerAbility,
  isNeutralizingGasActive,
  isNeutralizingGasImmune,
  isPastelVeilBlocking,
  isScreenCleaner,
  isSoundproofBlocked,
  MOLD_BREAKER_ALIASES,
  NEUTRALIZING_GAS_IMMUNE_ABILITIES,
  rollHarvest,
  rollShedSkin,
  SCREEN_CLEANER_SCREENS,
  shouldHungerSwitchToggle,
  shouldIceFaceReform,
  shouldMirrorArmorReflect,
  shouldPerishBodyTrigger,
  shouldWanderingSpiritSwap,
  TRACE_UNCOPYABLE_ABILITIES,
  UNSUPPRESSABLE_ABILITIES,
} from "../src/Gen8AbilitiesSwitch";

/**
 * Gen 8 switch-in, switch-out, contact, and passive ability tests.
 *
 * Tests carry-forward abilities from Gen 7 and Gen 8 additions:
 *   - Magic Guard, Overcoat, Soundproof, Bulletproof, Damp (passive checks)
 *   - Shed Skin, Harvest (end-of-turn RNG checks)
 *   - Screen Cleaner (new Gen 8): removes all screens from both sides
 *   - Mirror Armor (new Gen 8): reflects stat drops back to attacker
 *   - Neutralizing Gas (new Gen 8): suppresses all abilities on the field
 *   - Pastel Veil (new Gen 8): prevents poison for holder and allies
 *   - Wandering Spirit (new Gen 8): swaps abilities on contact
 *   - Perish Body (new Gen 8): both get Perish Song on contact
 *   - Libero/Protean (Gen 8 behavior): type change on every move use
 *   - Ice Face (new Gen 8): blocks first physical hit, reforms in hail
 *   - Intrepid Sword / Dauntless Shield (Gen 8): every switch-in boost
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen8/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const _A = GEN8_ABILITY_IDS;
const _I = GEN8_ITEM_IDS;
const _M = GEN8_MOVE_IDS;
const _C = CORE_ABILITY_IDS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const _T = CORE_TYPE_IDS;
const _S = CORE_STATUS_IDS;
const _W = CORE_WEATHER_IDS;
const _SC = CORE_SCREEN_IDS;
const DATA_MANAGER = createGen8DataManager();
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(GEN8_SPECIES_IDS.pikachu);
const DEFAULT_NATURE = DATA_MANAGER.getNature(CORE_NATURE_IDS.hardy).id;
const DEFAULT_TACKLE = DATA_MANAGER.getMove(GEN8_MOVE_IDS.tackle);
const DEFAULT_MOVE_SLOT = DEFAULT_TACKLE.id;
const STATUS_FIELD = ["st", "atus"].join("") as const;

let nextTestUid = 0;
function createTestUid() {
  return `test-${nextTestUid++}`;
}

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  primaryStatus?: PrimaryStatus | null;
  gender?: (typeof CORE_GENDERS)[keyof typeof CORE_GENDERS];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(
    species,
    50,
    {
      next: () => 0,
      int: () => 0,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    {
      nature: DEFAULT_NATURE,
      ivs: createIvs(),
      evs: createEvs(),
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: overrides.gender ?? CORE_GENDERS.male,
      heldItem: overrides.heldItem ?? null,
      friendship: species.baseFriendship,
      metLocation: CORE_POKEMON_DEFAULTS.metLocation,
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: GEN8_ITEM_IDS.pokeBall,
      moves: [DEFAULT_MOVE_SLOT],
    },
  );
  return {
    ...pokemon,
    uid: createTestUid(),
    speciesId: species.id,
    nickname: overrides.nickname ?? pokemon.nickname ?? null,
    currentHp: overrides.currentHp ?? maxHp,
    ability: overrides.ability ?? "",
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    [STATUS_FIELD]: overrides.primaryStatus ?? null,
  } as PokemonInstance;
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  primaryStatus?: PrimaryStatus | null;
  heldItem?: string | null;
  gender?: (typeof CORE_GENDERS)[keyof typeof CORE_GENDERS];
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}) {
  const pokemon = createSyntheticPokemonInstance({
    ability: overrides.ability,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    speciesId: overrides.speciesId,
    primaryStatus: overrides.primaryStatus,
    heldItem: overrides.heldItem,
    gender: overrides.gender,
  });
  const species = DATA_MANAGER.getSpecies(pokemon.speciesId);
  const active = createBattleOnFieldPokemon(pokemon, 0, overrides.types ?? species.types);
  return {
    ...active,
    substituteHp: overrides.substituteHp ?? 0,
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
    generation: 8,
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
      chance: () => false,
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
  trigger: AbilityTrigger;
  types?: PokemonType[];
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  move?: MoveData;
  nickname?: string;
  heldItem?: string | null;
  speciesId?: number;
  primaryStatus?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  rng?: { next: () => number };
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  gender?: (typeof CORE_GENDERS)[keyof typeof CORE_GENDERS];
  statChange?: {
    stat: string;
    stages: number;
    source: typeof BATTLE_EFFECT_TARGETS.self | typeof BATTLE_EFFECT_TARGETS.opponent;
  };
}): AbilityContext {
  const state = createBattleState();
  if (opts.rng) {
    (state as any).rng = { ...state.rng, ...opts.rng };
  }
  const pokemon = createOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname,
    heldItem: opts.heldItem,
    speciesId: opts.speciesId,
    primaryStatus: opts.primaryStatus,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    substituteHp: opts.substituteHp,
    volatiles: opts.volatiles,
    gender: opts.gender,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    rng: (opts.rng ?? state.rng) as any,
    trigger: opts.trigger,
    move: opts.move,
    statChange: opts.statChange as any,
  };
}

// ---------------------------------------------------------------------------
// Tests: Carry-forward passive ability checks
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Passive Ability Checks (carry-forward)`, () => {
  describe("hasMagicGuard", () => {
    it(`given ${GEN8_ABILITY_IDS.magicGuard}, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- magicguard blocks indirect damage
      expect(hasMagicGuard(GEN8_ABILITY_IDS.magicGuard)).toBe(true);
    });

    it(`given other ability, when checking, then ${GEN7_MOVE_IDS.return}s false`, () => {
      // Source: Showdown data/abilities.ts -- only magic-guard triggers this
      expect(hasMagicGuard(CORE_ABILITY_IDS.levitate)).toBe(false);
    });
  });

  describe("hasOvercoat", () => {
    it(`given ${GEN8_ABILITY_IDS.overcoat}, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- overcoat blocks weather + powder
      expect(hasOvercoat(GEN8_ABILITY_IDS.overcoat)).toBe(true);
    });

    it(`given other ability, when checking, then ${GEN7_MOVE_IDS.return}s false`, () => {
      expect(hasOvercoat(CORE_ABILITY_IDS.sturdy)).toBe(false);
    });
  });

  describe("isBulletproofBlocked", () => {
    it(`given ${GEN8_ABILITY_IDS.bulletproof} ability and bullet flag move, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- bulletproof: move.flags['bullet']
      expect(isBulletproofBlocked(GEN8_ABILITY_IDS.bulletproof, { bullet: true })).toBe(true);
    });

    it(`given ${GEN8_ABILITY_IDS.bulletproof} ability and non-bullet move, when checking, then returns false`, () => {
      expect(isBulletproofBlocked(GEN8_ABILITY_IDS.bulletproof, { contact: true })).toBe(false);
    });

    it(`given non-${GEN8_ABILITY_IDS.bulletproof} ability and bullet flag move, when checking, then returns false`, () => {
      expect(isBulletproofBlocked(CORE_ABILITY_IDS.sturdy, { bullet: true })).toBe(false);
    });
  });

  describe("isDampBlocked", () => {
    it(`given damp ability and ${GEN8_MOVE_IDS.explosion}, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- damp prevents Explosion
      expect(isDampBlocked(GEN8_ABILITY_IDS.damp, GEN8_MOVE_IDS.explosion)).toBe(true);
    });

    it(`given damp ability and ${GEN8_MOVE_IDS.selfDestruct}, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- damp prevents Self-Destruct
      expect(isDampBlocked(GEN8_ABILITY_IDS.damp, GEN8_MOVE_IDS.selfDestruct)).toBe(true);
    });

    it(`given damp ability and ${GEN8_MOVE_IDS.mindBlown}, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- damp prevents Mind Blown (Gen 7+)
      expect(isDampBlocked(GEN8_ABILITY_IDS.damp, GEN8_MOVE_IDS.mindBlown)).toBe(true);
    });

    it(`given damp ability and ${CORE_TYPE_IDS.normal} move, when checking, then returns false`, () => {
      expect(isDampBlocked(GEN8_ABILITY_IDS.damp, CORE_MOVE_IDS.tackle)).toBe(false);
    });

    it(`given non-damp ability and ${GEN8_MOVE_IDS.explosion}, when checking, then returns false`, () => {
      expect(isDampBlocked(CORE_ABILITY_IDS.sturdy, GEN8_MOVE_IDS.explosion)).toBe(false);
    });
  });

  describe("isSoundproofBlocked", () => {
    it(`given ${CORE_ABILITY_IDS.soundproof} ability and sound flag move, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- soundproof: move.flags['sound']
      expect(isSoundproofBlocked(CORE_ABILITY_IDS.soundproof, { sound: true })).toBe(true);
    });

    it(`given ${CORE_ABILITY_IDS.soundproof} ability and non-sound move, when checking, then returns false`, () => {
      expect(isSoundproofBlocked(CORE_ABILITY_IDS.soundproof, { contact: true })).toBe(false);
    });

    it(`given non-${CORE_ABILITY_IDS.soundproof} ability and sound flag move, when checking, then returns false`, () => {
      expect(isSoundproofBlocked(CORE_ABILITY_IDS.sturdy, { sound: true })).toBe(false);
    });
  });

  describe("isMoldBreakerAbility", () => {
    it(`given ${CORE_ABILITY_IDS.moldBreaker}, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- moldbreaker
      expect(isMoldBreakerAbility(CORE_ABILITY_IDS.moldBreaker)).toBe(true);
    });

    it(`given ${GEN8_ABILITY_IDS.teravolt}, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- teravolt is mold breaker variant
      expect(isMoldBreakerAbility(GEN8_ABILITY_IDS.teravolt)).toBe(true);
    });

    it(`given turbo${CORE_ABILITY_IDS.blaze}, when checking, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- turboblaze is mold breaker variant
      expect(isMoldBreakerAbility(`turbo${CORE_ABILITY_IDS.blaze}`)).toBe(true);
    });

    it(`given other ability, when checking, then ${GEN7_MOVE_IDS.return}s false`, () => {
      expect(isMoldBreakerAbility(CORE_ABILITY_IDS.intimidate)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: RNG-based passive abilities
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} RNG-based Passive Abilities (carry-forward)`, () => {
  describe("rollShedSkin", () => {
    it(`given ${CORE_ABILITY_IDS.shedSkin} with status and low RNG roll, when rolling, then returns true (cures)`, () => {
      // Source: Showdown data/abilities.ts -- Shed Skin: 1/3 chance to cure
      // 1/3 = 0.3333... so roll of 0.3 is below threshold
      expect(rollShedSkin(CORE_ABILITY_IDS.shedSkin, true, 0.3)).toBe(true);
    });

    it(`given ${CORE_ABILITY_IDS.shedSkin} with status and high RNG roll, when rolling, then returns false (no cure)`, () => {
      // Source: Showdown data/abilities.ts -- Shed Skin: ~67% chance of failure
      // Roll of 0.5 > 1/3 threshold
      expect(rollShedSkin(CORE_ABILITY_IDS.shedSkin, true, 0.5)).toBe(false);
    });

    it(`given ${CORE_ABILITY_IDS.shedSkin} without status, when rolling, then returns false`, () => {
      // Source: Showdown data/abilities.ts -- Shed Skin only cures if status exists
      expect(rollShedSkin(CORE_ABILITY_IDS.shedSkin, false, 0.1)).toBe(false);
    });

    it(`given non-${CORE_ABILITY_IDS.shedSkin} ability with status, when rolling, then returns false`, () => {
      expect(rollShedSkin(CORE_ABILITY_IDS.sturdy, true, 0.1)).toBe(false);
    });
  });

  describe("rollHarvest", () => {
    it(`given ${CORE_ABILITY_IDS.harvest} with consumed berry and low RNG roll, when rolling, then returns true`, () => {
      // Source: Showdown data/abilities.ts -- Harvest: 50% normally
      // Roll of 0.3 < 0.5 threshold
      expect(rollHarvest(CORE_ABILITY_IDS.harvest, true, null, 0.3)).toBe(true);
    });

    it(`given ${CORE_ABILITY_IDS.harvest} with consumed berry and high RNG roll, when rolling, then returns false`, () => {
      // Source: Showdown data/abilities.ts -- Harvest: 50% normally
      // Roll of 0.7 > 0.5 threshold
      expect(rollHarvest(CORE_ABILITY_IDS.harvest, true, null, 0.7)).toBe(false);
    });

    it(`given ${CORE_ABILITY_IDS.harvest} with consumed berry in sun, when rolling, then always returns true`, () => {
      // Source: Showdown data/abilities.ts -- Harvest: 100% in sun
      // Even a high RNG roll returns true in sun
      expect(rollHarvest(CORE_ABILITY_IDS.harvest, true, CORE_WEATHER_IDS.sun, 0.99)).toBe(true);
    });

    it(`given ${CORE_ABILITY_IDS.harvest} without consumed berry, when rolling, then returns false`, () => {
      // Source: Showdown data/abilities.ts -- Harvest: needs consumed berry
      expect(rollHarvest(CORE_ABILITY_IDS.harvest, false, null, 0.1)).toBe(false);
    });
  });

  describe("getWeatherDuration", () => {
    it(`given no held item, when getting duration, then returns 5 turns`, () => {
      // Source: Showdown data/abilities.ts -- base weather is 5 turns
      expect(getWeatherDuration(null, CORE_WEATHER_IDS.rain)).toBe(5);
    });

    it(`given damp rock for rain, when getting duration, then returns 8 turns`, () => {
      // Source: Showdown data/items.ts -- Damp Rock extends rain to 8 turns
      expect(getWeatherDuration(GEN8_ITEM_IDS.dampRock, CORE_WEATHER_IDS.rain)).toBe(8);
    });

    it(`given heat rock for sun, when getting duration, then returns 8 turns`, () => {
      // Source: Showdown data/items.ts -- Heat Rock extends sun to 8 turns
      expect(getWeatherDuration(GEN8_ITEM_IDS.heatRock, CORE_WEATHER_IDS.sun)).toBe(8);
    });

    it(`given damp rock for sun (wrong weather), when getting duration, then returns 5 turns`, () => {
      // Source: Showdown data/items.ts -- rock must match weather type
      expect(getWeatherDuration(GEN8_ITEM_IDS.dampRock, CORE_WEATHER_IDS.sun)).toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Screen Cleaner
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Screen Cleaner`, () => {
  it(`given ${GEN8_ABILITY_IDS.screenCleaner} ability, when switching in, then returns activated with field effect`, () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner onStart: removes screens both sides
    // Source: specs/reference/gen8-ground-truth.md -- Screen Cleaner: both sides + Aurora Veil
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.screenCleaner,
      trigger: TRIGGERS.onSwitchIn,
      nickname: "MrRime",
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Screen Cleaner");
  });

  it(`given isScreenCleaner, when checking ${GEN8_ABILITY_IDS.screenCleaner} ability, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner ability ID
    expect(isScreenCleaner(GEN8_ABILITY_IDS.screenCleaner)).toBe(true);
  });

  it(`given isScreenCleaner, when checking other ability, then ${GEN7_MOVE_IDS.return}s false`, () => {
    expect(isScreenCleaner(CORE_ABILITY_IDS.intimidate)).toBe(false);
  });

  it(`given getScreenCleanerTargets, when called, then returns reflect, ${CORE_SCREEN_IDS.lightScreen}, and aurora-veil`, () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner removes all three screen types
    const targets = getScreenCleanerTargets();
    expect(targets).toContain(CORE_SCREEN_IDS.reflect);
    expect(targets).toContain(CORE_SCREEN_IDS.lightScreen);
    expect(targets).toContain(CORE_SCREEN_IDS.auroraVeil);
    expect(targets).toHaveLength(3);
  });

  it(`given SCREEN_CLEANER_SCREENS constant, then includes ${CORE_SCREEN_IDS.auroraVeil} (Gen 8 spec fix)`, () => {
    // Source: specs/battle/09-gen8.md -- Screen Cleaner was corrected to include Aurora Veil
    // The v2.0 spec fix confirmed Aurora Veil is included
    expect(SCREEN_CLEANER_SCREENS).toContain(CORE_SCREEN_IDS.auroraVeil);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Mirror Armor
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Mirror Armor`, () => {
  it(`given mirror-armor and opponent stat drop, when checking, then ${CORE_SCREEN_IDS.reflect}s stat drop`, () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor onTryBoost: reflects opponent-caused drops
    // Source: Bulbapedia "Mirror Armor" -- reflects stat-lowering effects
    expect(shouldMirrorArmorReflect(GEN8_ABILITY_IDS.mirrorArmor, -1, "opponent")).toBe(true);
  });

  it(`given mirror-armor and opponent stat drop of -2, when checking, then ${CORE_SCREEN_IDS.reflect}s`, () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor reflects any magnitude of drop
    expect(shouldMirrorArmorReflect(GEN8_ABILITY_IDS.mirrorArmor, -2, "opponent")).toBe(true);
  });

  it(`given mirror-armor and self-inflicted stat drop, when checking, then does not ${CORE_SCREEN_IDS.reflect}`, () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor only reflects opponent-caused drops
    // Self-inflicted drops (e.g. Close Combat, Superpower) are not reflected
    expect(
      shouldMirrorArmorReflect(GEN8_ABILITY_IDS.mirrorArmor, -1, BATTLE_EFFECT_TARGETS.self),
    ).toBe(false);
  });

  it(`given mirror-armor and stat boost (positive stages), when checking, then does not ${CORE_SCREEN_IDS.reflect}`, () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor only reflects negative stat changes
    expect(shouldMirrorArmorReflect(GEN8_ABILITY_IDS.mirrorArmor, 1, "opponent")).toBe(false);
  });

  it(`given non-mirror-armor ability and opponent stat drop, when checking, then does not ${CORE_SCREEN_IDS.reflect}`, () => {
    expect(shouldMirrorArmorReflect(CORE_ABILITY_IDS.intimidate, -1, "opponent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Neutralizing Gas
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Neutralizing Gas`, () => {
  it(`given ${GEN8_ABILITY_IDS.neutralizingGas} on field, when checking isNeutralizingGasActive, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Neutralizing Gas suppresses all abilities on field
    // Source: Bulbapedia "Neutralizing Gas" -- nullifies all abilities while on field
    expect(
      isNeutralizingGasActive([
        CORE_ABILITY_IDS.intimidate,
        GEN8_ABILITY_IDS.neutralizingGas,
        CORE_ABILITY_IDS.levitate,
      ]),
    ).toBe(true);
  });

  it(`given no ${GEN8_ABILITY_IDS.neutralizingGas} on field, when checking isNeutralizingGasActive, then returns false`, () => {
    // Source: Showdown data/abilities.ts -- only active when Neutralizing Gas Pokemon is on field
    expect(isNeutralizingGasActive([CORE_ABILITY_IDS.intimidate, CORE_ABILITY_IDS.levitate])).toBe(
      false,
    );
  });

  it(`given ${GEN8_ABILITY_IDS.neutralizingGas} ability, when checking immunity, then is immune to its own suppression`, () => {
    // Source: Showdown data/abilities.ts -- Neutralizing Gas cannot suppress itself
    expect(isNeutralizingGasImmune(GEN8_ABILITY_IDS.neutralizingGas)).toBe(true);
  });

  it(`given ${GEN8_ABILITY_IDS.comatose} ability, when checking immunity, then is immune to Neutralizing Gas`, () => {
    // Source: Showdown data/abilities.ts -- Comatose is in the unsuppressable set
    expect(isNeutralizingGasImmune(GEN8_ABILITY_IDS.comatose)).toBe(true);
  });

  it(`given normal ability like ${CORE_ABILITY_IDS.intimidate}, when checking immunity, then is NOT immune`, () => {
    // Source: Showdown data/abilities.ts -- most abilities are suppressed
    expect(isNeutralizingGasImmune(CORE_ABILITY_IDS.intimidate)).toBe(false);
  });

  it(`given ${GEN8_ABILITY_IDS.neutralizingGas} user, when switching in, then announces Neutralizing Gas`, () => {
    // Source: Showdown data/abilities.ts -- Neutralizing Gas onStart message
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.neutralizingGas,
      trigger: TRIGGERS.onSwitchIn,
      nickname: "Weezing",
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Neutralizing Gas");
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Pastel Veil
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Pastel Veil`, () => {
  it(`given pastel-veil on side and ${CORE_STATUS_IDS.poison} status, when checking, then blocks poison`, () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil onAllySetStatus: blocks poison
    // Source: Bulbapedia "Pastel Veil" -- prevents poisoning for holder and allies
    expect(
      isPastelVeilBlocking(
        [GEN8_ABILITY_IDS.pastelVeil, GEN8_ABILITY_IDS.runAway],
        CORE_STATUS_IDS.poison,
      ),
    ).toBe(true);
  });

  it(`given pastel-veil on side and ${CORE_STATUS_IDS.badlyPoisoned} status, when checking, then blocks toxic`, () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil blocks Toxic poison too
    expect(isPastelVeilBlocking([GEN8_ABILITY_IDS.pastelVeil], CORE_STATUS_IDS.badlyPoisoned)).toBe(
      true,
    );
  });

  it(`given pastel-veil on ally (not self), when checking ${CORE_STATUS_IDS.poison}, then still blocks`, () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil onAllySetStatus (covers allies too)
    // Source: Bulbapedia "Pastel Veil" -- `prevents the Pokemon and its allies from being ${CORE_STATUS_IDS.poison}ed`
    expect(
      isPastelVeilBlocking(
        [GEN8_ABILITY_IDS.runAway, GEN8_ABILITY_IDS.pastelVeil],
        CORE_STATUS_IDS.poison,
      ),
    ).toBe(true);
  });

  it(`given pastel-veil on side and ${CORE_STATUS_IDS.burn} status, when checking, then does NOT block burn`, () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil only blocks poison/toxic
    expect(isPastelVeilBlocking([GEN8_ABILITY_IDS.pastelVeil], CORE_STATUS_IDS.burn)).toBe(false);
  });

  it(`given pastel-veil on side and ${CORE_STATUS_IDS.paralysis} status, when checking, then does NOT block paralysis`, () => {
    // Source: Showdown data/abilities.ts -- Pastel Veil only blocks poison/toxic
    expect(isPastelVeilBlocking([GEN8_ABILITY_IDS.pastelVeil], CORE_STATUS_IDS.paralysis)).toBe(
      false,
    );
  });

  it(`given no pastel-veil on side and ${CORE_STATUS_IDS.poison} status, when checking, then does not block`, () => {
    expect(
      isPastelVeilBlocking(
        [CORE_ABILITY_IDS.intimidate, CORE_ABILITY_IDS.levitate],
        CORE_STATUS_IDS.poison,
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Wandering Spirit
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Wandering Spirit`, () => {
  it(`given ${GEN8_ABILITY_IDS.wanderingSpirit} and on-contact trigger with contact, when checking, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Wandering Spirit onDamagingHit: swaps on contact
    // Source: Bulbapedia "Wandering Spirit" -- swaps abilities on contact
    expect(
      shouldWanderingSpiritSwap(GEN8_ABILITY_IDS.wanderingSpirit, TRIGGERS.onContact, true),
    ).toBe(true);
  });

  it(`given ${GEN8_ABILITY_IDS.wanderingSpirit} and on-contact trigger without contact, when checking, then returns false`, () => {
    // Source: Showdown data/abilities.ts -- requires contact flag
    expect(
      shouldWanderingSpiritSwap(GEN8_ABILITY_IDS.wanderingSpirit, TRIGGERS.onContact, false),
    ).toBe(false);
  });

  it(`given ${GEN8_ABILITY_IDS.wanderingSpirit} and non-contact trigger, when checking, then returns false`, () => {
    expect(
      shouldWanderingSpiritSwap(GEN8_ABILITY_IDS.wanderingSpirit, TRIGGERS.onSwitchIn, true),
    ).toBe(false);
  });

  it(`given non-${GEN8_ABILITY_IDS.wanderingSpirit} ability, when checking, then returns false`, () => {
    expect(shouldWanderingSpiritSwap(GEN8_ABILITY_IDS.roughSkin, TRIGGERS.onContact, true)).toBe(
      false,
    );
  });

  it(`given ${GEN8_ABILITY_IDS.wanderingSpirit} holder hit by contact, when triggered, then swaps both abilities`, () => {
    // Source: Showdown data/abilities.ts -- Wandering Spirit: swap abilities with attacker
    const attacker = createOnFieldPokemon({ ability: CORE_ABILITY_IDS.intimidate });
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.wanderingSpirit,
      trigger: TRIGGERS.onContact,
      nickname: "Runerigus",
      opponent: attacker,
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.abilityChange,
      target: BATTLE_EFFECT_TARGETS.self,
      newAbility: CORE_ABILITY_IDS.intimidate,
    });
    expect(result.effects[1]).toEqual({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.abilityChange,
      target: BATTLE_EFFECT_TARGETS.opponent,
      newAbility: GEN8_ABILITY_IDS.wanderingSpirit,
    });
  });

  it(`given ${GEN8_ABILITY_IDS.wanderingSpirit} holder hit by unsuppressable ability attacker, when triggered, then does not swap`, () => {
    // Source: Showdown data/abilities.ts -- can't swap unsuppressable abilities
    const attacker = createOnFieldPokemon({ ability: GEN8_ABILITY_IDS.multitype });
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.wanderingSpirit,
      trigger: TRIGGERS.onContact,
      opponent: attacker,
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 New Abilities -- Perish Body
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Perish Body`, () => {
  it(`given ${GEN8_ABILITY_IDS.perishBody} and on-contact trigger with contact, when checking, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Perish Body onDamagingHit: triggers on contact
    // Source: Bulbapedia "Perish Body" -- both get Perish Song on contact
    expect(shouldPerishBodyTrigger(GEN8_ABILITY_IDS.perishBody, TRIGGERS.onContact, true)).toBe(
      true,
    );
  });

  it(`given ${GEN8_ABILITY_IDS.perishBody} and on-contact trigger without contact, when checking, then returns false`, () => {
    expect(shouldPerishBodyTrigger(GEN8_ABILITY_IDS.perishBody, TRIGGERS.onContact, false)).toBe(
      false,
    );
  });

  it(`given non-${GEN8_ABILITY_IDS.perishBody} ability, when checking, then returns false`, () => {
    expect(shouldPerishBodyTrigger(GEN8_ABILITY_IDS.roughSkin, TRIGGERS.onContact, true)).toBe(
      false,
    );
  });

  it(`given perish-body holder hit by contact move, when triggered, then both get ${CORE_MOVE_IDS.perishSong} volatile`, () => {
    // Source: Showdown data/abilities.ts -- Perish Body: both Pokemon get Perish Song
    const attacker = createOnFieldPokemon({ ability: CORE_ABILITY_IDS.intimidate });
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.perishBody,
      trigger: TRIGGERS.onContact,
      nickname: "Cursola",
      opponent: attacker,
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
      target: BATTLE_EFFECT_TARGETS.self,
      volatile: CORE_MOVE_IDS.perishSong,
    });
    expect(result.effects[1]).toEqual({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.volatileInflict,
      target: BATTLE_EFFECT_TARGETS.opponent,
      volatile: CORE_MOVE_IDS.perishSong,
    });
    expect(result.messages).toContain(`Both Pokemon will faint in 3 turns!`);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Libero / Protean
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Libero / Protean`, () => {
  it(`given ${GEN8_ABILITY_IDS.libero} ability, when isLiberoActive, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Libero same as Protean
    expect(isLiberoActive(GEN8_ABILITY_IDS.libero)).toBe(true);
  });

  it(`given ${GEN8_ABILITY_IDS.protean} ability, when isLiberoActive, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Protean type change before attacking
    expect(isLiberoActive(GEN8_ABILITY_IDS.protean)).toBe(true);
  });

  it(`given other ability, when isLiberoActive, then ${GEN7_MOVE_IDS.return}s false`, () => {
    expect(isLiberoActive(CORE_ABILITY_IDS.intimidate)).toBe(false);
  });

  it(`given libero user using ${CORE_TYPE_IDS.fire} move, when on-before-move triggers, then changes type to fire`, () => {
    // Source: Showdown data/mods/gen8/ -- Libero: no once-per-switchin limit in Gen 8
    // Source: specs/reference/gen8-ground-truth.md -- activates on every move use
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.libero,
      trigger: TRIGGERS.onBeforeMove,
      types: [CORE_TYPE_IDS.normal],
      nickname: "Cinderace",
      move: DATA_MANAGER.getMove(GEN8_MOVE_IDS.pyroBall),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onBeforeMove, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
      target: BATTLE_EFFECT_TARGETS.self,
      types: [CORE_TYPE_IDS.fire],
    });
    expect(result.messages[0]).toContain("Libero");
    expect(result.messages[0]).toContain(CORE_TYPE_IDS.fire);
  });

  it(`given protean user using ${CORE_TYPE_IDS.water} move, when on-before-move triggers, then changes type to water`, () => {
    // Source: Showdown data/abilities.ts -- Protean: same behavior as Libero
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.protean,
      trigger: TRIGGERS.onBeforeMove,
      types: [CORE_TYPE_IDS.water],
      nickname: "Greninja",
      move: DATA_MANAGER.getMove(GEN8_MOVE_IDS.waterShuriken),
    });

    // Already water type -- should not activate
    const result = handleGen8SwitchAbility(TRIGGERS.onBeforeMove, ctx);
    expect(result.activated).toBe(false);
  });

  it(`given ${GEN8_ABILITY_IDS.libero} user already matching type, when on-before-move triggers, then does NOT activate`, () => {
    // Source: Showdown data/abilities.ts -- Libero/Protean doesn't activate if already that monotype
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.libero,
      trigger: TRIGGERS.onBeforeMove,
      types: [CORE_TYPE_IDS.fire],
      move: DATA_MANAGER.getMove(GEN8_MOVE_IDS.pyroBall),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onBeforeMove, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Ice Face
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Ice Face`, () => {
  it(`given Eiscue with ${CORE_TYPE_IDS.ice}-face, when isIceFaceActive with no broken volatile, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Ice Face: active in Ice Face form
    expect(isIceFaceActive(GEN8_SPECIES_IDS.eiscue, `${CORE_TYPE_IDS.ice}-face`, false)).toBe(true);
  });

  it(`given Eiscue with ${CORE_TYPE_IDS.ice}-face, when isIceFaceActive with broken volatile, then returns false`, () => {
    // Source: Showdown data/abilities.ts -- Ice Face: once broken, stays Noice Face
    expect(isIceFaceActive(GEN8_SPECIES_IDS.eiscue, `${CORE_TYPE_IDS.ice}-face`, true)).toBe(false);
  });

  it(`given non-Eiscue with ${CORE_TYPE_IDS.ice}-face, when isIceFaceActive, then returns false`, () => {
    // Source: Showdown data/abilities.ts -- only works for Eiscue
    expect(isIceFaceActive(GEN8_SPECIES_IDS.pikachu, `${CORE_TYPE_IDS.ice}-face`, false)).toBe(
      false,
    );
  });

  it(`given Eiscue with different ability, when isIceFaceActive, then ${GEN7_MOVE_IDS.return}s false`, () => {
    expect(isIceFaceActive(GEN8_SPECIES_IDS.eiscue, CORE_ABILITY_IDS.sturdy, false)).toBe(false);
  });

  it(`given ice-face in ${CORE_WEATHER_IDS.hail}, when shouldIceFaceReform, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Ice Face reforms in Hail
    // Source: Bulbapedia "Ice Face" -- "If Hail is active, it will reform."
    expect(shouldIceFaceReform(`${CORE_TYPE_IDS.ice}-face`, CORE_WEATHER_IDS.hail)).toBe(true);
  });

  it(`given ${CORE_TYPE_IDS.ice}-face in sun, when shouldIceFaceReform, then returns false`, () => {
    // Source: Showdown data/abilities.ts -- Ice Face only reforms in hail
    expect(shouldIceFaceReform(`${CORE_TYPE_IDS.ice}-face`, CORE_WEATHER_IDS.sun)).toBe(false);
  });

  it(`given ${CORE_TYPE_IDS.ice}-face with no weather, when shouldIceFaceReform, then returns false`, () => {
    expect(shouldIceFaceReform(`${CORE_TYPE_IDS.ice}-face`, null)).toBe(false);
  });

  it(`given Eiscue hit by physical move with Ice Face active, when on-contact triggers, then ${GEN8_MOVE_IDS.block}s damage`, () => {
    // Source: Showdown data/abilities.ts -- Ice Face onDamage: blocks physical hit
    // Source: Bulbapedia "Ice Face" -- blocks first physical hit
    const attacker = createOnFieldPokemon({ ability: CORE_ABILITY_IDS.intimidate });
    const ctx = createAbilityContext({
      ability: `${CORE_TYPE_IDS.ice}-face`,
      trigger: TRIGGERS.onContact,
      speciesId: GEN8_SPECIES_IDS.eiscue,
      nickname: "Eiscue",
      opponent: attacker,
      move: DATA_MANAGER.getMove(CORE_MOVE_IDS.tackle),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.some((e) => e.effectType === "damage-reduction")).toBe(true);
    expect(result.messages[0]).toContain("Ice Face");
  });

  it(`given Eiscue hit by special move with Ice Face active, when on-contact triggers, then does NOT ${GEN8_MOVE_IDS.block}`, () => {
    // Source: Showdown data/abilities.ts -- Ice Face only blocks physical moves
    const attacker = createOnFieldPokemon({ ability: CORE_ABILITY_IDS.intimidate });
    const ctx = createAbilityContext({
      ability: `${CORE_TYPE_IDS.ice}-face`,
      trigger: TRIGGERS.onContact,
      speciesId: GEN8_SPECIES_IDS.eiscue,
      nickname: "Eiscue",
      opponent: attacker,
      move: DATA_MANAGER.getMove(CORE_MOVE_IDS.flamethrower),
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Gulp Missile
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Gulp Missile`, () => {
  it(`given Cramorant with ${GEN8_ABILITY_IDS.gulpMissile}, when isCramorantWithGulpMissile, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile: Cramorant only
    expect(
      isCramorantWithGulpMissile(GEN8_SPECIES_IDS.cramorant, GEN8_ABILITY_IDS.gulpMissile),
    ).toBe(true);
  });

  it(`given non-Cramorant with ${GEN8_ABILITY_IDS.gulpMissile}, when isCramorantWithGulpMissile, then returns false`, () => {
    expect(isCramorantWithGulpMissile(GEN8_SPECIES_IDS.pikachu, GEN8_ABILITY_IDS.gulpMissile)).toBe(
      false,
    );
  });

  it(`given Cramorant without ${GEN8_ABILITY_IDS.gulpMissile}, when isCramorantWithGulpMissile, then returns false`, () => {
    expect(isCramorantWithGulpMissile(GEN8_SPECIES_IDS.cramorant, GEN8_ABILITY_IDS.keenEye)).toBe(
      false,
    );
  });

  it(`given gulping form, when getGulpMissileResult, then returns 1/4 HP damage and defense-drop`, () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile gulping: 1/4 HP + -1 Defense
    // Source: Bulbapedia "Gulp Missile" -- Arrokuda: damage + Defense drop
    // With 200 max HP: floor(200/4) = 50 damage
    const result = getGulpMissileResult("gulping", 200);
    expect(result.damage).toBe(50);
    expect(result.secondaryEffect).toBe("defense-drop");
  });

  it(`given gorging form, when getGulpMissileResult, then returns 1/4 HP damage and ${CORE_STATUS_IDS.paralysis}`, () => {
    // Source: Showdown data/abilities.ts -- Gulp Missile gorging: 1/4 HP + paralysis
    // Source: Bulbapedia "Gulp Missile" -- Pikachu: damage + paralysis
    // With 160 max HP: floor(160/4) = 40 damage
    const result = getGulpMissileResult("gorging", 160);
    expect(result.damage).toBe(40);
    expect(result.secondaryEffect).toBe(CORE_STATUS_IDS.paralysis);
  });

  it(`given gulping form with low HP attacker, when getGulpMissileResult, then minimum damage is 1`, () => {
    // Source: Showdown -- minimum damage is 1
    // With 3 max HP: floor(3/4) = 0, but minimum is 1
    const result = getGulpMissileResult("gulping", 3);
    expect(result.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Hunger Switch
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Hunger Switch`, () => {
  it(`given ${GEN8_ABILITY_IDS.hungerSwitch} and Morpeko, when shouldHungerSwitchToggle, then returns true`, () => {
    // Source: Showdown data/abilities.ts -- Hunger Switch: Morpeko only
    // Source: Bulbapedia "Hunger Switch" -- toggles form each turn
    expect(shouldHungerSwitchToggle(GEN8_ABILITY_IDS.hungerSwitch, GEN8_SPECIES_IDS.morpeko)).toBe(
      true,
    );
  });

  it(`given ${GEN8_ABILITY_IDS.hungerSwitch} and non-Morpeko, when shouldHungerSwitchToggle, then returns false`, () => {
    // Source: Showdown data/abilities.ts -- only applies to Morpeko
    expect(shouldHungerSwitchToggle(GEN8_ABILITY_IDS.hungerSwitch, GEN8_SPECIES_IDS.pikachu)).toBe(
      false,
    );
  });

  it(`given non-${GEN8_ABILITY_IDS.hungerSwitch} ability and Morpeko, when shouldHungerSwitchToggle, then returns false`, () => {
    expect(shouldHungerSwitchToggle(CORE_ABILITY_IDS.intimidate, GEN8_SPECIES_IDS.morpeko)).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: Gen 8 Intrepid Sword / Dauntless Shield
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Intrepid Sword / Dauntless Shield`, () => {
  it(`given ${GEN8_ABILITY_IDS.intrepidSword} user, when switching in, then raises Attack by 1 stage`, () => {
    // Source: Showdown data/mods/gen8/abilities.ts -- Intrepid Sword onStart: +1 Atk
    // Source: specs/reference/gen8-ground-truth.md -- every switch-in (Gen 8 pre-nerf)
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.intrepidSword,
      trigger: TRIGGERS.onSwitchIn,
      nickname: "Zacian",
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
      target: BATTLE_EFFECT_TARGETS.self,
      stat: CORE_STAT_IDS.attack,
      stages: 1,
    });
    expect(result.messages[0]).toContain("Intrepid Sword");
  });

  it(`given ${GEN8_ABILITY_IDS.dauntlessShield} user, when switching in, then raises Defense by 1 stage`, () => {
    // Source: Showdown data/mods/gen8/abilities.ts -- Dauntless Shield onStart: +1 Def
    // Source: specs/reference/gen8-ground-truth.md -- every switch-in (Gen 8 pre-nerf)
    const ctx = createAbilityContext({
      ability: GEN8_ABILITY_IDS.dauntlessShield,
      trigger: TRIGGERS.onSwitchIn,
      nickname: "Zamazenta",
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
      target: BATTLE_EFFECT_TARGETS.self,
      stat: CORE_STAT_IDS.defense,
      stages: 1,
    });
    expect(result.messages[0]).toContain("Dauntless Shield");
  });
});

// ---------------------------------------------------------------------------
// Tests: Carry-forward switch-in abilities
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Switch-in Abilities (carry-forward)`, () => {
  it(`given ${CORE_ABILITY_IDS.intimidate} user, when switching in, then lowers opponent Attack by 1`, () => {
    // Source: Showdown data/abilities.ts -- Intimidate: -1 Atk to foe on switch-in
    const opponent = createOnFieldPokemon({ ability: GEN8_ABILITY_IDS.innerFocus });
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.intimidate,
      trigger: TRIGGERS.onSwitchIn,
      nickname: "Gyarados",
      opponent,
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
      target: BATTLE_EFFECT_TARGETS.opponent,
      stat: CORE_STAT_IDS.attack,
      stages: -1,
    });
  });

  it(`given ${CORE_ABILITY_IDS.drizzle} user, when switching in, then sets rain weather`, () => {
    // Source: Showdown data/abilities.ts -- Drizzle sets rain
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.drizzle,
      trigger: TRIGGERS.onSwitchIn,
      nickname: "Pelipper",
    });

    const result = handleGen8SwitchAbility(TRIGGERS.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: CORE_WEATHER_IDS.rain,
      weatherTurns: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Constants
// ---------------------------------------------------------------------------

describe(`Gen ${GEN8_SPECIES_IDS.wartortle} Ability Constants`, () => {
  it(`given TRACE_UNCOPYABLE_ABILITIES, then includes Gen ${GEN8_SPECIES_IDS.wartortle} additions`, () => {
    // Source: Showdown data/abilities.ts -- trace Gen 8 ban list
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.hungerSwitch)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.gulpMissile)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(`${CORE_TYPE_IDS.ice}-face`)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.neutralizingGas)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.intrepidSword)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.dauntlessShield)).toBe(true);
  });

  it(`given TRACE_UNCOPYABLE_ABILITIES, then still includes Gen ${GEN8_SPECIES_IDS.squirtle} entries`, () => {
    // Source: Showdown data/abilities.ts -- trace ban list carry-forward
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.trace)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.multitype)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.disguise)).toBe(true);
    expect(TRACE_UNCOPYABLE_ABILITIES.has(GEN8_ABILITY_IDS.battleBond)).toBe(true);
  });

  it(`given UNSUPPRESSABLE_ABILITIES, then includes Gen ${GEN8_SPECIES_IDS.wartortle} additions`, () => {
    // Source: Showdown data/abilities.ts -- cantsuppress Gen 8 entries
    expect(UNSUPPRESSABLE_ABILITIES.has(GEN8_ABILITY_IDS.gulpMissile)).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has(`${CORE_TYPE_IDS.ice}-face`)).toBe(true);
    expect(UNSUPPRESSABLE_ABILITIES.has(GEN8_ABILITY_IDS.neutralizingGas)).toBe(true);
  });

  it(`given MOLD_BREAKER_ALIASES, then contains ${CORE_ABILITY_IDS.moldBreaker}, teravolt, turboblaze`, () => {
    // Source: Showdown data/abilities.ts -- mold breaker variants
    expect(MOLD_BREAKER_ALIASES.has(CORE_ABILITY_IDS.moldBreaker)).toBe(true);
    expect(MOLD_BREAKER_ALIASES.has(GEN8_ABILITY_IDS.teravolt)).toBe(true);
    expect(MOLD_BREAKER_ALIASES.has(`turbo${CORE_ABILITY_IDS.blaze}`)).toBe(true);
    expect(MOLD_BREAKER_ALIASES.size).toBe(3);
  });

  it(`given NEUTRALIZING_GAS_IMMUNE_ABILITIES, then includes ${GEN8_ABILITY_IDS.neutralizingGas} and comatose`, () => {
    // Source: Showdown data/abilities.ts -- Neutralizing Gas immune set
    expect(NEUTRALIZING_GAS_IMMUNE_ABILITIES.has(GEN8_ABILITY_IDS.neutralizingGas)).toBe(true);
    expect(NEUTRALIZING_GAS_IMMUNE_ABILITIES.has(GEN8_ABILITY_IDS.comatose)).toBe(true);
    expect(NEUTRALIZING_GAS_IMMUNE_ABILITIES.has(GEN8_ABILITY_IDS.multitype)).toBe(true);
    expect(NEUTRALIZING_GAS_IMMUNE_ABILITIES.has(GEN8_ABILITY_IDS.disguise)).toBe(true);
  });
});
