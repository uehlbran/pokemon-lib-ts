import type { ActivePokemon, BattleSide, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus, SeededRandom } from "@pokemon-lib-ts/core";
import { createEvs, createIvs } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen9HeldItem,
  getBlackSludgeEffect,
  getChoiceItemBoost,
  getConsumableItemEffect,
  getEvioliteModifier,
  getFocusSashTrigger,
  getItemDamageModifier,
  getLeftoversHeal,
  getLifeOrbRecoil,
  getPinchBerryThreshold,
  getRockyHelmetDamage,
  getThroatSprayTrigger,
  getTypeBoostItem,
  getTypeResistBerry,
  getWeatherRockType,
  hasAirBalloon,
  hasCovertCloak,
  hasIronBall,
  hasTerrainExtender,
  hasUtilityUmbrella,
  isAssaultVestHolder,
  isBoosterEnergy,
  isChoiceLocked,
  isGen9PowderBlocked,
} from "../src/Gen9Items";
import { Gen9Ruleset } from "../src/Gen9Ruleset";
import {
  chipDamageOpponent,
  chipDamageSelf,
  consumeSelf,
  flinchOpponent,
  forceSwitchOpponent,
  forceSwitchSelf,
  healSelf,
  inflictStatusSelf,
  statBoostSelf,
  statusCureSelf,
  surviveSelf,
  TEST_ABILITY_IDS,
  TEST_DEFAULTS,
  TEST_EFFECT_IDS,
  TEST_FIXED_POINT,
  TEST_ITEM_IDS,
  TEST_MOVE_CATEGORIES,
  TEST_MOVE_IDS,
  TEST_STAT_IDS,
  TEST_STATUS_IDS,
  TEST_TRIGGER_IDS,
  TEST_TYPE_IDS,
  TEST_VOLATILE_IDS,
  TEST_WEATHER_IDS,
  volatileCureSelf,
} from "./helpers/item-test-ids";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const MOVE_FIXTURES = {
  earthquake: {
    id: TEST_MOVE_IDS.earthquake,
    type: TEST_TYPE_IDS.ground,
    category: TEST_MOVE_CATEGORIES.physical,
  },
  flamethrower: {
    id: TEST_MOVE_IDS.flamethrower,
    type: TEST_TYPE_IDS.fire,
    category: TEST_MOVE_CATEGORIES.special,
  },
  hyperVoice: {
    id: TEST_MOVE_IDS.hyperVoice,
    type: TEST_TYPE_IDS.normal,
    category: TEST_MOVE_CATEGORIES.special,
    flags: { sound: true },
  },
  iceBeam: {
    id: TEST_MOVE_IDS.iceBeam,
    type: TEST_TYPE_IDS.ice,
    category: TEST_MOVE_CATEGORIES.special,
  },
  surf: {
    id: TEST_MOVE_IDS.surf,
    type: TEST_TYPE_IDS.water,
    category: TEST_MOVE_CATEGORIES.special,
  },
  tackle: {
    id: TEST_MOVE_IDS.tackle,
    type: TEST_TYPE_IDS.normal,
    category: TEST_MOVE_CATEGORIES.physical,
  },
  thunderbolt: {
    id: TEST_MOVE_IDS.thunderbolt,
    type: TEST_TYPE_IDS.electric,
    category: TEST_MOVE_CATEGORIES.special,
  },
} as const;

// Source: Showdown item handlers -- standard pinch berries trigger at 1/4 HP,
// or 1/2 HP with Gluttony.
const PINCH_BERRY_THRESHOLDS = {
  boosted: 0.5,
  standard: 0.25,
} as const;

function createOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  speciesId?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: TEST_DEFAULTS.uid,
      speciesId: overrides.speciesId ?? 1,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: TEST_DEFAULTS.nature,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? TEST_DEFAULTS.ability,
      abilitySlot: TEST_DEFAULTS.abilitySlot,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as PrimaryStatus | null,
      friendship: 0,
      gender: TEST_DEFAULTS.gender,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: TEST_DEFAULTS.pokeball,
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
    },
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [TEST_DEFAULTS.defaultType],
    ability: overrides.ability ?? TEST_DEFAULTS.ability,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createBattleState(
  overrides: {
    weather?: { type: string; turnsLeft: number } | null;
    magicRoom?: { active: boolean; turnsLeft: number } | null;
  } = {},
): BattleState {
  return {
    format: { generation: 9, battleType: TEST_DEFAULTS.battleType },
    sides: [
      { active: [], bench: [], entryHazards: {} } as unknown as BattleSide,
      { active: [], bench: [], entryHazards: {} } as unknown as BattleSide,
    ],
    weather: overrides.weather ?? null,
    terrain: null,
    trickRoom: null,
    magicRoom: overrides.magicRoom ?? null,
    wonderRoom: null,
    gravity: null,
    turnNumber: 1,
  } as BattleState;
}

function createDeterministicRng(overrides?: { chance?: (p: number) => boolean }): SeededRandom {
  return {
    chance: overrides?.chance ?? ((_p: number) => false),
    next: () => 0.5,
    nextInt: (min: number, _max: number) => min,
    seed: 12345,
    getState: () => 12345,
  } as unknown as SeededRandom;
}

function createItemContext(overrides: {
  pokemon?: ActivePokemon;
  state?: BattleState;
  rng?: SeededRandom;
  move?: any;
  damage?: number;
  opponent?: ActivePokemon;
}): ItemContext {
  return {
    pokemon: overrides.pokemon ?? createOnFieldPokemon({}),
    state: overrides.state ?? createBattleState(),
    rng: overrides.rng ?? createDeterministicRng(),
    move: overrides.move,
    damage: overrides.damage,
    opponent: overrides.opponent,
  } as ItemContext;
}

// ═══════════════════════════════════════════════════════════════════════════
// Choice Items
// ═══════════════════════════════════════════════════════════════════════════

describe("Choice Items", () => {
  describe("getChoiceItemBoost", () => {
    // Source: Showdown data/items.ts -- Choice Band onModifyAtk: 1.5x
    it("given Choice Band, when getting boost, then returns atk 1.5x", () => {
      const result = getChoiceItemBoost(TEST_ITEM_IDS.choiceBand);
      expect(result).toEqual({ stat: "atk", multiplier: 1.5 });
    });

    // Source: Showdown data/items.ts -- Choice Specs onModifySpA: 1.5x
    it("given Choice Specs, when getting boost, then returns spatk 1.5x", () => {
      const result = getChoiceItemBoost(TEST_ITEM_IDS.choiceSpecs);
      expect(result).toEqual({ stat: "spatk", multiplier: 1.5 });
    });

    // Source: Showdown data/items.ts -- Choice Scarf onModifySpe: 1.5x
    it("given Choice Scarf, when getting boost, then returns spe 1.5x", () => {
      const result = getChoiceItemBoost(TEST_ITEM_IDS.choiceScarf);
      expect(result).toEqual({ stat: "spe", multiplier: 1.5 });
    });

    it("given non-choice item, when getting boost, then returns null", () => {
      const result = getChoiceItemBoost(TEST_ITEM_IDS.leftovers);
      expect(result).toBeNull();
      expect(result).not.toEqual({ stat: "atk", multiplier: 1.5 });
    });
  });

  describe("isChoiceLocked", () => {
    // Source: Showdown data/items.ts -- Choice items lock the holder into one move
    it("given Pokemon with Choice Band, when checking lock, then returns true", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.choiceBand });
      expect(isChoiceLocked(pokemon)).toBe(true);
    });

    // Gen 9 has no Dynamax -- Choice lock always applies
    // Source: Bulbapedia -- Dynamax removed in Gen 9, no suppression
    it("given Pokemon with Choice Specs, when checking lock, then returns true (no Dynamax in Gen 9)", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.choiceSpecs });
      expect(isChoiceLocked(pokemon)).toBe(true);
    });

    it("given Pokemon with Leftovers, when checking lock, then returns false", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.leftovers });
      expect(isChoiceLocked(pokemon)).toBe(false);
    });

    it("given Pokemon with no item, when checking lock, then returns false", () => {
      const pokemon = createOnFieldPokemon({ heldItem: null });
      expect(isChoiceLocked(pokemon)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Type-Boost Items
// ═══════════════════════════════════════════════════════════════════════════

describe("Type-Boost Items", () => {
  describe("getTypeBoostItem", () => {
    // Source: Showdown data/items.ts -- Charcoal onBasePower chainModify([4915, 4096])
    it("given Charcoal with Fire move, when checking boost, then returns 4915 (1.2x)", () => {
      expect(getTypeBoostItem(TEST_ITEM_IDS.charcoal, TEST_TYPE_IDS.fire)).toBe(
        TEST_FIXED_POINT.typeBoost,
      );
    });

    // Source: Showdown data/items.ts -- Charcoal only boosts Fire moves
    it("given Charcoal with Water move, when checking boost, then returns 4096 (1.0x)", () => {
      expect(getTypeBoostItem(TEST_ITEM_IDS.charcoal, TEST_TYPE_IDS.water)).toBe(
        TEST_FIXED_POINT.neutral,
      );
    });

    // Source: Showdown data/items.ts -- Mystic Water boosts Water moves
    it("given Mystic Water with Water move, when checking boost, then returns 4915", () => {
      expect(getTypeBoostItem(TEST_ITEM_IDS.mysticWater, TEST_TYPE_IDS.water)).toBe(
        TEST_FIXED_POINT.typeBoost,
      );
    });

    // Source: packages/gen9/data/items.json -- Charcoal is present in the shipped Gen 9 bundle
    // and exercises the same Fire-type boost mechanic under test.
    it("given Charcoal with Fire move, when checking boost, then returns 4915", () => {
      expect(getTypeBoostItem(TEST_ITEM_IDS.charcoal, TEST_TYPE_IDS.fire)).toBe(
        TEST_FIXED_POINT.typeBoost,
      );
    });

    // Source: packages/gen9/data/items.json -- Mystic Water is present in the shipped Gen 9 bundle
    // and exercises the same Water-type boost mechanic under test.
    it("given Mystic Water with Water move, when checking boost, then returns 4915", () => {
      expect(getTypeBoostItem(TEST_ITEM_IDS.mysticWater, TEST_TYPE_IDS.water)).toBe(
        TEST_FIXED_POINT.typeBoost,
      );
    });

    // Source: Showdown data/items.ts -- Fairy Feather boosts Fairy (Gen 9 new)
    it("given Fairy Feather with Fairy move, when checking boost, then returns 4915 (Gen 9 new)", () => {
      expect(getTypeBoostItem(TEST_ITEM_IDS.fairyFeather, TEST_TYPE_IDS.fairy)).toBe(
        TEST_FIXED_POINT.typeBoost,
      );
    });

    // Fairy Feather should not boost non-Fairy moves
    it("given Fairy Feather with Normal move, when checking boost, then returns 4096", () => {
      expect(getTypeBoostItem(TEST_ITEM_IDS.fairyFeather, TEST_TYPE_IDS.normal)).toBe(
        TEST_FIXED_POINT.neutral,
      );
    });

    it("given non-boost item, when checking boost, then returns 4096", () => {
      expect(getTypeBoostItem(TEST_ITEM_IDS.leftovers, TEST_TYPE_IDS.fire)).toBe(
        TEST_FIXED_POINT.neutral,
      );
    });
  });

  describe("getItemDamageModifier", () => {
    // Source: Showdown data/items.ts -- Charcoal 4915/4096 for Fire physical
    it("given Charcoal + Fire physical move, when getting modifier, then returns 4915", () => {
      expect(
        getItemDamageModifier(TEST_ITEM_IDS.charcoal, {
          moveType: TEST_TYPE_IDS.fire,
          moveCategory: TEST_MOVE_CATEGORIES.physical,
        }),
      ).toBe(TEST_FIXED_POINT.typeBoost);
    });

    // Source: Showdown data/items.ts -- Life Orb 5325/4096 for any damaging move
    it("given Life Orb + physical move, when getting modifier, then returns 5325 (1.3x)", () => {
      expect(
        getItemDamageModifier(TEST_ITEM_IDS.lifeOrb, {
          moveType: TEST_TYPE_IDS.normal,
          moveCategory: TEST_MOVE_CATEGORIES.physical,
        }),
      ).toBe(TEST_FIXED_POINT.lifeOrb);
    });

    // Source: Showdown data/items.ts -- Life Orb does not boost status moves
    it("given Life Orb + status move, when getting modifier, then returns 4096 (no boost)", () => {
      expect(
        getItemDamageModifier(TEST_ITEM_IDS.lifeOrb, {
          moveType: TEST_TYPE_IDS.normal,
          moveCategory: TEST_MOVE_CATEGORIES.status,
        }),
      ).toBe(TEST_FIXED_POINT.neutral);
    });

    // Source: Showdown data/items.ts -- Choice Band 6144/4096 for physical
    it("given Choice Band + physical move, when getting modifier, then returns 6144 (1.5x)", () => {
      expect(
        getItemDamageModifier(TEST_ITEM_IDS.choiceBand, {
          moveType: TEST_TYPE_IDS.normal,
          moveCategory: TEST_MOVE_CATEGORIES.physical,
        }),
      ).toBe(TEST_FIXED_POINT.choice);
    });

    // Source: Showdown data/items.ts -- Choice Band does not boost special moves
    it("given Choice Band + special move, when getting modifier, then returns 4096", () => {
      expect(
        getItemDamageModifier(TEST_ITEM_IDS.choiceBand, {
          moveType: TEST_TYPE_IDS.normal,
          moveCategory: TEST_MOVE_CATEGORIES.special,
        }),
      ).toBe(TEST_FIXED_POINT.neutral);
    });

    // Source: Showdown data/items.ts -- Choice Specs 6144/4096 for special
    it("given Choice Specs + special move, when getting modifier, then returns 6144", () => {
      expect(
        getItemDamageModifier(TEST_ITEM_IDS.choiceSpecs, {
          moveType: TEST_TYPE_IDS.normal,
          moveCategory: TEST_MOVE_CATEGORIES.special,
        }),
      ).toBe(TEST_FIXED_POINT.choice);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Type-Resist Berries
// ═══════════════════════════════════════════════════════════════════════════

describe("Type-Resist Berries", () => {
  describe("getTypeResistBerry", () => {
    // Source: Showdown data/items.ts -- Occa Berry halves SE Fire damage
    it("given Occa Berry vs SE Fire move, when checking resist, then returns 2048 (0.5x)", () => {
      // effectiveness >= 2 triggers the berry
      expect(getTypeResistBerry(TEST_ITEM_IDS.occaBerry, TEST_TYPE_IDS.fire, 2)).toBe(
        TEST_FIXED_POINT.resistBerry,
      );
    });

    // Source: Showdown data/items.ts -- Occa Berry does not activate on neutral Fire
    it("given Occa Berry vs neutral Fire move, when checking resist, then returns 4096 (no activation)", () => {
      expect(getTypeResistBerry(TEST_ITEM_IDS.occaBerry, TEST_TYPE_IDS.fire, 1)).toBe(
        TEST_FIXED_POINT.neutral,
      );
    });

    // Source: Showdown data/items.ts -- Occa Berry does not activate on Water
    it("given Occa Berry vs Water move (wrong type), then returns 4096", () => {
      expect(getTypeResistBerry(TEST_ITEM_IDS.occaBerry, TEST_TYPE_IDS.water, 2)).toBe(
        TEST_FIXED_POINT.neutral,
      );
    });

    // Source: Showdown data/items.ts -- Roseli Berry halves SE Fairy damage
    it("given Roseli Berry vs SE Fairy move, then returns 2048", () => {
      expect(getTypeResistBerry(TEST_ITEM_IDS.roseliBerry, TEST_TYPE_IDS.fairy, 2)).toBe(
        TEST_FIXED_POINT.resistBerry,
      );
    });

    // Source: Showdown data/items.ts -- Chilan Berry halves Normal damage regardless of SE
    // Source: Bulbapedia "Chilan Berry" -- activates on any Normal-type hit
    it("given Chilan Berry vs Normal move (1x), when checking resist, then returns 2048 (always activates for Normal)", () => {
      expect(getTypeResistBerry(TEST_ITEM_IDS.chilanBerry, TEST_TYPE_IDS.normal, 1)).toBe(
        TEST_FIXED_POINT.resistBerry,
      );
    });

    it("given non-berry item, when checking resist, then returns 4096", () => {
      expect(getTypeResistBerry(TEST_ITEM_IDS.leftovers, TEST_TYPE_IDS.fire, 2)).toBe(
        TEST_FIXED_POINT.neutral,
      );
    });
  });

  describe("applyGen9HeldItem -- type-resist berry on-damage-taken", () => {
    // Full integration test: Occa Berry on-damage-taken trigger
    // Occa Berry triggers as on-damage-taken in the main handler.
    // Note: the actual halving is done in the damage calc using getTypeResistBerry.
    // The on-damage-taken handler in applyGen9HeldItem does NOT have a case for
    // resist berries since the halving is done during damage calc, not post-hit.
    // This test verifies the berry is not double-activated.
    it("given Pokemon with Occa Berry hit by a damaging move, the resist berry is applied in damage calc (not on-damage-taken)", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.occaBerry,
        types: [TEST_TYPE_IDS.grass],
      });
      const ctx = createItemContext({
        pokemon,
        move: MOVE_FIXTURES.flamethrower,
        damage: 100,
      });
      // on-damage-taken does not handle resist berries (handled in damage calc)
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Life Orb
// ═══════════════════════════════════════════════════════════════════════════

describe("Life Orb", () => {
  describe("getLifeOrbRecoil", () => {
    // Source: Showdown data/items.ts -- Life Orb recoil = floor(maxHP / 10)
    it("given maxHP of 200, when calculating recoil, then returns 20", () => {
      // floor(200 / 10) = 20
      expect(getLifeOrbRecoil(200)).toBe(20);
    });

    // Source: Showdown data/items.ts -- minimum 1 HP recoil
    it("given maxHP of 1, when calculating recoil, then returns 1 (minimum)", () => {
      expect(getLifeOrbRecoil(1)).toBe(1);
    });

    // floor(153 / 10) = 15
    it("given maxHP of 153, when calculating recoil, then returns 15", () => {
      // floor(153 / 10) = 15
      expect(getLifeOrbRecoil(153)).toBe(15);
    });
  });

  describe("applyGen9HeldItem -- Life Orb on-hit", () => {
    // Source: Showdown data/items.ts -- Life Orb recoil on-hit
    it("given Pokemon with Life Orb dealing damage, when on-hit triggers, then recoil = floor(maxHP/10)", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.lifeOrb, hp: 200 });
      const ctx = createItemContext({
        pokemon,
        move: { ...MOVE_FIXTURES.tackle, effect: null },
        damage: 50,
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onHit, ctx);
      expect(result.activated).toBe(true);
      // floor(200 / 10) = 20 HP recoil
      expect(result.effects[0]).toEqual(chipDamageSelf(20));
    });

    // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
    it("given Sheer Force Pokemon with Life Orb using move with secondary effect, when on-hit triggers, then no recoil", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.lifeOrb,
        hp: 200,
        ability: TEST_ABILITY_IDS.sheerForce,
      });
      const ctx = createItemContext({
        pokemon,
        move: {
          ...MOVE_FIXTURES.flamethrower,
          effect: { type: "status-chance", status: TEST_STATUS_IDS.burn, chance: 10 },
        },
        damage: 50,
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onHit, ctx);
      expect(result.activated).toBe(false);
    });

    // Life Orb does not trigger when no damage dealt
    it("given Pokemon with Life Orb dealing 0 damage, when on-hit triggers, then no recoil", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.lifeOrb, hp: 200 });
      const ctx = createItemContext({
        pokemon,
        move: { ...MOVE_FIXTURES.tackle, effect: null },
        damage: 0,
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onHit, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

describe("go-first held items", () => {
  it("given Custap Berry in pinch range, when before-turn-order triggers, then it activates and consumes", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.custapBerry,
      hp: 200,
      currentHp: 50,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.tackle,
    });

    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.beforeTurnOrder, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([consumeSelf(TEST_ITEM_IDS.custapBerry)]);
    expect(result.messages).toEqual(["The Pokemon's Custap Berry let it move first!"]);
  });

  it("given Custap Berry outside pinch range, when before-turn-order triggers, then it does not activate", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.custapBerry,
      hp: 200,
      currentHp: 51,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.tackle,
    });

    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.beforeTurnOrder, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Quick Claw and a successful roll, when before-turn-order triggers, then it activates without consuming", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.quickClaw });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.tackle,
      rng: createDeterministicRng({ chance: () => true }),
    });

    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.beforeTurnOrder, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([]);
    expect(result.messages).toEqual(["The Pokemon's Quick Claw let it move first!"]);
  });

  it("given Magic Room, when before-turn-order triggers, then go-first items stay suppressed", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.quickClaw });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.tackle,
      rng: createDeterministicRng({ chance: () => true }),
      state: createBattleState({ magicRoom: { active: true, turnsLeft: 3 } }),
    });

    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.beforeTurnOrder, ctx);

    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Leftovers
// ═══════════════════════════════════════════════════════════════════════════

describe("Leftovers", () => {
  describe("getLeftoversHeal", () => {
    // Source: Showdown data/items.ts -- Leftovers heals floor(maxHP / 16)
    it("given maxHP of 200, when calculating heal, then returns 12", () => {
      // floor(200 / 16) = 12
      expect(getLeftoversHeal(200)).toBe(12);
    });

    // Source: Showdown data/items.ts -- minimum 1 HP heal
    it("given maxHP of 1, when calculating heal, then returns 1 (minimum)", () => {
      expect(getLeftoversHeal(1)).toBe(1);
    });

    // floor(160 / 16) = 10
    it("given maxHP of 160, when calculating heal, then returns 10", () => {
      // floor(160 / 16) = 10
      expect(getLeftoversHeal(160)).toBe(10);
    });
  });

  describe("applyGen9HeldItem -- Leftovers end-of-turn", () => {
    // Source: Showdown data/items.ts -- Leftovers heals 1/16 max HP each end-of-turn
    it("given Pokemon with Leftovers at end-of-turn, when triggered, then heals floor(maxHP/16)", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.leftovers,
        hp: 200,
        currentHp: 150,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      // floor(200 / 16) = 12
      expect(result.effects[0]).toEqual(healSelf(12));
    });

    // Leftovers at full HP still triggers (the engine caps the heal)
    it("given Pokemon with Leftovers at full HP, when triggered, then still returns heal effect", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.leftovers,
        hp: 200,
        currentHp: 200,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Black Sludge
// ═══════════════════════════════════════════════════════════════════════════

describe("Black Sludge", () => {
  describe("getBlackSludgeEffect", () => {
    // Source: Showdown data/items.ts -- Black Sludge heals Poison types floor(maxHP/16)
    it("given Poison-type Pokemon with maxHP 200, when calculating effect, then heals 12", () => {
      const result = getBlackSludgeEffect({ types: [TEST_TYPE_IDS.poison], maxHp: 200 });
      expect(result.type).toBe(TEST_EFFECT_IDS.heal);
      // floor(200 / 16) = 12
      expect(result.amount).toBe(12);
    });

    // Source: Showdown data/items.ts -- Black Sludge damages non-Poison floor(maxHP/8)
    it("given Normal-type Pokemon with maxHP 200, when calculating effect, then damages 25", () => {
      const result = getBlackSludgeEffect({ types: [TEST_TYPE_IDS.normal], maxHp: 200 });
      expect(result.type).toBe("damage");
      // floor(200 / 8) = 25
      expect(result.amount).toBe(25);
    });
  });

  describe("applyGen9HeldItem -- Black Sludge end-of-turn", () => {
    // Source: Showdown data/items.ts -- Black Sludge onResidual for Poison type
    it("given Poison-type Pokemon with Black Sludge, when end-of-turn, then heals", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.blackSludge,
        types: [TEST_TYPE_IDS.poison],
        hp: 200,
        currentHp: 150,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual(healSelf(12));
    });

    // Source: Showdown data/items.ts -- Black Sludge damages non-Poison
    it("given Normal-type Pokemon with Black Sludge, when end-of-turn, then takes chip damage", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.blackSludge,
        types: [TEST_TYPE_IDS.normal],
        hp: 200,
        currentHp: 150,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual(chipDamageSelf(25));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Focus Sash
// ═══════════════════════════════════════════════════════════════════════════

describe("Focus Sash", () => {
  describe("getFocusSashTrigger", () => {
    // Source: Showdown data/items.ts -- Focus Sash: full HP + would-KO damage
    it("given full HP Pokemon with damage >= HP, when checking trigger, then returns true", () => {
      expect(getFocusSashTrigger({ currentHp: 200, maxHp: 200, damage: 200 })).toBe(true);
    });

    // Source: Showdown data/items.ts -- Focus Sash only at full HP
    it("given not-full HP Pokemon with would-KO damage, when checking trigger, then returns false", () => {
      expect(getFocusSashTrigger({ currentHp: 199, maxHp: 200, damage: 200 })).toBe(false);
    });

    it("given full HP Pokemon with non-KO damage, when checking trigger, then returns false", () => {
      expect(getFocusSashTrigger({ currentHp: 200, maxHp: 200, damage: 100 })).toBe(false);
    });
  });

  describe("applyGen9HeldItem -- Focus Sash on-damage-taken", () => {
    // Source: Showdown data/items.ts -- Focus Sash onDamagePriority: survive + consume
    it("given full HP Pokemon with Focus Sash hit by KO move, when triggered, then survives at 1 HP and sash consumed", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.focusSash,
        hp: 200,
        currentHp: 200,
      });
      const ctx = createItemContext({ pokemon, damage: 300 });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([surviveSelf(), consumeSelf(TEST_ITEM_IDS.focusSash)]);
    });

    // Source: Showdown data/items.ts -- Focus Sash only from full HP
    it("given 95% HP Pokemon with Focus Sash hit by KO move, when triggered, then does not activate", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.focusSash,
        hp: 200,
        currentHp: 190,
      });
      const ctx = createItemContext({ pokemon, damage: 300 });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Focus Band
// ═══════════════════════════════════════════════════════════════════════════

describe("Focus Band", () => {
  describe("applyGen9HeldItem -- Focus Band on-damage-taken", () => {
    // Source: Showdown data/items.ts -- Focus Band 10% chance to survive at 1 HP
    it("given Pokemon with Focus Band and KO damage, when RNG succeeds, then survives at 1 HP (not consumed)", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.focusBand,
        hp: 200,
        currentHp: 100,
      });
      const ctx = createItemContext({
        pokemon,
        damage: 200,
        rng: createDeterministicRng({ chance: () => true }),
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([surviveSelf()]);
      // Not consumed -- Focus Band is reusable
      expect(result.effects.some((effect: any) => effect.type === TEST_EFFECT_IDS.consume)).toBe(
        false,
      );
    });

    // Source: Showdown data/items.ts -- Focus Band 10% chance (fails 90%)
    it("given Pokemon with Focus Band and KO damage, when RNG fails, then does not activate", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.focusBand,
        hp: 200,
        currentHp: 100,
      });
      const ctx = createItemContext({
        pokemon,
        damage: 200,
        rng: createDeterministicRng({ chance: () => false }),
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Eviolite
// ═══════════════════════════════════════════════════════════════════════════

describe("Eviolite", () => {
  describe("getEvioliteModifier", () => {
    // Source: Showdown data/items.ts -- Eviolite 1.5x Def/SpDef for unevolved
    it("given unevolved Pokemon, when checking modifier, then returns 6144 (1.5x)", () => {
      expect(getEvioliteModifier(true)).toBe(TEST_FIXED_POINT.choice);
    });

    // Source: Showdown data/items.ts -- Eviolite no effect for fully evolved
    it("given fully evolved Pokemon, when checking modifier, then returns 4096 (1.0x)", () => {
      expect(getEvioliteModifier(false)).toBe(TEST_FIXED_POINT.neutral);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Assault Vest
// ═══════════════════════════════════════════════════════════════════════════

describe("Assault Vest", () => {
  describe("isAssaultVestHolder", () => {
    // Source: Showdown data/items.ts -- Assault Vest onModifySpD/onDisableMove
    it("given Pokemon with Assault Vest, when checking, then returns true", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.assaultVest });
      expect(isAssaultVestHolder(pokemon)).toBe(true);
    });

    it("given Pokemon with Leftovers, when checking, then returns false", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.leftovers });
      expect(isAssaultVestHolder(pokemon)).toBe(false);
    });

    it("given Pokemon with no item, when checking, then returns false", () => {
      const pokemon = createOnFieldPokemon({ heldItem: null });
      expect(isAssaultVestHolder(pokemon)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rocky Helmet
// ═══════════════════════════════════════════════════════════════════════════

describe("Rocky Helmet", () => {
  describe("getRockyHelmetDamage", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet floor(attackerMaxHP / 6)
    it("given attacker maxHP of 300, when calculating damage, then returns 50", () => {
      // floor(300 / 6) = 50
      expect(getRockyHelmetDamage(300)).toBe(50);
    });

    it("given attacker maxHP of 1, when calculating damage, then returns 1 (minimum)", () => {
      expect(getRockyHelmetDamage(1)).toBe(1);
    });
  });

  describe("applyGen9HeldItem -- Rocky Helmet on-contact", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet onDamagingHit with contact
    it("given defender with Rocky Helmet hit by contact move, when on-contact triggers, then deals 1/6 attacker maxHP", () => {
      const defender = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.rockHelmet, hp: 200 });
      const attacker = createOnFieldPokemon({ hp: 300 });
      const ctx = createItemContext({
        pokemon: defender,
        opponent: attacker,
        move: { ...MOVE_FIXTURES.tackle, flags: { contact: true } },
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onContact, ctx);
      expect(result.activated).toBe(true);
      // floor(300 / 6) = 50
      expect(result.effects[0]).toEqual(chipDamageOpponent(50));
    });

    // Source: Showdown data/items.ts -- Rocky Helmet only on contact moves
    it("given defender with Rocky Helmet hit by non-contact move, when on-contact triggers, then no activation", () => {
      const defender = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.rockHelmet, hp: 200 });
      const ctx = createItemContext({
        pokemon: defender,
        move: { ...MOVE_FIXTURES.earthquake, flags: {} },
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onContact, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sitrus Berry
// ═══════════════════════════════════════════════════════════════════════════

describe("Sitrus Berry", () => {
  describe("applyGen9HeldItem -- Sitrus Berry end-of-turn", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry heals 1/4 maxHP at <= 50%
    it("given Pokemon at 40% HP with Sitrus Berry at end-of-turn, when triggered, then heals 1/4 maxHP and consumed", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.sitrusBerry,
        hp: 200,
        currentHp: 80,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      // floor(200 / 4) = 50
      expect(result.effects[0]).toEqual(healSelf(50));
      expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.sitrusBerry));
    });

    // Source: Showdown data/items.ts -- Sitrus Berry only at <= 50% HP
    it("given Pokemon at 60% HP with Sitrus Berry at end-of-turn, when triggered, then does not activate", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.sitrusBerry,
        hp: 200,
        currentHp: 120,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("applyGen9HeldItem -- Sitrus Berry on-damage-taken", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry also triggers after taking damage
    it("given Pokemon dropped to 50% HP after damage with Sitrus Berry, when on-damage-taken, then heals and consumed", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.sitrusBerry,
        hp: 200,
        currentHp: 100,
      });
      const ctx = createItemContext({ pokemon, damage: 100 });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual(healSelf(50));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Oran Berry
// ═══════════════════════════════════════════════════════════════════════════

describe("Oran Berry", () => {
  describe("applyGen9HeldItem -- Oran Berry end-of-turn", () => {
    // Source: Showdown data/items.ts -- Oran Berry restores 10 HP at <= 50%
    it("given Pokemon at 40% HP with Oran Berry, when end-of-turn, then heals 10 HP and consumed", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.oranBerry,
        hp: 200,
        currentHp: 80,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual(healSelf(10));
      expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.oranBerry));
    });

    it("given Pokemon at 60% HP with Oran Berry, when end-of-turn, then no activation", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.oranBerry,
        hp: 200,
        currentHp: 120,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Lum Berry
// ═══════════════════════════════════════════════════════════════════════════

describe("Lum Berry", () => {
  describe("applyGen9HeldItem -- Lum Berry end-of-turn", () => {
    // Source: Showdown data/items.ts -- Lum Berry cures any status
    it("given paralyzed Pokemon with Lum Berry, when end-of-turn, then status cured and consumed", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: TEST_ITEM_IDS.lumBerry,
        status: TEST_STATUS_IDS.paralysis,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual(statusCureSelf());
      expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.lumBerry));
    });

    // Source: Showdown data/items.ts -- Lum Berry also cures confusion
    it("given confused Pokemon (no primary status) with Lum Berry, when end-of-turn, then confusion cured and consumed", () => {
      const volatiles = new Map([[TEST_VOLATILE_IDS.confusion, { turnsLeft: 3 }]]);
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.lumBerry, volatiles });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual(volatileCureSelf(TEST_VOLATILE_IDS.confusion));
      expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.lumBerry));
    });

    it("given healthy Pokemon with Lum Berry, when end-of-turn, then no activation", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.lumBerry });
      const ctx = createItemContext({ pokemon });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Status-Cure Berries
// ═══════════════════════════════════════════════════════════════════════════

describe("Status-Cure Berries", () => {
  // Source: Showdown data/items.ts -- Cheri Berry cures paralysis
  it("given paralyzed Pokemon with Cheri Berry, when end-of-turn, then cures paralysis", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.cheriBerry,
      status: TEST_STATUS_IDS.paralysis,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statusCureSelf());
  });

  // Source: Showdown data/items.ts -- Chesto Berry cures sleep
  it("given sleeping Pokemon with Chesto Berry, when end-of-turn, then wakes up", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.chestoBerry,
      status: TEST_STATUS_IDS.sleep,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statusCureSelf());
  });

  // Source: Showdown data/items.ts -- Pecha Berry cures poison
  it("given poisoned Pokemon with Pecha Berry, when end-of-turn, then cures poison", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.pechaBerry,
      status: TEST_STATUS_IDS.poison,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statusCureSelf());
  });

  // Source: Showdown data/items.ts -- Rawst Berry cures burn
  it("given burned Pokemon with Rawst Berry, when end-of-turn, then cures burn", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.rawstBerry,
      status: TEST_STATUS_IDS.burn,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statusCureSelf());
  });

  // Source: Showdown data/items.ts -- Aspear Berry cures freeze
  it("given frozen Pokemon with Aspear Berry, when end-of-turn, then thaws out", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.aspearBerry,
      status: TEST_STATUS_IDS.freeze,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statusCureSelf());
  });

  // Cheri Berry does not activate without paralysis
  it("given burned Pokemon with Cheri Berry, when end-of-turn, then no activation (wrong status)", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.cheriBerry,
      status: TEST_STATUS_IDS.burn,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Pinch Berries (stat-boost at low HP)
// ═══════════════════════════════════════════════════════════════════════════

describe("Pinch Berries", () => {
  describe("getPinchBerryThreshold", () => {
    // Source: Showdown data/abilities.ts -- Gluttony changes threshold to 50%
    it("given Gluttony ability with 25% threshold, when checking, then returns 0.5 (50%)", () => {
      expect(
        getPinchBerryThreshold(
          { ability: TEST_ABILITY_IDS.gluttony },
          PINCH_BERRY_THRESHOLDS.standard,
        ),
      ).toBe(PINCH_BERRY_THRESHOLDS.boosted);
    });

    it("given non-Gluttony ability with 25% threshold, when checking, then returns 0.25", () => {
      expect(
        getPinchBerryThreshold({ ability: TEST_ABILITY_IDS.none }, PINCH_BERRY_THRESHOLDS.standard),
      ).toBe(PINCH_BERRY_THRESHOLDS.standard);
    });
  });

  // Source: Showdown data/items.ts -- Liechi Berry +1 Atk at 25% HP
  it("given Pokemon at 25% HP with Liechi Berry, when on-damage-taken, then +1 Attack and consumed", () => {
    // 200 * 0.25 = 50; currentHp = 50 <= 50 triggers
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.liechiBerry,
      hp: 200,
      currentHp: 50,
    });
    const ctx = createItemContext({ pokemon, damage: 10 });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.attack));
    expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.liechiBerry));
  });

  // Source: Showdown data/items.ts -- Salac Berry +1 Speed at 25% HP
  it("given Pokemon at 25% HP with Salac Berry, when on-damage-taken, then +1 Speed and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.salacBerry,
      hp: 200,
      currentHp: 50,
    });
    const ctx = createItemContext({ pokemon, damage: 10 });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.speed));
  });

  // Source: Showdown data/items.ts -- Petaya Berry +1 SpAtk at 25% HP
  it("given Pokemon at 25% HP with Petaya Berry, when on-damage-taken, then +1 SpAtk and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.petayaBerry,
      hp: 200,
      currentHp: 50,
    });
    const ctx = createItemContext({ pokemon, damage: 10 });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.spAttack));
  });

  // Pinch berry does not activate above threshold
  it("given Pokemon at 30% HP with Liechi Berry, when on-damage-taken, then no activation (above 25% threshold)", () => {
    // 200 * 0.25 = 50; currentHp = 60 > 50 does not trigger
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.liechiBerry,
      hp: 200,
      currentHp: 60,
    });
    const ctx = createItemContext({ pokemon, damage: 10 });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Weakness Policy
// ═══════════════════════════════════════════════════════════════════════════

describe("Weakness Policy", () => {
  // Source: Showdown data/items.ts -- Weakness Policy +2 Atk +2 SpA on SE hit
  it("given Pokemon hit by super-effective move with Weakness Policy, when on-damage-taken, then +2 Atk/SpA and consumed", () => {
    // Fire vs Grass is SE (2x)
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.weaknessPolicy,
      types: [TEST_TYPE_IDS.grass],
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.flamethrower,
      damage: 50,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.attack, 2));
    expect(result.effects[1]).toEqual(statBoostSelf(TEST_STAT_IDS.spAttack, 2));
    expect(result.effects[2]).toEqual(consumeSelf(TEST_ITEM_IDS.weaknessPolicy));
  });

  // Source: Showdown data/items.ts -- Weakness Policy only on SE (not neutral)
  it("given Pokemon hit by neutral move with Weakness Policy, when on-damage-taken, then no activation", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.weaknessPolicy,
      types: [TEST_TYPE_IDS.normal],
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.flamethrower,
      damage: 50,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Toxic Orb / Flame Orb
// ═══════════════════════════════════════════════════════════════════════════

describe("Status Orbs", () => {
  // Source: Showdown data/items.ts -- Toxic Orb badly poisons at end of turn
  it("given healthy Pokemon with Toxic Orb, when end-of-turn, then badly poisoned", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.toxicOrb });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(inflictStatusSelf(TEST_STATUS_IDS.badlyPoisoned));
  });

  // Source: Showdown -- Poison types immune to Toxic Orb
  it("given Poison-type Pokemon with Toxic Orb, when end-of-turn, then no activation (immune)", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.toxicOrb,
      types: [TEST_TYPE_IDS.poison],
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  // Source: Showdown data/items.ts -- Flame Orb burns at end of turn
  it("given healthy Pokemon with Flame Orb, when end-of-turn, then burned", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.flameOrb });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(inflictStatusSelf(TEST_STATUS_IDS.burn));
  });

  // Source: Showdown -- Fire types immune to Flame Orb
  it("given Fire-type Pokemon with Flame Orb, when end-of-turn, then no activation (immune)", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.flameOrb,
      types: [TEST_TYPE_IDS.fire],
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  // Already-statused Pokemon do not gain another status
  it("given already-burned Pokemon with Toxic Orb, when end-of-turn, then no activation", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.toxicOrb,
      status: TEST_STATUS_IDS.burn,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Booster Energy (Gen 9 new)
// ═══════════════════════════════════════════════════════════════════════════

describe("Booster Energy", () => {
  // Source: Showdown data/items.ts -- boosterenergy item ID
  it("given Booster Energy item ID, when checking isBoosterEnergy, then returns true", () => {
    expect(isBoosterEnergy(TEST_ITEM_IDS.boosterEnergy)).toBe(true);
  });

  it("given Leftovers item ID, when checking isBoosterEnergy, then returns false", () => {
    expect(isBoosterEnergy(TEST_ITEM_IDS.leftovers)).toBe(false);
  });

  // Booster Energy identification is a helper -- activation logic is in Wave 8A (ability triggers)
  it("given empty string, when checking isBoosterEnergy, then returns false", () => {
    expect(isBoosterEnergy("")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Covert Cloak (Gen 9 new)
// ═══════════════════════════════════════════════════════════════════════════

describe("Covert Cloak", () => {
  // Source: Showdown data/items.ts -- covertcloak blocks secondary effects
  it("given Pokemon with Covert Cloak, when checking hasCovertCloak, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.covertCloak });
    expect(hasCovertCloak(pokemon)).toBe(true);
  });

  it("given Pokemon with Leftovers, when checking hasCovertCloak, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.leftovers });
    expect(hasCovertCloak(pokemon)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Air Balloon / Iron Ball / Utility Umbrella / Terrain Extender
// ═══════════════════════════════════════════════════════════════════════════

describe("Utility Items", () => {
  // Source: Showdown data/items.ts -- Air Balloon: immunity to Ground
  it("given Pokemon with Air Balloon, when checking hasAirBalloon, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.airBalloon });
    expect(hasAirBalloon(pokemon)).toBe(true);
  });

  it("given Pokemon without Air Balloon, when checking hasAirBalloon, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.leftovers });
    expect(hasAirBalloon(pokemon)).toBe(false);
  });

  // Source: Showdown data/items.ts -- Iron Ball halves Speed, grounds
  it("given Pokemon with Iron Ball, when checking hasIronBall, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.ironBall });
    expect(hasIronBall(pokemon)).toBe(true);
  });

  // Source: Showdown data/items.ts -- Utility Umbrella negates weather
  it("given Pokemon with Utility Umbrella, when checking, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.utilityUmbrella });
    expect(hasUtilityUmbrella(pokemon)).toBe(true);
  });

  // Source: Showdown data/items.ts -- Terrain Extender extends terrain
  it("given Pokemon with Terrain Extender, when checking, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.terrainExtender });
    expect(hasTerrainExtender(pokemon)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Weather Rocks
// ═══════════════════════════════════════════════════════════════════════════

describe("Weather Rocks", () => {
  // Source: Showdown data/items.ts -- Heat Rock extends Sun to 8 turns
  it(`given Heat Rock, when checking weather type, then returns ${TEST_WEATHER_IDS.sun}`, () => {
    expect(getWeatherRockType(TEST_ITEM_IDS.heatRock)).toBe(TEST_WEATHER_IDS.sun);
  });

  // Source: Showdown data/items.ts -- Damp Rock extends Rain to 8 turns
  it(`given Damp Rock, when checking weather type, then returns ${TEST_WEATHER_IDS.rain}`, () => {
    expect(getWeatherRockType(TEST_ITEM_IDS.dampRock)).toBe(TEST_WEATHER_IDS.rain);
  });

  // Source: Showdown data/items.ts -- Smooth Rock extends Sandstorm to 8 turns
  it(`given Smooth Rock, when checking weather type, then returns ${TEST_WEATHER_IDS.sandstorm}`, () => {
    expect(getWeatherRockType(TEST_ITEM_IDS.smoothRock)).toBe(TEST_WEATHER_IDS.sandstorm);
  });

  // Source: Showdown data/items.ts -- Icy Rock extends Snow to 8 turns (Gen 9: Hail->Snow)
  it(`given Icy Rock, when checking weather type, then returns ${TEST_WEATHER_IDS.snow}`, () => {
    expect(getWeatherRockType(TEST_ITEM_IDS.icyRock)).toBe(TEST_WEATHER_IDS.snow);
  });

  it("given non-rock item, when checking weather type, then returns null", () => {
    const result = getWeatherRockType(TEST_ITEM_IDS.leftovers);
    expect(result).toBeNull();
    expect(Object.values(TEST_WEATHER_IDS)).not.toContain(result as never);
    expect(getWeatherRockType(TEST_ITEM_IDS.heatRock)).toBe(TEST_WEATHER_IDS.sun);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Safety Goggles
// ═══════════════════════════════════════════════════════════════════════════

describe("Safety Goggles", () => {
  // Source: Showdown data/items.ts -- Safety Goggles blocks powder moves
  it("given Safety Goggles vs powder move, when checking, then returns true", () => {
    expect(isGen9PowderBlocked(TEST_ITEM_IDS.safetyGoggles, { powder: true })).toBe(true);
  });

  it("given Safety Goggles vs non-powder move, when checking, then returns false", () => {
    expect(isGen9PowderBlocked(TEST_ITEM_IDS.safetyGoggles, { powder: false })).toBe(false);
  });

  it("given non-Goggles item vs powder move, when checking, then returns false", () => {
    expect(isGen9PowderBlocked(TEST_ITEM_IDS.leftovers, { powder: true })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Consumable Items (Gen 8 carried forward)
// ═══════════════════════════════════════════════════════════════════════════

describe("Consumable Items", () => {
  describe("getThroatSprayTrigger", () => {
    // Source: Showdown data/items.ts -- Throat Spray on sound move
    it("given sound move flags, when checking trigger, then returns true", () => {
      expect(getThroatSprayTrigger({ sound: true })).toBe(true);
    });

    it("given non-sound move flags, when checking trigger, then returns false", () => {
      expect(getThroatSprayTrigger({ sound: false })).toBe(false);
    });

    it("given undefined flags, when checking trigger, then returns false", () => {
      expect(getThroatSprayTrigger(undefined)).toBe(false);
    });
  });

  describe("getConsumableItemEffect", () => {
    // Source: Showdown data/items.ts -- Blunder Policy +2 Speed on miss
    it("given Blunder Policy with move missed, when checking effect, then returns +2 Speed consumed", () => {
      const result = getConsumableItemEffect(TEST_ITEM_IDS.blunderPolicy, { moveMissed: true });
      expect(result).toEqual({ stat: TEST_STAT_IDS.speed, stages: 2, consumed: true });
    });

    // Source: Showdown data/items.ts -- Room Service -1 Speed in Trick Room
    it("given Room Service with Trick Room active, when checking effect, then returns -1 Speed consumed", () => {
      const result = getConsumableItemEffect(TEST_ITEM_IDS.roomService, { trickRoomActive: true });
      expect(result).toEqual({ stat: TEST_STAT_IDS.speed, stages: -1, consumed: true });
    });

    // Source: Showdown data/items.ts -- Throat Spray +1 SpAtk on sound
    it("given Throat Spray with sound move, when checking effect, then returns +1 SpAtk consumed", () => {
      const result = getConsumableItemEffect(TEST_ITEM_IDS.throatSpray, {
        moveFlags: { sound: true },
      });
      expect(result).toEqual({ stat: TEST_STAT_IDS.spAttack, stages: 1, consumed: true });
    });

    // Source: Showdown data/items.ts -- Eject Pack forces switch on stat drop
    it("given Eject Pack with stat lowered, when checking effect, then returns consumed", () => {
      const result = getConsumableItemEffect(TEST_ITEM_IDS.ejectPack, { statChange: -1 });
      expect(result).toEqual({ stat: TEST_STAT_IDS.none, stages: 0, consumed: true });
    });

    it("given non-consumable item, when checking effect, then returns null", () => {
      const result = getConsumableItemEffect(TEST_ITEM_IDS.leftovers, {});
      expect(result).toBeNull();
      expect(result).not.toEqual(expect.objectContaining({ consumed: true }));
    });
  });

  describe("applyGen9HeldItem -- Throat Spray on-hit", () => {
    // Source: Showdown data/items.ts -- Throat Spray after using sound move
    it("given Pokemon with Throat Spray using sound move, when on-hit, then +1 SpA and consumed", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.throatSpray });
      const ctx = createItemContext({
        pokemon,
        move: MOVE_FIXTURES.hyperVoice,
        damage: 80,
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onHit, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.spAttack));
      expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.throatSpray));
    });

    // Source: Showdown data/items.ts -- Throat Spray does not trigger on non-sound
    it("given Pokemon with Throat Spray using non-sound move, when on-hit, then no activation", () => {
      const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.throatSpray });
      const ctx = createItemContext({
        pokemon,
        move: { ...MOVE_FIXTURES.tackle, flags: {} },
        damage: 80,
      });
      const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onHit, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Shell Bell / King's Rock / Razor Fang (on-hit)
// ═══════════════════════════════════════════════════════════════════════════

describe("On-Hit Items", () => {
  // Source: Showdown data/items.ts -- Shell Bell heals 1/8 damage dealt
  it("given Pokemon with Shell Bell dealing 80 damage, when on-hit, then heals 10 HP", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.shellBell, hp: 200 });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.tackle,
      damage: 80,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(true);
    // floor(80 / 8) = 10
    expect(result.effects[0]).toEqual(healSelf(10));
  });

  // Source: Showdown data/items.ts -- King's Rock 10% flinch
  it("given Pokemon with King's Rock dealing damage when RNG succeeds, when on-hit, then flinch opponent", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.kingsRock });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.tackle,
      damage: 50,
      rng: createDeterministicRng({ chance: () => true }),
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(flinchOpponent());
  });

  // Source: Showdown data/items.ts -- King's Rock 10% chance (fails 90%)
  it("given Pokemon with King's Rock dealing damage when RNG fails, when on-hit, then no activation", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.kingsRock });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.tackle,
      damage: 50,
      rng: createDeterministicRng({ chance: () => false }),
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Klutz / Embargo / Magic Room suppression
// ═══════════════════════════════════════════════════════════════════════════

describe("Item Suppression", () => {
  // Source: Showdown data/abilities.ts -- Klutz blocks all item effects
  it("given Klutz holder with Leftovers, when end-of-turn, then no activation", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.leftovers,
      ability: TEST_ABILITY_IDS.klutz,
      hp: 200,
      currentHp: 100,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  // Source: Showdown -- Embargo blocks item effects
  it("given embargoed holder with Leftovers, when end-of-turn, then no activation", () => {
    const volatiles = new Map([[TEST_VOLATILE_IDS.embargo, { turnsLeft: 3 }]]);
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.leftovers,
      hp: 200,
      currentHp: 100,
      volatiles,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  // Source: Showdown data/moves.ts -- Magic Room blocks all held item effects
  it("given Magic Room active with Leftovers holder, when end-of-turn, then no activation", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.leftovers,
      hp: 200,
      currentHp: 100,
    });
    const state = createBattleState({ magicRoom: { active: true, turnsLeft: 3 } });
    const result = applyGen9HeldItem(
      TEST_TRIGGER_IDS.endOfTurn,
      createItemContext({ pokemon, state }),
    );
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Unburden volatile
// ═══════════════════════════════════════════════════════════════════════════

describe("Unburden", () => {
  // Source: Showdown data/abilities.ts -- Unburden doubles Speed after item consumed
  it("given Unburden holder consuming Sitrus Berry, when triggered, then sets unburden volatile", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.sitrusBerry,
      ability: TEST_ABILITY_IDS.unburden,
      hp: 200,
      currentHp: 80,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has(TEST_VOLATILE_IDS.unburden)).toBe(true);
  });

  // Source: Showdown -- Unburden does not re-apply if already set
  it("given Unburden holder that already has unburden volatile, when consuming another item, then does not re-set volatile", () => {
    const volatiles = new Map([[TEST_VOLATILE_IDS.unburden, { turnsLeft: -1 }]]);
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.sitrusBerry,
      ability: TEST_ABILITY_IDS.unburden,
      hp: 200,
      currentHp: 80,
      volatiles,
    });
    const ctx = createItemContext({ pokemon });
    applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
    // volatile should still be there (not duplicated/re-set)
    expect(pokemon.volatileStatuses.get(TEST_VOLATILE_IDS.unburden)).toEqual({ turnsLeft: -1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No item / unknown trigger
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("given Pokemon with no held item, when any trigger fires, then returns inactive", () => {
    const pokemon = createOnFieldPokemon({ heldItem: null });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  it("given unknown trigger type, when applyGen9HeldItem called, then returns inactive", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.leftovers });
    const result = applyGen9HeldItem(
      TEST_TRIGGER_IDS.unknown as string,
      createItemContext({ pokemon }),
    );
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Air Balloon on-damage-taken
// ═══════════════════════════════════════════════════════════════════════════

describe("Air Balloon on-damage-taken", () => {
  // Source: Showdown data/items.ts -- Air Balloon pops when hit by damaging move
  it("given Pokemon with Air Balloon hit by damaging move, when on-damage-taken, then balloon consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.airBalloon,
      hp: 200,
      currentHp: 180,
    });
    const ctx = createItemContext({ pokemon, damage: 20 });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(consumeSelf(TEST_ITEM_IDS.airBalloon));
  });

  it("given Pokemon with Air Balloon taking 0 damage, when on-damage-taken, then no activation", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.airBalloon,
      hp: 200,
      currentHp: 200,
    });
    const ctx = createItemContext({ pokemon, damage: 0 });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Red Card / Eject Button
// ═══════════════════════════════════════════════════════════════════════════

describe("Red Card and Eject Button", () => {
  // Source: Showdown data/items.ts -- Red Card forces attacker to switch
  it("given Pokemon with Red Card taking damage, when on-damage-taken, then forces opponent switch and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.redCard,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(forceSwitchOpponent());
    expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.redCard));
  });

  // Source: Showdown data/items.ts -- Eject Button forces holder to switch
  it("given Pokemon with Eject Button taking damage, when on-damage-taken, then forces self switch and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.ejectButton,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(forceSwitchSelf());
    expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.ejectButton));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mental Herb
// ═══════════════════════════════════════════════════════════════════════════

describe("Mental Herb", () => {
  // Source: Showdown data/items.ts -- Mental Herb cures Taunt, Encore, etc.
  it("given taunted Pokemon with Mental Herb, when end-of-turn, then cures taunt and consumed", () => {
    const volatiles = new Map([[TEST_VOLATILE_IDS.taunt, { turnsLeft: 3 }]]);
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.mentalHerb, volatiles });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(volatileCureSelf(TEST_VOLATILE_IDS.taunt));
    expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.mentalHerb));
  });

  it("given healthy Pokemon with Mental Herb (no volatiles), when end-of-turn, then no activation", () => {
    const pokemon = createOnFieldPokemon({ heldItem: TEST_ITEM_IDS.mentalHerb });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sticky Barb
// ═══════════════════════════════════════════════════════════════════════════

describe("Sticky Barb", () => {
  // Source: Showdown data/items.ts -- Sticky Barb 1/8 HP damage each turn
  it("given Pokemon with Sticky Barb at end-of-turn, when triggered, then takes 1/8 maxHP damage", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.stickyBarb,
      hp: 200,
      currentHp: 200,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    // floor(200 / 8) = 25
    expect(result.effects[0]).toEqual(chipDamageSelf(25));
  });

  // Different maxHP for triangulation
  it("given Pokemon with Sticky Barb with maxHP 160, when end-of-turn, then takes 20 damage", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.stickyBarb,
      hp: 160,
      currentHp: 160,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    // floor(160 / 8) = 20
    expect(result.effects[0]).toEqual(chipDamageSelf(20));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Absorb Bulb / Cell Battery / Snowball / Luminous Moss (on-damage-taken)
// ═══════════════════════════════════════════════════════════════════════════

describe("Type-triggered stat berries/items", () => {
  // Source: Showdown data/items.ts -- Absorb Bulb +1 SpA on Water hit
  it("given Pokemon with Absorb Bulb hit by Water move, when on-damage-taken, then +1 SpA and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.absorbBulb,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.surf,
      damage: 50,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.spAttack));
    expect(result.effects[1]).toEqual(consumeSelf(TEST_ITEM_IDS.absorbBulb));
  });

  // Absorb Bulb does not trigger on non-Water
  it("given Pokemon with Absorb Bulb hit by Fire move, when on-damage-taken, then no activation", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.absorbBulb,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.flamethrower,
      damage: 50,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });

  // Source: Showdown data/items.ts -- Cell Battery +1 Atk on Electric hit
  it("given Pokemon with Cell Battery hit by Electric move, when on-damage-taken, then +1 Atk and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.cellBattery,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.thunderbolt,
      damage: 50,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.attack));
  });

  // Source: Showdown data/items.ts -- Snowball +1 Atk on Ice hit
  it("given Pokemon with Snowball hit by Ice move, when on-damage-taken, then +1 Atk and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.snowball,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.iceBeam,
      damage: 50,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.attack));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kee Berry / Maranga Berry
// ═══════════════════════════════════════════════════════════════════════════

describe("Kee and Maranga Berries", () => {
  // Source: Showdown data/items.ts -- Kee Berry +1 Def on physical hit
  it("given Pokemon with Kee Berry hit by physical move, when on-damage-taken, then +1 Def and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.keeBerry,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.tackle,
      damage: 50,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.defense));
  });

  // Source: Showdown data/items.ts -- Maranga Berry +1 SpDef on special hit
  it("given Pokemon with Maranga Berry hit by special move, when on-damage-taken, then +1 SpDef and consumed", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.marangaBerry,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({
      pokemon,
      move: MOVE_FIXTURES.flamethrower,
      damage: 50,
    });
    const result = applyGen9HeldItem(TEST_TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(statBoostSelf(TEST_STAT_IDS.spDefense));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Ruleset.applyHeldItem wiring
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen 9 Ruleset -- applyHeldItem wiring", () => {
  // Source: Showdown data/items.ts -- Leftovers heals 1/16 max HP each end-of-turn
  // Verifies Gen9Ruleset.applyHeldItem delegates to applyGen9HeldItem (not a no-op)
  it("given Gen9Ruleset, when calling applyHeldItem with Leftovers at end-of-turn, then delegates to Gen9 item handler", () => {
    const ruleset = new Gen9Ruleset();
    const pokemon = createOnFieldPokemon({
      heldItem: TEST_ITEM_IDS.leftovers,
      hp: 160,
      currentHp: 120,
    });
    const ctx = createItemContext({ pokemon });
    const result = ruleset.applyHeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    // floor(160 / 16) = 10 HP healed
    expect(result.effects[0]).toEqual(healSelf(10));
  });

  it("given Gen9Ruleset, when calling applyHeldItem with no item, then returns inactive result", () => {
    const ruleset = new Gen9Ruleset();
    const pokemon = createOnFieldPokemon({ heldItem: null });
    const ctx = createItemContext({ pokemon });
    const result = ruleset.applyHeldItem(TEST_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});
