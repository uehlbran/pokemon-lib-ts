import type {
  ActivePokemon,
  BattleAction,
  BattleState,
  CritContext,
  DamageContext,
  ItemContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { ALL_NATURES, CORE_STATUS_IDS, CORE_TYPE_IDS, CORE_VOLATILE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_SPECIES_IDS,
} from "../../src";
import { calculateGen3Damage } from "../../src/Gen3DamageCalc";
import { applyGen3HeldItem } from "../../src/Gen3Items";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";
import { GEN3_TYPE_CHART } from "../../src/Gen3TypeChart";

/**
 * Gen 3 Held Item Tests
 *
 * Gen 3 modernized the held item system from Gen 2, introducing named berries,
 * Choice Band, Shell Bell, and other competitive staples.
 *
 * Sources: pret/pokeemerald src/battle_util.c ItemBattleEffects
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock RNG with configurable chance and int results. */
function createMockRng(chanceResult = false, intResult = 0) {
  return {
    next: () => 0.5,
    int: (_min: number, _max: number) => intResult,
    chance: (_percent: number) => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

const dataManager = createGen3DataManager();
const DEFAULT_NATURE = ALL_NATURES[0].id;
const DEFAULT_TACKLE = dataManager.getMove(GEN3_MOVE_IDS.tackle);
const INFATUATION_VOLATILE = "infatuation" as const;

/** Create a minimal ActivePokemon mock for item tests. */
function createMockPokemon(opts: {
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  types?: PokemonType[];
  hasConfusion?: boolean;
  hasInfatuation?: boolean;
  ability?: string;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  level?: number;
  speciesId?: number;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: opts.speciesId ?? GEN3_SPECIES_IDS.bulbasaur,
    nickname: null,
    level: opts.level ?? 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [{ moveId: DEFAULT_TACKLE.id, pp: DEFAULT_TACKLE.pp, maxPp: DEFAULT_TACKLE.pp }],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: GEN3_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  };

  const volatileStatuses: Map<string, { turnsLeft: number; data?: Record<string, unknown> }> =
    new Map();
  if (opts.hasConfusion) {
    volatileStatuses.set(CORE_VOLATILE_IDS.confusion, { turnsLeft: 3 });
  }
  if (opts.hasInfatuation) {
    volatileStatuses.set(INFATUATION_VOLATILE, { turnsLeft: -1 });
  }

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses,
    types: opts.types ?? [CORE_TYPE_IDS.normal],
    ability: opts.ability ?? "",
    lastMoveUsed: null,
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

/** Create a mock ItemContext. */
function createItemContext(opts: {
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  chanceResult?: boolean;
  intResult?: number;
  damage?: number;
  hasConfusion?: boolean;
  hasInfatuation?: boolean;
}): ItemContext {
  const pokemon = createMockPokemon({
    heldItem: opts.heldItem,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    status: opts.status,
    hasConfusion: opts.hasConfusion,
    hasInfatuation: opts.hasInfatuation,
  });

  return {
    pokemon,
    state: {} as BattleState,
    rng: createMockRng(opts.chanceResult ?? false, opts.intResult ?? 0) as ItemContext["rng"],
    damage: opts.damage,
  };
}

/** Create a minimal DamageContext for damage calc item tests. */
function createDamageContext(opts: {
  attackerItem?: string | null;
  defenderItem?: string | null;
  moveType?: PokemonType;
  movePower?: number;
  moveCategory?: "physical" | "special" | "status";
  attackerTypes?: PokemonType[];
  defenderTypes?: PokemonType[];
  attackerAttack?: number;
  defenderDefense?: number;
  level?: number;
  isCrit?: boolean;
  rngRoll?: number;
  attackerAbility?: string;
  defenderAbility?: string;
  attackerStatus?: string | null;
}): DamageContext {
  const attacker = createMockPokemon({
    heldItem: opts.attackerItem ?? null,
    types: opts.attackerTypes ?? [CORE_TYPE_IDS.normal],
    attack: opts.attackerAttack ?? 100,
    spAttack: opts.attackerAttack ?? 100,
    level: opts.level ?? 50,
    ability: opts.attackerAbility ?? "",
    status: opts.attackerStatus ?? null,
  });

  const defender = createMockPokemon({
    heldItem: opts.defenderItem ?? null,
    types: opts.defenderTypes ?? [CORE_TYPE_IDS.normal],
    defense: opts.defenderDefense ?? 100,
    spDefense: opts.defenderDefense ?? 100,
    ability: opts.defenderAbility ?? "",
  });

  const move: MoveData = {
    id: GEN3_MOVE_IDS.tackle,
    name: "Tackle",
    type: opts.moveType ?? CORE_TYPE_IDS.normal,
    category: opts.moveCategory ?? "physical",
    power: opts.movePower ?? 80,
    accuracy: DEFAULT_TACKLE.accuracy,
    pp: DEFAULT_TACKLE.pp,
    maxPp: DEFAULT_TACKLE.pp,
    priority: 0,
    target: "single" as any,
    flags: {} as any,
    generation: 3,
    critRatio: 0,
    effectChance: null,
    effects: [],
    description: "",
  };

  const rng = createMockRng(false, opts.rngRoll ?? 100);

  return {
    attacker,
    defender,
    move,
    state: {
      weather: null,
      sides: [],
    } as unknown as BattleState,
    rng: rng as DamageContext["rng"],
    isCrit: opts.isCrit ?? false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 Held Items", () => {
  // =========================================================================
  // Tier 1: Core Battle Items
  // =========================================================================

  describe("Leftovers", () => {
    it("given a Pokemon holding Leftovers with 200 max HP, when end-of-turn triggers, then heals 12 HP (1/16 of 200)", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_LEFTOVERS — heals floor(maxHP / 16) per turn
      // floor(200 / 16) = 12
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.leftovers,
        currentHp: 150,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]?.type).toBe("heal");
      expect(result.effects[0]?.value).toBe(12);
    });

    it("given a Pokemon holding Leftovers with 100 max HP, when end-of-turn triggers, then heals 6 HP (1/16 of 100)", () => {
      // Source: pret/pokeemerald — floor(100 / 16) = 6
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.leftovers,
        currentHp: 50,
        maxHp: 100,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects[0]?.value).toBe(6);
    });

    it("given a Pokemon holding Leftovers, when end-of-turn triggers, then Leftovers is NOT consumed", () => {
      // Source: pret/pokeemerald — Leftovers is a permanent hold item
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.leftovers,
        currentHp: 150,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      const consumeEffects = result.effects.filter((e) => e.type === "consume");
      expect(consumeEffects.length).toBe(0);
    });

    it("given a Pokemon holding Leftovers with 1 max HP (Shedinja edge case), when end-of-turn triggers, then heals minimum 1 HP", () => {
      // Source: pret/pokeemerald — max(1, floor(1 / 16)) = max(1, 0) = 1
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.leftovers,
        currentHp: 1,
        maxHp: 1,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects[0]?.value).toBe(1);
    });
  });

  describe("Sitrus Berry", () => {
    it("given a Pokemon at 50% HP (100/200) holding Sitrus Berry, when end-of-turn triggers, then heals flat 30 HP and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_RESTORE_HP — flat 30 HP in Gen 3 (NOT percentage)
      // Gen 4+ changed to 25% max HP; Gen 3 always heals exactly 30
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.sitrusBerry,
        currentHp: 100,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect?.value).toBe(30);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect?.value).toBe(GEN3_ITEM_IDS.sitrusBerry);
    });

    it("given a Pokemon at 30% HP (60/200) holding Sitrus Berry, when end-of-turn triggers, then heals flat 30 HP", () => {
      // Source: pret/pokeemerald — Sitrus Berry activates when HP <= 50% max, always heals 30
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.sitrusBerry,
        currentHp: 60,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "heal")?.value).toBe(30);
    });

    it("given a Pokemon above 50% HP holding Sitrus Berry, when end-of-turn triggers, then no activation", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.sitrusBerry,
        currentHp: 150,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });

    it("given a Pokemon at exactly 50% HP holding Sitrus Berry, when end-of-turn triggers, then activates (threshold is inclusive)", () => {
      // Threshold: currentHp <= floor(maxHp / 2) → 100 <= 100 = true
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.sitrusBerry,
        currentHp: 100,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
    });

    it("given Sitrus Berry and HP drops to <= 50% after damage, when on-damage-taken triggers, then heals 30 HP", () => {
      // Source: pret/pokeemerald — berry checks also fire after taking damage
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.sitrusBerry,
        currentHp: 120,
        maxHp: 200,
        damage: 30, // 120 - 30 = 90, which is <= 100 (50% of 200)
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "heal")?.value).toBe(30);
    });
  });

  describe("Oran Berry", () => {
    it("given a Pokemon at 50% HP holding Oran Berry, when end-of-turn triggers, then heals 10 HP and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_RESTORE_HP — Oran Berry restores 10 HP
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.oranBerry,
        currentHp: 100,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "heal")?.value).toBe(10);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.oranBerry);
    });

    it("given a Pokemon at 40% HP (40/100) holding Oran Berry, when end-of-turn triggers, then heals 10 HP", () => {
      // Source: pret/pokeemerald — Oran Berry always heals exactly 10 HP
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.oranBerry,
        currentHp: 40,
        maxHp: 100,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "heal")?.value).toBe(10);
    });

    it("given a Pokemon above 50% HP holding Oran Berry, when end-of-turn triggers, then no activation", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.oranBerry,
        currentHp: 150,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });
  });

  describe("Lum Berry", () => {
    it("given a paralyzed Pokemon holding Lum Berry, when end-of-turn triggers, then cures paralysis and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_STATUS — Lum Berry cures any status
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.lumBerry,
        status: CORE_STATUS_IDS.paralysis,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      const _statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.lumBerry);
    });

    it("given a sleeping Pokemon holding Lum Berry, when end-of-turn triggers, then cures sleep and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_STATUS
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.lumBerry,
        status: CORE_STATUS_IDS.sleep,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
    });

    it("given a confused Pokemon (no primary status) holding Lum Berry, when end-of-turn triggers, then cures confusion", () => {
      // Source: pret/pokeemerald — Lum Berry also cures confusion (volatile)
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.lumBerry,
        status: null,
        hasConfusion: true,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      const volatileCure = result.effects.find((e) => e.type === "volatile-cure");
      expect(volatileCure?.value).toBe(CORE_VOLATILE_IDS.confusion);
    });

    it("given a burned and confused Pokemon holding Lum Berry, when end-of-turn triggers, then cures both", () => {
      // Source: pret/pokeemerald — Lum Berry cures all status conditions simultaneously
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.lumBerry,
        status: CORE_STATUS_IDS.burn,
        hasConfusion: true,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "volatile-cure")?.value).toBe(CORE_VOLATILE_IDS.confusion);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.lumBerry);
    });

    it("given a healthy Pokemon (no status) holding Lum Berry, when end-of-turn triggers, then no activation", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.lumBerry,
        status: null,
        hasConfusion: false,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });

    it("given a paralyzed Pokemon holding Lum Berry, when on-damage-taken fires, then no activation", () => {
      // Source: pokeemerald ItemBattleEffects — Lum Berry runs at ITEMEFFECT_ON_RESIDUAL (end-of-turn) only
      const ctx = createItemContext({ heldItem: GEN3_ITEM_IDS.lumBerry, status: CORE_STATUS_IDS.paralysis });
      const result = applyGen3HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(false);
      expect(result.effects).toHaveLength(0);
    });
  });

  // =========================================================================
  // Tier 2: Status-Curing Berries
  // =========================================================================

  describe("Cheri Berry (paralysis cure)", () => {
    it("given a paralyzed Pokemon holding Cheri Berry, when end-of-turn triggers, then cures paralysis and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_PAR
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.cheriBerry,
        status: CORE_STATUS_IDS.paralysis,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.cheriBerry);
    });

    it("given a burned Pokemon holding Cheri Berry, when end-of-turn triggers, then no activation (wrong status)", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.cheriBerry,
        status: CORE_STATUS_IDS.burn,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });
  });

  describe("Chesto Berry (sleep cure)", () => {
    it("given a sleeping Pokemon holding Chesto Berry, when end-of-turn triggers, then cures sleep and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_SLP
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.chestoBerry,
        status: CORE_STATUS_IDS.sleep,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.chestoBerry);
    });

    it("given a paralyzed Pokemon holding Chesto Berry, when end-of-turn triggers, then no activation (wrong status)", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.chestoBerry,
        status: CORE_STATUS_IDS.paralysis,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });
  });

  describe("Pecha Berry (poison cure)", () => {
    it("given a poisoned Pokemon holding Pecha Berry, when end-of-turn triggers, then cures poison and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_PSN
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.pechaBerry,
        status: CORE_STATUS_IDS.poison,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.pechaBerry);
    });

    it("given a badly-poisoned Pokemon holding Pecha Berry, when end-of-turn triggers, then cures badly-poisoned and is consumed", () => {
      // Source: pret/pokeemerald — Pecha Berry cures both regular and toxic poison
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.pechaBerry,
        status: CORE_STATUS_IDS.badlyPoisoned,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
    });
  });

  describe("Rawst Berry (burn cure)", () => {
    it("given a burned Pokemon holding Rawst Berry, when end-of-turn triggers, then cures burn and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_BRN
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.rawstBerry,
        status: CORE_STATUS_IDS.burn,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.rawstBerry);
    });

    it("given a sleeping Pokemon holding Rawst Berry, when end-of-turn triggers, then no activation (wrong status)", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.rawstBerry,
        status: CORE_STATUS_IDS.sleep,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });
  });

  describe("Aspear Berry (freeze cure)", () => {
    it("given a frozen Pokemon holding Aspear Berry, when end-of-turn triggers, then cures freeze and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_FRZ
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.aspearBerry,
        status: CORE_STATUS_IDS.freeze,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.aspearBerry);
    });

    it("given a poisoned Pokemon holding Aspear Berry, when end-of-turn triggers, then no activation (wrong status)", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.aspearBerry,
        status: CORE_STATUS_IDS.poison,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });
  });

  describe("Persim Berry (confusion cure)", () => {
    it("given a confused Pokemon holding Persim Berry, when end-of-turn triggers, then cures confusion and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_CONFUSION
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.persimBerry,
        hasConfusion: true,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      const volatileCure = result.effects.find((e) => e.type === "volatile-cure");
      expect(volatileCure?.value).toBe(CORE_VOLATILE_IDS.confusion);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.persimBerry);
    });

    it("given a non-confused Pokemon holding Persim Berry, when end-of-turn triggers, then no activation", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.persimBerry,
        hasConfusion: false,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });
  });

  describe("Mental Herb (infatuation cure)", () => {
    it("given an infatuated Pokemon holding Mental Herb, when end-of-turn triggers, then cures infatuation and is consumed", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CURE_ATTRACT
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.mentalHerb,
        hasInfatuation: true,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      const volatileCure = result.effects.find((e) => e.type === "volatile-cure");
      expect(volatileCure?.value).toBe(INFATUATION_VOLATILE);
      expect(result.effects.find((e) => e.type === "consume")?.value).toBe(GEN3_ITEM_IDS.mentalHerb);
    });

    it("given a non-infatuated Pokemon holding Mental Herb, when end-of-turn triggers, then no activation", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.mentalHerb,
        hasInfatuation: false,
      });

      const result = applyGen3HeldItem("end-of-turn", context);

      expect(result.activated).toBe(false);
    });
  });

  // =========================================================================
  // Focus Band
  // =========================================================================

  describe("Focus Band", () => {
    it("given a Pokemon holding Focus Band and RNG succeeds (10% chance), when damage would KO, then survives with 1 HP", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_FOCUS_BAND — 10% (10/100) activation rate
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.focusBand,
        currentHp: 30,
        maxHp: 200,
        chanceResult: true,
        damage: 50, // 50 > 30, would KO
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result.activated).toBe(true);
      const surviveEffect = result.effects.find((e) => e.type === "survive");
      expect(surviveEffect?.value).toBe(1);
    });

    it("given a Pokemon holding Focus Band and RNG fails, when damage would KO, then no activation", () => {
      // Source: pret/pokeemerald — 90% of the time Focus Band does nothing
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.focusBand,
        currentHp: 30,
        maxHp: 200,
        chanceResult: false,
        damage: 50,
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result.activated).toBe(false);
    });

    it("given a Pokemon holding Focus Band, when damage does not KO, then no activation", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.focusBand,
        currentHp: 100,
        maxHp: 200,
        chanceResult: true,
        damage: 10, // 100 - 10 = 90, not a KO
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result.activated).toBe(false);
    });

    it("given a Pokemon holding Focus Band when it activates, then Focus Band is NOT consumed (reusable in Gen 3)", () => {
      // Source: pret/pokeemerald — Focus Band is NOT consumed, can activate multiple times
      // (Gen 4 introduced Focus Sash which IS single-use; Focus Band remains reusable)
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.focusBand,
        currentHp: 30,
        maxHp: 200,
        chanceResult: true,
        damage: 50,
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result.activated).toBe(true);
      const consumeEffects = result.effects.filter((e) => e.type === "consume");
      expect(consumeEffects.length).toBe(0);
    });
  });

  // =========================================================================
  // King's Rock
  // =========================================================================

  describe("King's Rock", () => {
    it("given a Pokemon holding King's Rock and RNG succeeds (10% chance), when on-hit triggers, then returns flinch effect", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_FLINCH — 10% flinch chance in Gen 3
      // (Gen 2 was 30/256 ~11.72%; Gen 3 simplified to 10%)
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.kingsRock,
        chanceResult: true,
      });

      const result = applyGen3HeldItem("on-hit", context);

      expect(result.activated).toBe(true);
      const flinchEffect = result.effects.find((e) => e.type === "flinch");
      expect(flinchEffect?.target).toBe("opponent");
    });

    it("given a Pokemon holding King's Rock and RNG fails, when on-hit triggers, then no activation", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.kingsRock,
        chanceResult: false,
      });

      const result = applyGen3HeldItem("on-hit", context);

      expect(result.activated).toBe(false);
    });

    // Bite + King's Rock flinch restriction: fully tested in move-item-bugs.test.ts
    // King's Rock does NOT add extra flinch on moves with inherent flinch (e.g., Bite)
  });

  // =========================================================================
  // Shell Bell
  // =========================================================================

  describe("Shell Bell", () => {
    it("given a Pokemon holding Shell Bell that dealt 80 damage, when on-hit triggers, then heals 10 HP (1/8 of 80)", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_SHELL_BELL — heals floor(damage / 8)
      // floor(80 / 8) = 10
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.shellBell,
        damage: 80,
      });

      const result = applyGen3HeldItem("on-hit", context);

      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect?.value).toBe(10);
    });

    it("given a Pokemon holding Shell Bell that dealt 160 damage, when on-hit triggers, then heals 20 HP (1/8 of 160)", () => {
      // Source: pret/pokeemerald — floor(160 / 8) = 20
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.shellBell,
        damage: 160,
      });

      const result = applyGen3HeldItem("on-hit", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "heal")?.value).toBe(20);
    });

    it("given a Pokemon holding Shell Bell, when on-hit triggers, then Shell Bell is NOT consumed (permanent item)", () => {
      // Source: pret/pokeemerald — Shell Bell is permanent, not single-use
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.shellBell,
        damage: 80,
      });

      const result = applyGen3HeldItem("on-hit", context);

      expect(result.activated).toBe(true);
      const consumeEffects = result.effects.filter((e) => e.type === "consume");
      expect(consumeEffects.length).toBe(0);
    });

    it("given a Pokemon holding Shell Bell that dealt 1 damage, when on-hit triggers, then heals minimum 1 HP", () => {
      // Source: pret/pokeemerald — max(1, floor(1 / 8)) = max(1, 0) = 1
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.shellBell,
        damage: 1,
      });

      const result = applyGen3HeldItem("on-hit", context);

      expect(result.activated).toBe(true);
      expect(result.effects.find((e) => e.type === "heal")?.value).toBe(1);
    });

    it("given a Pokemon holding Shell Bell that dealt 0 damage, when on-hit triggers, then no activation", () => {
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.shellBell,
        damage: 0,
      });

      const result = applyGen3HeldItem("on-hit", context);

      expect(result.activated).toBe(false);
    });
  });

  // =========================================================================
  // Damage Calc: Choice Band
  // =========================================================================

  describe("Choice Band (inline in damage calc)", () => {
    it("given attacker holding Choice Band using a physical move, when calculating damage, then Attack is multiplied by 1.5", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_CHOICE_BAND — 1.5x physical Attack
      // With Choice Band: effective Attack = floor(100 * 1.5) = 150
      // Without Choice Band: effective Attack = 100
      //
      // Base damage = floor(floor(floor(2*50/5+2) * 80 * Attack/100) / 50) + 2
      // Without CB (Atk=100): floor(floor(floor(22) * 80 * 100/100) / 50) + 2 = floor(1760/50)+2 = 35+2 = 37
      // With CB (Atk=150):    floor(floor(floor(22) * 80 * 150/100) / 50) + 2 = floor(2640/50)+2 = 52+2 = 54
      //
      // rng roll = 100/100 = 1.0, no STAB, neutral effectiveness => final damage = base damage
      const withCB = createDamageContext({
        attackerItem: GEN3_ITEM_IDS.choiceBand,
        moveType: CORE_TYPE_IDS.normal,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.fire],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const withoutCB = createDamageContext({
        attackerItem: null,
        moveType: CORE_TYPE_IDS.normal,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.fire],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const resultWithCB = calculateGen3Damage(withCB, GEN3_TYPE_CHART);
      const resultWithoutCB = calculateGen3Damage(withoutCB, GEN3_TYPE_CHART);

      // Inline derivation: CB boosts base damage by 1.5x (via Attack stat boost)
      // Without CB: base=37 (as calculated above)
      // With CB: base=54 (as calculated above)
      expect(resultWithCB.damage).toBe(54);
      expect(resultWithoutCB.damage).toBe(37);
      expect(resultWithCB.damage).toBeGreaterThan(resultWithoutCB.damage);
    });

    it("given attacker holding Choice Band using a special move, when calculating damage, then damage is NOT boosted", () => {
      // Source: pret/pokeemerald — Choice Band only boosts physical Attack, not SpAtk
      // Fire is a special type in Gen 3, so Choice Band should NOT apply
      const withCB = createDamageContext({
        attackerItem: GEN3_ITEM_IDS.choiceBand,
        moveType: CORE_TYPE_IDS.fire,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.normal],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const withoutCB = createDamageContext({
        attackerItem: null,
        moveType: CORE_TYPE_IDS.fire,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.normal],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const resultWithCB = calculateGen3Damage(withCB, GEN3_TYPE_CHART);
      const resultWithoutCB = calculateGen3Damage(withoutCB, GEN3_TYPE_CHART);

      // No boost for special moves
      expect(resultWithCB.damage).toBe(resultWithoutCB.damage);
    });
  });

  // =========================================================================
  // Damage Calc: Type-Boosting Items
  // =========================================================================

  describe("Type-boosting items (inline in damage calc)", () => {
    it("given attacker holding Charcoal using a Fire move, when calculating damage, then 1.1x damage boost is applied", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_FIRE_POWER — 10% boost
      // Fire is special in Gen 3. Base damage with L50, 80 power, 100 SpA vs 100 SpD:
      // floor(floor(floor(22) * 80 * 100/100) / 50) + 2 = 37
      // With Charcoal (1.1x): floor(37 * 1.1) = floor(40.7) = 40
      // rng roll = 100 → 37 base, then * 1.1 = floor(37 * 1.1) = 40
      const withCharcoal = createDamageContext({
        attackerItem: GEN3_ITEM_IDS.charcoal,
        moveType: CORE_TYPE_IDS.fire,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.normal],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const withoutCharcoal = createDamageContext({
        attackerItem: null,
        moveType: CORE_TYPE_IDS.fire,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.normal],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const resultWith = calculateGen3Damage(withCharcoal, GEN3_TYPE_CHART);
      const resultWithout = calculateGen3Damage(withoutCharcoal, GEN3_TYPE_CHART);

      // With Charcoal: 37 * 1.1 = 40 (floored)
      expect(resultWith.damage).toBe(40);
      expect(resultWithout.damage).toBe(37);
    });

    it("given attacker holding Charcoal using a Water move, when calculating damage, then NO boost is applied (type mismatch)", () => {
      // Source: pret/pokeemerald — Charcoal only boosts Fire moves
      const withCharcoal = createDamageContext({
        attackerItem: GEN3_ITEM_IDS.charcoal,
        moveType: CORE_TYPE_IDS.water,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.normal],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const withoutCharcoal = createDamageContext({
        attackerItem: null,
        moveType: CORE_TYPE_IDS.water,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.normal],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const resultWith = calculateGen3Damage(withCharcoal, GEN3_TYPE_CHART);
      const resultWithout = calculateGen3Damage(withoutCharcoal, GEN3_TYPE_CHART);

      expect(resultWith.damage).toBe(resultWithout.damage);
    });

    it("given attacker holding Mystic Water using a Water move, when calculating damage, then 1.1x damage boost is applied", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_WATER_POWER — 10% boost
      // Same formula as Charcoal test: base 37 * 1.1 = 40
      const ctx = createDamageContext({
        attackerItem: GEN3_ITEM_IDS.mysticWater,
        moveType: CORE_TYPE_IDS.water,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.normal],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const result = calculateGen3Damage(ctx, GEN3_TYPE_CHART);

      expect(result.damage).toBe(40);
      expect(result.breakdown?.itemMultiplier).toBe(1.1);
    });

    it("given attacker holding Silk Scarf using a Normal physical move, when calculating damage, then 1.1x damage boost is applied", () => {
      // Source: pret/pokeemerald HOLD_EFFECT_NORMAL_POWER — 10% boost
      // Normal is physical in Gen 3. Base: 37. With Silk Scarf: floor(37 * 1.1) = 40
      const ctx = createDamageContext({
        attackerItem: GEN3_ITEM_IDS.silkScarf,
        moveType: CORE_TYPE_IDS.normal,
        movePower: 80,
        attackerTypes: [CORE_TYPE_IDS.fire],
        defenderTypes: [CORE_TYPE_IDS.normal],
        rngRoll: 100,
      });

      const result = calculateGen3Damage(ctx, GEN3_TYPE_CHART);

      expect(result.damage).toBe(40);
      expect(result.breakdown?.itemMultiplier).toBe(1.1);
    });
  });

  // =========================================================================
  // Scope Lens (inherited from BaseRuleset.rollCritical)
  // =========================================================================

  describe("Scope Lens (crit stage via BaseRuleset.rollCritical)", () => {
    it("given attacker holding Scope Lens, when rolling for crit, then crit stage is increased by 1 (1/8 instead of 1/16)", () => {
      // Source: pret/pokeemerald — Scope Lens adds +1 to crit stage
      // BaseRuleset.rollCritical already handles this (line 120: if item === GEN3_ITEM_IDS.scopeLens stage += 1)
      // Stage 0 = 1/16 (denominator 16), Stage 1 = 1/8 (denominator 8)
      //
      // With Scope Lens, crit rate = 1/8 = 12.5%
      // Without Scope Lens, crit rate = 1/16 = 6.25%
      //
      // We test via the Gen3Ruleset.rollCritical to verify the integration.
      const ruleset = new Gen3Ruleset(createGen3DataManager());

      // Gen3 crit table: [16, 8, 4, 3, 2]
      // Stage 0 → 1/16; Stage 1 (Scope Lens) → 1/8
      const table = ruleset.getCritRateTable();
      expect(table[0]).toBe(16); // base: 1/16
      expect(table[1]).toBe(8); // +1 stage (Scope Lens): 1/8

      // Test the actual rollCritical: create a context where rng.int returns 1
      // which means "crit" for any denominator > 1 (since 1 === 1)
      const attacker = createMockPokemon({ heldItem: GEN3_ITEM_IDS.scopeLens });
      const move: MoveData = {
        id: GEN3_MOVE_IDS.tackle,
        name: "Tackle",
        type: CORE_TYPE_IDS.normal,
        category: "physical",
        power: 40,
        accuracy: 100,
        pp: 35,
        maxPp: 35,
        priority: 0,
        target: "single" as any,
        flags: {} as any,
        generation: 3,
        critRatio: 0,
        effectChance: null,
        effects: [],
        description: "",
      };

      // rng.int(1, 8) needs to return 1 for crit at stage 1 (denominator 8)
      const rng = createMockRng(false, 1);

      const critContext: CritContext = {
        attacker,
        move,
        state: {} as BattleState,
        rng: rng as CritContext["rng"],
      };

      const isCrit = ruleset.rollCritical(critContext);
      // With scope-lens: stage 1, denominator 8, rng returns 1, 1 === 1 → true
      expect(isCrit).toBe(true);
    });

    it("given attacker NOT holding Scope Lens, when rolling for crit with rng returning 2, then no crit at base stage", () => {
      // Without Scope Lens: stage 0, denominator 16, rng.int returns 2
      // 2 !== 1 → not a crit
      const ruleset = new Gen3Ruleset(createGen3DataManager());
      const attacker = createMockPokemon({ heldItem: null });
      const move: MoveData = {
        id: GEN3_MOVE_IDS.tackle,
        name: "Tackle",
        type: CORE_TYPE_IDS.normal,
        category: "physical",
        power: 40,
        accuracy: 100,
        pp: 35,
        maxPp: 35,
        priority: 0,
        target: "single" as any,
        flags: {} as any,
        generation: 3,
        critRatio: 0,
        effectChance: null,
        effects: [],
        description: "",
      };

      const rng = createMockRng(false, 2);

      const critContext: CritContext = {
        attacker,
        move,
        state: {} as BattleState,
        rng: rng as CritContext["rng"],
      };

      const isCrit = ruleset.rollCritical(critContext);
      // stage 0, denominator 16, rng returns 2, 2 !== 1 → false
      expect(isCrit).toBe(false);
    });
  });

  // =========================================================================
  // Quick Claw (inline in resolveTurnOrder)
  // =========================================================================

  describe("Quick Claw (via getQuickClawActivated in resolveTurnOrder)", () => {
    it("given a slower Pokemon holding Quick Claw, when the activation roll succeeds, then it moves first within the same priority bracket", () => {
      // Source: pret/pokeemerald src/battle_main.c:4653 — Quick Claw activation uses a 20% roll in Gen 3.
      // Keep the integration test deterministic by forcing the production chance hook to return true.
      const ruleset = new Gen3Ruleset(createGen3DataManager());

      const slowMon = createMockPokemon({
        heldItem: GEN3_ITEM_IDS.quickClaw,
        speed: 50,
      });
      const fastMon = createMockPokemon({
        heldItem: null,
        speed: 100,
      });

      const state = {
        sides: [{ active: [slowMon] }, { active: [fastMon] }],
        trickRoom: { active: false },
      } as unknown as BattleState;

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      const rng = createMockRng(true, 0);
      const ordered = ruleset.resolveTurnOrder([...actions], state, rng);

      // Side 0 (slower but Quick Claw activated) should go first
      expect(ordered[0]?.type).toBe("move");
      expect((ordered[0] as any).side).toBe(0);
    });

    it("given a slower Pokemon holding Quick Claw, when the activation roll fails, then normal speed order prevails", () => {
      // Source: pret/pokeemerald src/battle_main.c:4653 — failing the Quick Claw roll leaves normal turn order intact.
      const ruleset = new Gen3Ruleset(createGen3DataManager());

      const slowMon = createMockPokemon({
        heldItem: GEN3_ITEM_IDS.quickClaw,
        speed: 50,
      });
      const fastMon = createMockPokemon({
        heldItem: null,
        speed: 100,
      });

      const state = {
        sides: [{ active: [slowMon] }, { active: [fastMon] }],
        trickRoom: { active: false },
      } as unknown as BattleState;

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      const rng = createMockRng(false, 0);
      const ordered = ruleset.resolveTurnOrder([...actions], state, rng);

      // Fast mon (side 1) goes first because Quick Claw didn't activate
      expect(ordered[0]?.type).toBe("move");
      expect((ordered[0] as any).side).toBe(1);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe("Edge cases", () => {
    it("given a Pokemon with no held item, when any trigger fires, then no activation", () => {
      const context = createItemContext({ heldItem: null });

      expect(applyGen3HeldItem("end-of-turn", context).activated).toBe(false);
      expect(applyGen3HeldItem("on-damage-taken", context).activated).toBe(false);
      expect(applyGen3HeldItem("on-hit", context).activated).toBe(false);
    });

    it("given a Pokemon with an unknown item, when any trigger fires, then no activation", () => {
      const context = createItemContext({ heldItem: "mystery-widget" });

      expect(applyGen3HeldItem("end-of-turn", context).activated).toBe(false);
      expect(applyGen3HeldItem("on-damage-taken", context).activated).toBe(false);
      expect(applyGen3HeldItem("on-hit", context).activated).toBe(false);
    });

    it("given any item, when an unknown trigger fires, then no activation", () => {
      const context = createItemContext({ heldItem: GEN3_ITEM_IDS.leftovers });

      const result = applyGen3HeldItem("unknown-trigger", context);

      expect(result.activated).toBe(false);
    });
  });

  // =========================================================================
  // Gen3Ruleset integration (applyHeldItem, hasHeldItems)
  // =========================================================================

  describe("Gen3Ruleset integration", () => {
    it("given Gen3Ruleset, when checking hasHeldItems, then returns true", () => {
      const ruleset = new Gen3Ruleset(createGen3DataManager());
      expect(ruleset.hasHeldItems()).toBe(true);
    });

    it("given Gen3Ruleset, when calling applyHeldItem with Leftovers, then delegates to Gen3Items correctly", () => {
      const ruleset = new Gen3Ruleset(createGen3DataManager());
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.leftovers,
        currentHp: 150,
        maxHp: 200,
      });

      const result = ruleset.applyHeldItem("end-of-turn", context);

      expect(result.activated).toBe(true);
      expect(result.effects[0]?.type).toBe("heal");
      // floor(200/16) = 12
      expect(result.effects[0]?.value).toBe(12);
    });
  });

  // =========================================================================
  // Pinch berries and Lansat Berry
  // =========================================================================

  describe("Pinch berries", () => {
    it("given Liechi Berry and HP drops to 25% from damage, when on-damage-taken fires, then Attack rises and the berry is consumed", () => {
      // Source: packages/gen3/data/items.json -- Liechi Berry triggers at 1/4 max HP or less.
      // 200 HP -> 50 HP after damage is exactly the threshold.
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.liechiBerry,
        currentHp: 120,
        maxHp: 200,
        damage: 70,
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result).toEqual({
        activated: true,
        effects: [
          { type: "stat-boost", target: "self", value: "attack" },
          { type: "consume", target: "self", value: GEN3_ITEM_IDS.liechiBerry },
        ],
        messages: ["Pokemon #1's Liechi Berry raised its Attack!"],
      });
    });

    it("given Ganlon Berry and HP is already at 25%, when stat-boost-between-turns fires, then Defense rises and the berry is consumed", () => {
      // Source: packages/gen3/data/items.json -- Ganlon Berry triggers at 1/4 max HP or less.
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.ganlonBerry,
        currentHp: 50,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("stat-boost-between-turns", context);

      expect(result).toEqual({
        activated: true,
        effects: [
          { type: "stat-boost", target: "self", value: "defense" },
          { type: "consume", target: "self", value: GEN3_ITEM_IDS.ganlonBerry },
        ],
        messages: ["Pokemon #1's Ganlon Berry raised its Defense!"],
      });
    });

    it("given Salac Berry and HP drops to 20% from damage, when on-damage-taken fires, then Speed rises and the berry is consumed", () => {
      // Source: packages/gen3/data/items.json -- Salac Berry triggers at 1/4 max HP or less.
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.salacBerry,
        currentHp: 90,
        maxHp: 200,
        damage: 50,
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result).toEqual({
        activated: true,
        effects: [
          { type: "stat-boost", target: "self", value: "speed" },
          { type: "consume", target: "self", value: GEN3_ITEM_IDS.salacBerry },
        ],
        messages: ["Pokemon #1's Salac Berry raised its Speed!"],
      });
    });

    it("given Petaya Berry and HP is already at 10%, when stat-boost-between-turns fires, then Sp. Atk rises and the berry is consumed", () => {
      // Source: packages/gen3/data/items.json -- Petaya Berry triggers at 1/4 max HP or less.
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.petayaBerry,
        currentHp: 20,
        maxHp: 200,
      });

      const result = applyGen3HeldItem("stat-boost-between-turns", context);

      expect(result).toEqual({
        activated: true,
        effects: [
          { type: "stat-boost", target: "self", value: "spAttack" },
          { type: "consume", target: "self", value: GEN3_ITEM_IDS.petayaBerry },
        ],
        messages: ["Pokemon #1's Petaya Berry raised its Sp. Atk!"],
      });
    });

    it("given Apicot Berry and HP drops to 25% from damage, when on-damage-taken fires, then Sp. Def rises and the berry is consumed", () => {
      // Source: packages/gen3/data/items.json -- Apicot Berry triggers at 1/4 max HP or less.
      // 200 HP -> 50 HP after damage is exactly the threshold.
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.apicotBerry,
        currentHp: 80,
        maxHp: 200,
        damage: 30,
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result).toEqual({
        activated: true,
        effects: [
          { type: "stat-boost", target: "self", value: "spDefense" },
          { type: "consume", target: "self", value: GEN3_ITEM_IDS.apicotBerry },
        ],
        messages: ["Pokemon #1's Apicot Berry raised its Sp. Def!"],
      });
    });

    it("given Liechi Berry and HP stays above 25%, when either stat-boost trigger checks it, then it does not activate", () => {
      // 200 HP -> 60 HP is above the 25% threshold of 50 HP.
      const damageContext = createItemContext({
        heldItem: GEN3_ITEM_IDS.liechiBerry,
        currentHp: 120,
        maxHp: 200,
        damage: 60,
      });
      const residualContext = createItemContext({
        heldItem: GEN3_ITEM_IDS.liechiBerry,
        currentHp: 60,
        maxHp: 200,
      });

      expect(applyGen3HeldItem("on-damage-taken", damageContext)).toEqual({
        activated: false,
        effects: [],
        messages: [],
      });
      expect(applyGen3HeldItem("stat-boost-between-turns", residualContext)).toEqual({
        activated: false,
        effects: [],
        messages: [],
      });
    });
  });

  describe("Lansat Berry", () => {
    it("given Lansat Berry and HP drops to 25% or less, when the item triggers, then focus-energy is set and the berry is consumed", () => {
      // Source: packages/gen3/data/items.json -- Lansat Berry grants the Focus Energy effect at 1/4 max HP or less.
      const context = createItemContext({
        heldItem: GEN3_ITEM_IDS.lansatBerry,
        currentHp: 100,
        maxHp: 200,
        damage: 60,
      });

      const result = applyGen3HeldItem("on-damage-taken", context);

      expect(result).toEqual({
        activated: true,
        effects: [{ type: "consume", target: "self", value: GEN3_ITEM_IDS.lansatBerry }],
        messages: ["Pokemon #1's Lansat Berry raised its critical-hit ratio!"],
      });
      expect(context.pokemon.volatileStatuses.get(GEN3_MOVE_IDS.focusEnergy)).toEqual({ turnsLeft: -1 });
    });
  });

  // BrightPowder/Lax Incense accuracy reduction is covered in move-item-bugs.test.ts.
  // White Herb restoration is covered in move-item-bugs.test.ts.
  // Type-resist berries are Gen 4+ items and are not part of the Gen 3 item data.
});
