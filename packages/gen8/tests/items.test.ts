import type { ActivePokemon, BattleSide, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_TRIGGER_IDS,
  type PokemonType,
  type PrimaryStatus,
  type SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { hasHeavyDutyBoots } from "../src/Gen8EntryHazards";
import {
  applyGen8HeldItem,
  getBlackSludgeEffect,
  getBlunderPolicyTrigger,
  getChoiceItemBoost,
  getConsumableItemEffect,
  getEjectPackTrigger,
  getEvioliteModifier,
  getFocusSashTrigger,
  getItemDamageModifier,
  getLeftoversHeal,
  getLifeOrbRecoil,
  getRockyHelmetDamage,
  getRoomServiceTrigger,
  getThroatSprayTrigger,
  getTypeBoostItem,
  getTypeResistBerry,
  hasAirBalloon,
  hasIronBall,
  hasUtilityUmbrella,
  isAssaultVestHolder,
  isChoiceLocked,
} from "../src/Gen8Items";
import { Gen8Ruleset } from "../src/Gen8Ruleset";
import { GEN8_TEST_VALUES } from "./helpers/reference-data";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const {
  battle: BATTLE,
  categories: CATEGORIES,
  expectedAmounts: EXPECTED,
  fixedPoint: FIXED_POINT,
  hp: HP,
  items: ITEMS,
  moves: MOVES,
  pokemon: POKEMON,
  volatiles: VOLATILES,
  types: TYPES,
} = GEN8_TEST_VALUES;

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
  isDynamaxed?: boolean;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: POKEMON.uid,
      speciesId: overrides.speciesId ?? 1,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: POKEMON.nature,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? POKEMON.ability,
      abilitySlot: POKEMON.abilitySlot,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as PrimaryStatus | null,
      friendship: 0,
      gender: POKEMON.gender,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: POKEMON.pokeball,
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
    types: overrides.types ?? [POKEMON.defaultType as PokemonType],
    ability: overrides.ability ?? POKEMON.ability,
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
    isDynamaxed: overrides.isDynamaxed ?? false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

const ITEM_TRIGGERS = CORE_ITEM_TRIGGER_IDS;
const NONE = CORE_ABILITY_IDS.none;

function createSyntheticBattleState(
  overrides: {
    weather?: { type: string; turnsLeft: number } | null;
    magicRoom?: { active: boolean; turnsLeft: number } | null;
  } = {},
): BattleState {
  return {
    format: { generation: 8, battleType: BATTLE.singles },
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

function makeRng(): SeededRandom {
  return {
    chance: (_p: number) => false,
    next: () => 0.5,
    nextInt: (min: number, _max: number) => min,
    seed: 12345,
    getState: () => 12345,
  } as unknown as SeededRandom;
}

function makeContext(overrides: {
  pokemon?: ActivePokemon;
  state?: BattleState;
  rng?: SeededRandom;
  move?: any;
  damage?: number;
}): ItemContext {
  return {
    pokemon: overrides.pokemon ?? createOnFieldPokemon({}),
    state: overrides.state ?? createSyntheticBattleState(),
    rng: overrides.rng ?? makeRng(),
    move: overrides.move,
    damage: overrides.damage,
  } as ItemContext;
}

// ═══════════════════════════════════════════════════════════════════════════
// Choice Items
// ═══════════════════════════════════════════════════════════════════════════

describe("Choice Items", () => {
  describe("getChoiceItemBoost", () => {
    // Source: Showdown data/items.ts -- Choice Band onModifyAtk: 1.5x
    it("given Choice Band, when getting boost, then returns atk 1.5x", () => {
      const result = getChoiceItemBoost(ITEMS.choiceBand);
      expect(result).toEqual({ stat: "atk", multiplier: 1.5 });
    });

    // Source: Showdown data/items.ts -- Choice Specs onModifySpA: 1.5x
    it("given Choice Specs, when getting boost, then returns spatk 1.5x", () => {
      const result = getChoiceItemBoost(ITEMS.choiceSpecs);
      expect(result).toEqual({ stat: "spatk", multiplier: 1.5 });
    });

    // Source: Showdown data/items.ts -- Choice Scarf onModifySpe: 1.5x
    it("given Choice Scarf, when getting boost, then returns spe 1.5x", () => {
      const result = getChoiceItemBoost(ITEMS.choiceScarf);
      expect(result).toEqual({ stat: "spe", multiplier: 1.5 });
    });

    it("given a non-choice item, when getting boost, then returns null", () => {
      const result = getChoiceItemBoost(ITEMS.lifeOrb);
      expect(result).toBe(null);
    });
  });

  describe("isChoiceLocked", () => {
    it("given Pokemon with Choice Band and not Dynamaxed, when checking lock, then returns true", () => {
      const pokemon = createOnFieldPokemon({ heldItem: ITEMS.choiceBand, isDynamaxed: false });
      expect(isChoiceLocked(pokemon)).toBe(true);
    });

    it("given Pokemon with Choice Specs and not Dynamaxed, when checking lock, then returns true", () => {
      const pokemon = createOnFieldPokemon({ heldItem: ITEMS.choiceSpecs, isDynamaxed: false });
      expect(isChoiceLocked(pokemon)).toBe(true);
    });

    // Source: Bulbapedia "Dynamax" -- Choice items do not lock during Dynamax
    // Source: Showdown sim/battle-actions.ts Gen 8 -- Dynamax suppresses Choice lock
    it("given Pokemon with Choice Band and isDynamaxed=true, when checking lock, then returns false", () => {
      const pokemon = createOnFieldPokemon({ heldItem: ITEMS.choiceBand, isDynamaxed: true });
      expect(isChoiceLocked(pokemon)).toBe(false);
    });

    it("given Pokemon with Choice Scarf and isDynamaxed=true, when checking lock, then returns false", () => {
      const pokemon = createOnFieldPokemon({ heldItem: ITEMS.choiceScarf, isDynamaxed: true });
      expect(isChoiceLocked(pokemon)).toBe(false);
    });

    it("given Pokemon with no held item, when checking lock, then returns false", () => {
      const pokemon = createOnFieldPokemon({ heldItem: null });
      expect(isChoiceLocked(pokemon)).toBe(false);
    });

    it("given Pokemon with non-choice item, when checking lock, then returns false", () => {
      const pokemon = createOnFieldPokemon({ heldItem: ITEMS.lifeOrb });
      expect(isChoiceLocked(pokemon)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Item Damage Modifier
// ═══════════════════════════════════════════════════════════════════════════

describe("getItemDamageModifier", () => {
  // Source: Showdown data/items.ts -- Choice Band onModifyAtk: chainModify(1.5)
  // 1.5x in 4096-based = 6144
  it("given Choice Band with physical move, when calculating modifier, then returns 6144", () => {
    const result = getItemDamageModifier(ITEMS.choiceBand, {
      moveCategory: CATEGORIES.physical,
      moveType: TYPES.normal,
    });
    expect(result).toBe(FIXED_POINT.boost15);
  });

  it("given Choice Band with special move, when calculating modifier, then returns 4096 (no effect)", () => {
    const result = getItemDamageModifier(ITEMS.choiceBand, {
      moveCategory: CATEGORIES.special,
      moveType: TYPES.normal,
    });
    expect(result).toBe(FIXED_POINT.neutral);
  });

  // Source: Showdown data/items.ts -- Choice Specs onModifySpA: chainModify(1.5)
  it("given Choice Specs with special move, when calculating modifier, then returns 6144", () => {
    const result = getItemDamageModifier(ITEMS.choiceSpecs, {
      moveCategory: CATEGORIES.special,
      moveType: TYPES.normal,
    });
    expect(result).toBe(FIXED_POINT.boost15);
  });

  it("given Choice Specs with physical move, when calculating modifier, then returns 4096 (no effect)", () => {
    const result = getItemDamageModifier(ITEMS.choiceSpecs, {
      moveCategory: CATEGORIES.physical,
      moveType: TYPES.normal,
    });
    expect(result).toBe(FIXED_POINT.neutral);
  });

  // Source: Showdown data/items.ts -- Life Orb onModifyDamage: chainModify([5325, 4096])
  // 1.3x in 4096-based = 5325
  it("given Life Orb, when calculating modifier, then returns 5325", () => {
    const result = getItemDamageModifier(ITEMS.lifeOrb, {
      moveCategory: CATEGORIES.physical,
      moveType: TYPES.fire,
    });
    expect(result).toBe(FIXED_POINT.boost13);
  });

  it("given Life Orb with special move, when calculating modifier, then returns 5325", () => {
    const result = getItemDamageModifier(ITEMS.lifeOrb, {
      moveCategory: CATEGORIES.special,
      moveType: TYPES.water,
    });
    expect(result).toBe(FIXED_POINT.boost13);
  });

  it("given non-damage item, when calculating modifier, then returns 4096 (1.0x)", () => {
    const result = getItemDamageModifier(ITEMS.leftovers, {
      moveCategory: CATEGORIES.physical,
      moveType: TYPES.normal,
    });
    expect(result).toBe(FIXED_POINT.neutral);
  });

  // Source: Showdown data/items.ts -- type-boost onBasePower and Life Orb onModifyDamage
  //   only fire on damaging hits, never on status moves
  it("given Life Orb with a status move, when calculating modifier, then returns 4096 (no boost)", () => {
    // Status moves (Will-O-Wisp, Toxic, etc.) must not receive a damage modifier
    const result = getItemDamageModifier(ITEMS.lifeOrb, {
      moveCategory: CATEGORIES.status,
      moveType: TYPES.fire,
    });
    expect(result).toBe(FIXED_POINT.neutral);
  });

  it("given Charcoal with a Fire-type status move, when calculating modifier, then returns 4096 (no boost)", () => {
    // Type-boost items must not activate for status moves regardless of type match
    const result = getItemDamageModifier(ITEMS.charcoal, {
      moveCategory: CATEGORIES.status,
      moveType: TYPES.fire,
    });
    expect(result).toBe(FIXED_POINT.neutral);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Type-Boost Items
// ═══════════════════════════════════════════════════════════════════════════

describe("getTypeBoostItem", () => {
  // Source: Showdown data/items.ts -- Charcoal onBasePower: chainModify([4915, 4096])
  // 1.2x in 4096-based = 4915
  it("given Charcoal with Fire move, when calculating modifier, then returns 4915", () => {
    expect(getTypeBoostItem(ITEMS.charcoal, TYPES.fire)).toBe(FIXED_POINT.boost12);
  });

  it("given Charcoal with Water move, when calculating modifier, then returns 4096 (no match)", () => {
    expect(getTypeBoostItem(ITEMS.charcoal, TYPES.water)).toBe(FIXED_POINT.neutral);
  });

  // Source: Showdown data/items.ts -- Mystic Water onBasePower: chainModify([4915, 4096])
  it("given Mystic Water with Water move, when calculating modifier, then returns 4915", () => {
    expect(getTypeBoostItem(ITEMS.mysticWater, TYPES.water)).toBe(FIXED_POINT.boost12);
  });

  // Source: packages/gen8/data/items.json -- Charcoal exists in the shipped Gen 8 bundle
  // and carries the same Fire-type boost mechanic under test.
  it("given Charcoal with Fire move, when calculating modifier, then returns 4915", () => {
    expect(getTypeBoostItem(ITEMS.charcoal, TYPES.fire)).toBe(FIXED_POINT.boost12);
  });

  it("given Charcoal with Water move, when calculating modifier, then returns 4096 (no match)", () => {
    expect(getTypeBoostItem(ITEMS.charcoal, TYPES.water)).toBe(FIXED_POINT.neutral);
  });

  // Source: packages/gen8/data/items.json -- Mystic Water exists in the shipped Gen 8 bundle
  // and exercises the same Water-type boost mechanic under test.
  it("given Mystic Water with Water move, when calculating modifier, then returns 4915", () => {
    expect(getTypeBoostItem(ITEMS.mysticWater, TYPES.water)).toBe(FIXED_POINT.boost12);
  });

  it("given non-boost item, when calculating modifier, then returns 4096", () => {
    expect(getTypeBoostItem(ITEMS.leftovers, TYPES.normal)).toBe(FIXED_POINT.neutral);
  });

  // Source: Showdown data/items.ts -- Silk Scarf onBasePower: chainModify([4915, 4096])
  it("given Silk Scarf with Normal move, when calculating modifier, then returns 4915", () => {
    expect(getTypeBoostItem(ITEMS.silkScarf, TYPES.normal)).toBe(FIXED_POINT.boost12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Type-Resist Berries
// ═══════════════════════════════════════════════════════════════════════════

describe("getTypeResistBerry", () => {
  // Source: Showdown data/items.ts -- Occa Berry onSourceModifyDamage: chainModify(0.5)
  // 0.5x in 4096-based = 2048
  it("given Occa Berry with super-effective Fire move, when calculating modifier, then returns 2048", () => {
    expect(getTypeResistBerry(ITEMS.occaBerry, TYPES.fire, 2)).toBe(FIXED_POINT.resistHalf);
  });

  it("given Occa Berry with neutral Fire move, when calculating modifier, then returns 4096 (no activation)", () => {
    expect(getTypeResistBerry(ITEMS.occaBerry, TYPES.fire, 1)).toBe(FIXED_POINT.neutral);
  });

  it("given Occa Berry with non-Fire move, when calculating modifier, then returns 4096 (wrong type)", () => {
    expect(getTypeResistBerry(ITEMS.occaBerry, TYPES.water, 2)).toBe(FIXED_POINT.neutral);
  });

  // Source: Bulbapedia "Chilan Berry" -- activates on any Normal hit (no SE requirement)
  it("given Chilan Berry with Normal move (neutral), when calculating modifier, then returns 2048", () => {
    expect(getTypeResistBerry(ITEMS.chilanBerry, TYPES.normal, 1)).toBe(FIXED_POINT.resistHalf);
  });

  // Source: Showdown data/items.ts -- Yache Berry: Ice resist
  it("given Yache Berry with 4x effective Ice move, when calculating modifier, then returns 2048", () => {
    expect(getTypeResistBerry(ITEMS.yacheBerry, TYPES.ice, 4)).toBe(FIXED_POINT.resistHalf);
  });

  it("given non-berry item, when calculating modifier, then returns 4096", () => {
    expect(getTypeResistBerry(ITEMS.leftovers, TYPES.fire, 2)).toBe(FIXED_POINT.neutral);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Life Orb
// ═══════════════════════════════════════════════════════════════════════════

describe("getLifeOrbRecoil", () => {
  // Source: Showdown data/items.ts -- Life Orb onAfterMoveSecondarySelf:
  //   this.damage(pokemon.baseMaxhp / 10)
  // floor(200 / 10) = 20
  it("given 200 max HP, when calculating recoil, then returns 20", () => {
    expect(getLifeOrbRecoil(HP.lifeOrbRecoil)).toBe(EXPECTED.lifeOrbRecoil200);
  });

  // floor(160 / 10) = 16
  it("given 160 max HP, when calculating recoil, then returns 16", () => {
    expect(getLifeOrbRecoil(HP.leftOversRecoil)).toBe(EXPECTED.lifeOrbRecoil160);
  });

  // floor(1 / 10) = 0, minimum 1
  it("given 1 max HP, when calculating recoil, then returns 1 (minimum)", () => {
    expect(getLifeOrbRecoil(HP.min)).toBe(EXPECTED.minimum);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Leftovers
// ═══════════════════════════════════════════════════════════════════════════

describe("getLeftoversHeal", () => {
  // Source: Showdown data/items.ts -- Leftovers onResidual: heal(target.baseMaxhp / 16)
  // floor(320 / 16) = 20
  it("given 320 max HP, when calculating heal, then returns 20", () => {
    expect(getLeftoversHeal(HP.blackSludgeHeal)).toBe(EXPECTED.leftoversHeal320);
  });

  // floor(200 / 16) = 12
  it("given 200 max HP, when calculating heal, then returns 12", () => {
    expect(getLeftoversHeal(HP.lifeOrbRecoil)).toBe(EXPECTED.leftoversHeal200);
  });

  // floor(1 / 16) = 0, minimum 1
  it("given 1 max HP, when calculating heal, then returns 1 (minimum)", () => {
    expect(getLeftoversHeal(HP.min)).toBe(EXPECTED.minimum);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Black Sludge
// ═══════════════════════════════════════════════════════════════════════════

describe("getBlackSludgeEffect", () => {
  // Source: Showdown data/items.ts -- Black Sludge onResidual:
  //   Poison: heal target.baseMaxhp / 16
  //   Non-poison: damage target.baseMaxhp / 8
  it("given Poison-type with 320 max HP, when calculating effect, then heals 20", () => {
    const result = getBlackSludgeEffect({ types: [TYPES.poison], maxHp: HP.blackSludgeHeal });
    expect(result).toEqual({ type: "heal", amount: EXPECTED.blackSludgeHeal320 });
  });

  it("given Poison/Dark-type with 200 max HP, when calculating effect, then heals 12", () => {
    const result = getBlackSludgeEffect({
      types: [TYPES.poison, TYPES.dark],
      maxHp: HP.lifeOrbRecoil,
    });
    expect(result).toEqual({ type: "heal", amount: EXPECTED.blackSludgeHeal200 });
  });

  it("given Normal-type with 320 max HP, when calculating effect, then damages 40", () => {
    const result = getBlackSludgeEffect({ types: [TYPES.normal], maxHp: HP.blackSludgeHeal });
    // floor(320 / 8) = 40
    expect(result).toEqual({ type: "damage", amount: EXPECTED.blackSludgeDamage320 });
  });

  it("given Fire-type with 200 max HP, when calculating effect, then damages 25", () => {
    const result = getBlackSludgeEffect({ types: [TYPES.fire], maxHp: HP.lifeOrbRecoil });
    // floor(200 / 8) = 25
    expect(result).toEqual({ type: "damage", amount: EXPECTED.blackSludgeDamage200 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rocky Helmet
// ═══════════════════════════════════════════════════════════════════════════

describe("getRockyHelmetDamage", () => {
  // Source: Showdown data/items.ts -- Rocky Helmet onDamagingHit:
  //   this.damage(source.baseMaxhp / 6, source, target)
  // floor(300 / 6) = 50
  it("given 300 max HP, when calculating chip damage, then returns 50", () => {
    expect(getRockyHelmetDamage(HP.rockyHelmetDamage)).toBe(EXPECTED.rockyHelmetDamage300);
  });

  // floor(200 / 6) = 33
  it("given 200 max HP, when calculating chip damage, then returns 33", () => {
    expect(getRockyHelmetDamage(HP.lifeOrbRecoil)).toBe(EXPECTED.rockyHelmetDamage200);
  });

  // floor(1 / 6) = 0, minimum 1
  it("given 1 max HP, when calculating chip damage, then returns 1 (minimum)", () => {
    expect(getRockyHelmetDamage(HP.min)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Focus Sash
// ═══════════════════════════════════════════════════════════════════════════

describe("getFocusSashTrigger", () => {
  // Source: Showdown data/items.ts -- Focus Sash onDamagePriority:
  //   if (pokemon.hp === pokemon.maxhp && damage >= pokemon.hp)
  it("given full HP and lethal damage, when checking trigger, then returns true", () => {
    expect(
      getFocusSashTrigger({
        currentHp: HP.lifeOrbRecoil,
        maxHp: HP.lifeOrbRecoil,
        damage: HP.lifeOrbRecoil,
      }),
    ).toBe(true);
  });

  it("given full HP and overkill damage, when checking trigger, then returns true", () => {
    expect(
      getFocusSashTrigger({ currentHp: HP.lifeOrbRecoil, maxHp: HP.lifeOrbRecoil, damage: 500 }),
    ).toBe(true);
  });

  it("given not full HP and lethal damage, when checking trigger, then returns false", () => {
    expect(
      getFocusSashTrigger({ currentHp: 150, maxHp: HP.lifeOrbRecoil, damage: HP.lifeOrbRecoil }),
    ).toBe(false);
  });

  it("given full HP and non-lethal damage, when checking trigger, then returns false", () => {
    expect(
      getFocusSashTrigger({ currentHp: HP.lifeOrbRecoil, maxHp: HP.lifeOrbRecoil, damage: 100 }),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Eviolite
// ═══════════════════════════════════════════════════════════════════════════

describe("getEvioliteModifier", () => {
  // Source: Showdown data/items.ts -- Eviolite onModifyDef/onModifySpD: chainModify(1.5)
  // 1.5x in 4096-based = 6144
  it("given unevolved Pokemon, when calculating modifier, then returns 6144", () => {
    expect(getEvioliteModifier(true)).toBe(EXPECTED.evioliteBoost);
  });

  it("given fully evolved Pokemon, when calculating modifier, then returns 4096 (no boost)", () => {
    expect(getEvioliteModifier(false)).toBe(FIXED_POINT.neutral);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Heavy-Duty Boots (Gen 8 new)
// ═══════════════════════════════════════════════════════════════════════════

describe("hasHeavyDutyBoots", () => {
  // Source: Showdown data/items.ts -- heavydutyboots: immunity to entry hazards
  // Source: Bulbapedia "Heavy-Duty Boots" -- protects from effects of entry hazards
  it("given Pokemon holding Heavy-Duty Boots, when checking, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.heavyDutyBoots });
    expect(hasHeavyDutyBoots(pokemon)).toBe(true);
  });

  it("given Pokemon holding Leftovers, when checking, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.leftovers });
    expect(hasHeavyDutyBoots(pokemon)).toBe(false);
  });

  it("given Pokemon with no held item, when checking, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: null });
    expect(hasHeavyDutyBoots(pokemon)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Utility Umbrella (Gen 8 new)
// ═══════════════════════════════════════════════════════════════════════════

describe("hasUtilityUmbrella", () => {
  // Source: Showdown data/items.ts -- utilityumbrella: weather immunity for holder
  // Source: Bulbapedia "Utility Umbrella" -- negates weather effects
  it("given Pokemon holding Utility Umbrella, when checking, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.utilityUmbrella });
    expect(hasUtilityUmbrella(pokemon)).toBe(true);
  });

  it("given Pokemon holding Life Orb, when checking, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.lifeOrb });
    expect(hasUtilityUmbrella(pokemon)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Assault Vest
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssaultVestHolder", () => {
  // Source: Showdown data/items.ts -- Assault Vest onModifySpD/onDisableMove
  it("given Pokemon holding Assault Vest, when checking, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.assaultVest });
    expect(isAssaultVestHolder(pokemon)).toBe(true);
  });

  it("given Pokemon holding Leftovers, when checking, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.leftovers });
    expect(isAssaultVestHolder(pokemon)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Air Balloon
// ═══════════════════════════════════════════════════════════════════════════

describe("hasAirBalloon", () => {
  // Source: Showdown data/items.ts -- Air Balloon: immunity to Ground
  // Source: Bulbapedia "Air Balloon" -- immune to Ground-type moves while held
  it("given Pokemon holding Air Balloon, when checking, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.airBalloon });
    expect(hasAirBalloon(pokemon)).toBe(true);
  });

  it("given Pokemon with no item, when checking, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: null });
    expect(hasAirBalloon(pokemon)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Iron Ball
// ═══════════════════════════════════════════════════════════════════════════

describe("hasIronBall", () => {
  // Source: Showdown data/items.ts -- Iron Ball: onModifySpe 0.5x, grounds holder
  it("given Pokemon holding Iron Ball, when checking, then returns true", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.ironBall });
    expect(hasIronBall(pokemon)).toBe(true);
  });

  it("given Pokemon holding Leftovers, when checking, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.leftovers });
    expect(hasIronBall(pokemon)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen 8 New Consumable Items
// ═══════════════════════════════════════════════════════════════════════════

describe("Eject Pack", () => {
  // Source: Showdown data/items.ts -- Eject Pack onAfterBoost:
  //   if any boost is < 0, force switch and consume item
  it("given a stat decrease, when checking trigger, then returns true", () => {
    expect(getEjectPackTrigger(-1)).toBe(true);
  });

  it("given a stat decrease of -2, when checking trigger, then returns true", () => {
    expect(getEjectPackTrigger(-2)).toBe(true);
  });

  it("given a stat increase, when checking trigger, then returns false", () => {
    expect(getEjectPackTrigger(1)).toBe(false);
  });

  it("given no change, when checking trigger, then returns false", () => {
    expect(getEjectPackTrigger(0)).toBe(false);
  });
});

describe("Blunder Policy", () => {
  // Source: Showdown data/items.ts -- Blunder Policy onAfterMoveSelf:
  //   if (!move.hit) { boost speed +2, consume }
  // Source: Bulbapedia "Blunder Policy" -- raises Speed by 2 when a move misses
  it("given move missed, when checking trigger, then returns true", () => {
    expect(getBlunderPolicyTrigger(true)).toBe(true);
  });

  it("given move hit, when checking trigger, then returns false", () => {
    expect(getBlunderPolicyTrigger(false)).toBe(false);
  });
});

describe("Throat Spray", () => {
  // Source: Showdown data/items.ts -- Throat Spray onAfterMoveSecondarySelf:
  //   if (move.flags['sound']) { boost spa +1, consume }
  // Source: Bulbapedia "Throat Spray" -- raises Sp. Atk by 1 after sound move
  it("given sound move used, when checking trigger, then returns true", () => {
    expect(getThroatSprayTrigger({ sound: true })).toBe(true);
  });

  it("given non-sound move used, when checking trigger, then returns false", () => {
    expect(getThroatSprayTrigger({ sound: false })).toBe(false);
  });

  it("given no flags, when checking trigger, then returns false", () => {
    expect(getThroatSprayTrigger(undefined)).toBe(false);
  });

  it("given flags without sound property, when checking trigger, then returns false", () => {
    expect(getThroatSprayTrigger({})).toBe(false);
  });
});

describe("Room Service", () => {
  // Source: Showdown data/items.ts -- Room Service: onAfterTrickRoom
  // Source: Bulbapedia "Room Service" -- lowers Speed by 1 when Trick Room activates
  it("given Trick Room is active, when checking trigger, then returns true", () => {
    expect(getRoomServiceTrigger(true)).toBe(true);
  });

  it("given Trick Room is not active, when checking trigger, then returns false", () => {
    expect(getRoomServiceTrigger(false)).toBe(false);
  });
});

describe("getConsumableItemEffect", () => {
  // Source: Showdown data/items.ts -- Blunder Policy: boost speed +2
  it("given Blunder Policy and move missed, when getting effect, then returns speed +2 consumed", () => {
    const result = getConsumableItemEffect(ITEMS.blunderPolicy, { moveMissed: true });
    expect(result).toEqual({ stat: "speed", stages: 2, consumed: true });
  });

  it("given Blunder Policy and move hit, when getting effect, then returns null", () => {
    const result = getConsumableItemEffect(ITEMS.blunderPolicy, { moveMissed: false });
    expect(result).toBe(null);
  });

  // Source: Showdown data/items.ts -- Throat Spray: boost spa +1
  it("given Throat Spray and sound move, when getting effect, then returns spAttack +1 consumed", () => {
    const result = getConsumableItemEffect(ITEMS.throatSpray, { moveFlags: { sound: true } });
    expect(result).toEqual({ stat: "spAttack", stages: 1, consumed: true });
  });

  it("given Throat Spray and non-sound move, when getting effect, then returns null", () => {
    const result = getConsumableItemEffect(ITEMS.throatSpray, { moveFlags: { sound: false } });
    expect(result).toBe(null);
  });

  // Source: Showdown data/items.ts -- Room Service: boost spe -1
  it("given Room Service and Trick Room active, when getting effect, then returns speed -1 consumed", () => {
    const result = getConsumableItemEffect(ITEMS.roomService, { trickRoomActive: true });
    expect(result).toEqual({ stat: "speed", stages: -1, consumed: true });
  });

  it("given Room Service and no Trick Room, when getting effect, then returns null", () => {
    const result = getConsumableItemEffect(ITEMS.roomService, { trickRoomActive: false });
    expect(result).toBe(null);
  });

  // Source: Showdown data/items.ts -- Eject Pack: force switch on stat decrease
  it("given Eject Pack and stat decreased, when getting effect, then returns consumed with no stat change", () => {
    const result = getConsumableItemEffect(ITEMS.ejectPack, { statChange: -1 });
    expect(result).toEqual({ stat: NONE, stages: 0, consumed: true });
  });

  it("given Eject Pack and stat increased, when getting effect, then returns null", () => {
    const result = getConsumableItemEffect(ITEMS.ejectPack, { statChange: 1 });
    expect(result).toBe(null);
  });

  it("given passive item, when getting effect, then returns null", () => {
    const result = getConsumableItemEffect(ITEMS.leftovers, {});
    expect(result).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyGen8HeldItem -- End-of-Turn triggers
// ═══════════════════════════════════════════════════════════════════════════

describe("applyGen8HeldItem", () => {
  describe("end-of-turn triggers", () => {
    // Source: Showdown data/items.ts -- Leftovers onResidual: heal 1/16 max HP
    it("given Leftovers holder at end-of-turn, when applying item, then heals 1/16 max HP", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.leftovers,
        hp: HP.blackSludgeHeal,
        currentHp: HP.lifeOrbRecoil,
      });
      const ctx = makeContext({ pokemon });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      // floor(320 / 16) = 20
      expect(result.effects[0]).toEqual({
        type: "heal",
        target: "self",
        value: EXPECTED.leftoversHeal320,
      });
    });

    // Source: Showdown data/items.ts -- Black Sludge: heal Poison 1/16, damage non-Poison 1/8
    it("given Poison-type with Black Sludge at end-of-turn, when applying item, then heals 1/16 max HP", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.blackSludge,
        hp: HP.blackSludgeHeal,
        currentHp: HP.lifeOrbRecoil,
        types: [TYPES.poison],
      });
      const ctx = makeContext({ pokemon });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      // floor(320 / 16) = 20
      expect(result.effects[0]).toEqual({
        type: "heal",
        target: "self",
        value: EXPECTED.blackSludgeHeal320,
      });
    });

    it("given Normal-type with Black Sludge at end-of-turn, when applying item, then damages 1/8 max HP", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.blackSludge,
        hp: HP.blackSludgeHeal,
        currentHp: HP.lifeOrbRecoil,
        types: [TYPES.normal],
      });
      const ctx = makeContext({ pokemon });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      // floor(320 / 8) = 40
      expect(result.effects[0]).toEqual({
        type: "chip-damage",
        target: "self",
        value: EXPECTED.blackSludgeDamage320,
      });
    });
  });

  describe("on-damage-taken triggers", () => {
    // Focus Sash was moved from handleOnDamageTaken to capLethalDamage (pre-damage hook).
    // See: Gen8Ruleset.capLethalDamage and GitHub issue #784
    it("given Focus Sash holder at full HP taking lethal damage, when on-damage-taken fires, then does NOT activate (handled by capLethalDamage now)", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.focusSash,
        hp: HP.lifeOrbRecoil,
        currentHp: HP.lifeOrbRecoil,
      });
      const ctx = makeContext({ pokemon, damage: 250 });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      expect(result.activated).toBe(false);
    });

    it("given Focus Sash holder NOT at full HP taking lethal damage, when on-damage-taken fires, then does not activate", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.focusSash,
        hp: HP.lifeOrbRecoil,
        currentHp: 150,
      });
      const ctx = makeContext({ pokemon, damage: HP.lifeOrbRecoil });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      expect(result.activated).toBe(false);
    });

    // Source: Showdown data/items.ts -- Air Balloon: pops on hit
    it("given Air Balloon holder taking damage, when applying item, then balloon pops (consumed)", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.airBalloon,
        hp: HP.lifeOrbRecoil,
        currentHp: HP.lifeOrbRecoil,
      });
      const ctx = makeContext({ pokemon, damage: 50 });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        type: "consume",
        target: "self",
        value: ITEMS.airBalloon,
      });
    });

    // Source: Showdown data/items.ts -- Air Balloon: pops on hit regardless of damage amount
    it("given Air Balloon holder taking 1 damage (minimum), when applying item, then balloon pops (consumed)", () => {
      // Triangulation: different damage value confirms balloon always pops when hit
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.airBalloon,
        hp: HP.airBalloonPop,
        currentHp: HP.airBalloonPop,
      });
      const ctx = makeContext({ pokemon, damage: 1 });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        type: "consume",
        target: "self",
        value: ITEMS.airBalloon,
      });
    });
  });

  describe("on-contact triggers", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet: 1/6 attacker max HP on contact
    it("given Rocky Helmet holder hit by contact move, when applying item, then deals 1/6 of opponent max HP", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.rockyHelmet,
        hp: HP.lifeOrbRecoil,
        currentHp: HP.lifeOrbRecoil,
      });
      const state = createSyntheticBattleState();
      // Set up sides with the holder and an opponent
      const opponent = createOnFieldPokemon({
        hp: HP.rockyHelmetDamage,
        currentHp: HP.rockyHelmetDamage,
      });
      state.sides[0].active = [pokemon];
      state.sides[1].active = [opponent];
      const ctx = makeContext({
        pokemon,
        state,
        move: {
          id: MOVES.tackle,
          type: TYPES.normal,
          category: CATEGORIES.physical,
          power: 40,
          flags: { contact: true },
        },
      });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.onContact, ctx);
      expect(result.activated).toBe(true);
      // floor(300 / 6) = 50 (opponent's max HP)
      expect(result.effects[0]).toEqual({
        type: "chip-damage",
        target: "opponent",
        value: EXPECTED.rockyHelmetDamage300,
      });
    });

    it("given Rocky Helmet holder hit by non-contact move, when applying item, then does not activate", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.rockyHelmet,
        hp: HP.lifeOrbRecoil,
        currentHp: HP.lifeOrbRecoil,
      });
      const ctx = makeContext({
        pokemon,
        move: {
          id: MOVES.surf,
          type: TYPES.water,
          category: CATEGORIES.special,
          power: 90,
          flags: {},
        },
      });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.onContact, ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("on-hit triggers (attacker perspective)", () => {
    // Source: Showdown data/items.ts -- Life Orb: recoil floor(maxHP/10)
    it("given Life Orb holder dealing damage, when applying item, then takes 1/10 max HP recoil", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.lifeOrb,
        hp: HP.lifeOrbRecoil,
        currentHp: HP.lifeOrbRecoil,
      });
      const ctx = makeContext({
        pokemon,
        damage: 50,
        move: { id: MOVES.tackle, type: TYPES.normal, category: CATEGORIES.physical, power: 40 },
      });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.onHit, ctx);
      expect(result.activated).toBe(true);
      // floor(200 / 10) = 20
      expect(result.effects[0]).toEqual({
        type: "chip-damage",
        target: "self",
        value: EXPECTED.lifeOrbRecoil200,
      });
    });

    // Source: Showdown data/items.ts -- Life Orb: floor(baseMaxhp / 10)
    it("given Life Orb holder with 300 max HP dealing a special move, when applying item, then takes 30 recoil", () => {
      // Triangulation: different HP value confirms it's not a constant return
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.lifeOrb,
        hp: HP.rockyHelmetDamage,
        currentHp: HP.rockyHelmetDamage,
      });
      const ctx = makeContext({
        pokemon,
        damage: 80,
        move: { id: MOVES.flamethrower, type: TYPES.fire, category: CATEGORIES.special, power: 90 },
      });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.onHit, ctx);
      expect(result.activated).toBe(true);
      // floor(300 / 10) = 30
      expect(result.effects[0]).toEqual({
        type: "chip-damage",
        target: "self",
        value: EXPECTED.lifeOrbRecoil300,
      });
    });
  });

  describe("suppression mechanics", () => {
    // Source: Showdown data/abilities.ts -- Klutz: suppress all item effects
    it("given Klutz holder with Leftovers at end-of-turn, when applying item, then does not activate", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.leftovers,
        hp: HP.lifeOrbRecoil,
        currentHp: 100,
        ability: CORE_ABILITY_IDS.klutz,
      });
      const ctx = makeContext({ pokemon });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });

    // Source: Showdown -- Embargo blocks item effects
    it("given embargoed holder with Leftovers at end-of-turn, when applying item, then does not activate", () => {
      const volatiles = new Map<string, { turnsLeft: number }>();
      volatiles.set(VOLATILES.embargo, { turnsLeft: 3 });
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.leftovers,
        hp: HP.lifeOrbRecoil,
        currentHp: 100,
        volatiles,
      });
      const ctx = makeContext({ pokemon });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });

    // Source: Showdown -- Magic Room suppresses all held item effects
    it("given Magic Room active with Leftovers holder at end-of-turn, when applying item, then does not activate", () => {
      const pokemon = createOnFieldPokemon({
        heldItem: ITEMS.leftovers,
        hp: HP.lifeOrbRecoil,
        currentHp: 100,
      });
      const state = createSyntheticBattleState({ magicRoom: { active: true, turnsLeft: 3 } });
      const ctx = makeContext({ pokemon, state });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("no item", () => {
    it("given Pokemon with no held item, when applying any trigger, then does not activate", () => {
      const pokemon = createOnFieldPokemon({ heldItem: null });
      const ctx = makeContext({ pokemon });
      const result = applyGen8HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen8Ruleset.applyHeldItem wiring
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen 8 Ruleset -- applyHeldItem wiring", () => {
  // Source: Showdown data/items.ts -- Leftovers heals 1/16 max HP each end-of-turn
  // Verifies Gen8Ruleset.applyHeldItem delegates to applyGen8HeldItem (not a no-op)
  it("given Gen8Ruleset, when calling applyHeldItem with Leftovers at end-of-turn, then delegates to Gen8 item handler", () => {
    const ruleset = new Gen8Ruleset();
    const pokemon = createOnFieldPokemon({
      heldItem: ITEMS.leftovers,
      hp: HP.leftOversRecoil,
      currentHp: 120,
    });
    const ctx = makeContext({ pokemon });
    const result = ruleset.applyHeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    // floor(160 / 16) = 10 HP healed
    expect(result.effects[0]).toEqual({
      type: "heal",
      target: "self",
      value: EXPECTED.leftoversHeal160,
    });
  });

  it("given Gen8Ruleset, when calling applyHeldItem with no item, then returns inactive result", () => {
    const ruleset = new Gen8Ruleset();
    const pokemon = createOnFieldPokemon({ heldItem: null });
    const ctx = makeContext({ pokemon });
    const result = ruleset.applyHeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});
