import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  type PokemonType,
  type PrimaryStatus,
  type StatBlock,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen2HeldItem,
  createGen2DataManager,
  GEN2_ITEM_IDS,
  GEN2_NATURE_IDS,
  GEN2_SPECIES_IDS,
} from "../../src";

/**
 * Gen 2 Held Item Tests
 *
 * Gen 2 introduced held items. This module tests the item effect handlers
 * for end of turn, damage taken, and hit triggers.
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock RNG with configurable chance result and int result. */
function createMockRng(chanceResult = false, intResult = 0) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intResult,
    chance: (_percent: number) => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

const dataManager = createGen2DataManager();
const ITEM_IDS = GEN2_ITEM_IDS;
const SPECIES_IDS = GEN2_SPECIES_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const TYPE_IDS = CORE_TYPE_IDS;
const ITEM_TRIGGERS = CORE_ITEM_TRIGGER_IDS;
const DEFAULT_NATURE = GEN2_NATURE_IDS.hardy;
const NO_ABILITY = CORE_ABILITY_IDS.none;
const DEFAULT_POKEBALL = ITEM_IDS.pokeBall;

function getRestoredHp(itemId: string): number {
  const description = dataManager.getItem(itemId).description;
  const match = description.match(/Restores (\d+) HP/);
  if (!match) {
    throw new Error(`Expected item ${itemId} to expose a restore amount in its description`);
  }
  return Number(match[1]);
}

const ITEM_HEAL_AMOUNTS = {
  berry: getRestoredHp(ITEM_IDS.berry),
  goldBerry: getRestoredHp(ITEM_IDS.goldBerry),
  berryJuice: getRestoredHp(ITEM_IDS.berryJuice),
} as const;

/** Create a minimal ActivePokemon mock for item tests. */
function createMockPokemon(opts: {
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: PrimaryStatus | null;
  types?: PokemonType[];
  hasConfusion?: boolean;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: SPECIES_IDS.ditto,
    nickname: null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: NO_ABILITY,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: DEFAULT_POKEBALL,
    calculatedStats: stats,
  };

  const volatileStatuses: Map<string, { turnsLeft: number }> = new Map();
  if (opts.hasConfusion) {
    volatileStatuses.set(VOLATILE_IDS.confusion, { turnsLeft: 3 });
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
    types: opts.types ?? [TYPE_IDS.normal],
    ability: NO_ABILITY,
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
  status?: PrimaryStatus | null;
  chanceResult?: boolean;
  intResult?: number;
  damage?: number;
  hasConfusion?: boolean;
}): ItemContext {
  const pokemon = createMockPokemon({
    heldItem: opts.heldItem,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    status: opts.status,
    hasConfusion: opts.hasConfusion,
  });

  return {
    pokemon,
    state: {} as BattleState,
    rng: createMockRng(opts.chanceResult ?? false, opts.intResult ?? 0) as ItemContext["rng"],
    damage: opts.damage,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Held Items", () => {
  // --- Leftovers ---

  // Source: pret/pokecrystal engine/battle/effect_commands.asm — Leftovers heal floor(maxHP/16) each turn
  describe("Given Leftovers held item", () => {
    it("given a Pokemon holding Leftovers, when end of turn triggers, then heals 1/16 max HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.leftovers,
        currentHp: 150,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Source: pret/pokecrystal engine/battle/effect_commands.asm — floor(200 / 16) = 12 HP
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]?.type).toBe("heal");
      expect(result.effects[0]?.value).toBe(12);
    });

    it("given a Pokemon holding Leftovers, when end of turn triggers, then Leftovers is NOT consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.leftovers,
        currentHp: 150,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert: No consume effect
      expect(result.activated).toBe(true);
      const consumeEffects = result.effects.filter((e) => e.type === "consume");
      expect(consumeEffects.length).toBe(0);
    });
  });

  // --- Berry (10 HP heal at <= 50% HP) ---

  // Source: pret/pokecrystal engine/battle/effect_commands.asm — Berry heals 10 HP when HP <= 50%
  describe("Given Berry held item (10 HP heal at <= 50% HP)", () => {
    it("given a Pokemon at 50% HP holding Berry, when end of turn triggers, then heals 10 HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berry,
        currentHp: 100,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect).toBeDefined();
      expect(healEffect?.value).toBe(ITEM_HEAL_AMOUNTS.berry);
    });

    it("given a Pokemon at 50% HP holding Berry, when end of turn triggers, then Berry is consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berry,
        currentHp: 100,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
      expect(consumeEffect?.value).toBe(ITEM_IDS.berry);
    });

    it("given a Pokemon above 50% HP holding Berry, when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berry,
        currentHp: 150,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- PRZCureBerry (Paralysis Cure) ---

  describe("Given PRZCureBerry held item (paralysis cure)", () => {
    it("given a paralyzed Pokemon holding PRZCureBerry, when end of turn triggers, then cures paralysis", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.przCureBerry,
        status: STATUS_IDS.paralysis,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });

    it("given a paralyzed Pokemon holding PRZCureBerry, when end of turn triggers, then PRZCureBerry is consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.przCureBerry,
        status: STATUS_IDS.paralysis,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
      expect(consumeEffect?.value).toBe(ITEM_IDS.przCureBerry);
    });

    it("given a non-paralyzed Pokemon holding PRZCureBerry, when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.przCureBerry,
        status: null,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given a burned Pokemon holding PRZCureBerry, when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.przCureBerry,
        status: STATUS_IDS.burn,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Gold Berry (30 HP heal at <= 50% HP) ---

  // Source: pret/pokecrystal engine/battle/effect_commands.asm — Gold Berry heals 30 HP when HP <= 50%
  describe("Given Gold Berry held item (30 HP heal at <= 50% HP)", () => {
    it("given a Pokemon at 50% HP holding Gold Berry, when end of turn triggers, then heals 30 HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.goldBerry,
        currentHp: 100,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect).toBeDefined();
      expect(healEffect?.value).toBe(ITEM_HEAL_AMOUNTS.goldBerry);
    });

    it("given a Pokemon at 50% HP holding Gold Berry, when end of turn triggers, then Gold Berry is consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.goldBerry,
        currentHp: 100,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
      expect(consumeEffect?.value).toBe(ITEM_IDS.goldBerry);
    });

    it("given a Pokemon above 50% HP holding Gold Berry, when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.goldBerry,
        currentHp: 150,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given Gold Berry and HP drops to <= 50% after damage, when damage taken triggers, then heals 30 HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.goldBerry,
        currentHp: 120,
        maxHp: 200,
        damage: 30, // 120 - 30 = 90, which is <= 100 (50% of 200)
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert
      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect).toBeDefined();
      expect(healEffect?.value).toBe(ITEM_HEAL_AMOUNTS.goldBerry);
    });

    it("given Gold Berry and HP stays above 50% after damage, when damage taken triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.goldBerry,
        currentHp: 180,
        maxHp: 200,
        damage: 10, // 180 - 10 = 170, which is > 100 (50% of 200)
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given Gold Berry and Pokemon already below 50% HP before damage, when damage taken triggers, then no activation", () => {
      // Arrange: Gold Berry holder at 80 HP out of 200 max (already below 50%)
      // When damage taken fires with 10 damage: 80 - 10 = 70, still <= 100
      // But HP was already below the 50% threshold, not crossing it now
      const context = createItemContext({
        heldItem: ITEM_IDS.goldBerry,
        currentHp: 80,
        maxHp: 200,
        damage: 10, // 80 - 10 = 70, which is <= 100 (50% of 200), but was already below
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert: Item should NOT activate (was already below, not crossing threshold)
      expect(result.activated).toBe(false);
    });
  });

  // --- Bitter Berry (Confusion Cure) ---

  describe("Given Bitter Berry held item (confusion cure)", () => {
    it("given a confused Pokemon holding Bitter Berry, when end of turn triggers, then cures confusion", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.bitterBerry,
        hasConfusion: true,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const volatileCure = result.effects.find((e) => e.type === "volatile-cure");
      expect(volatileCure).toBeDefined();
      expect(volatileCure?.value).toBe(VOLATILE_IDS.confusion);
    });

    it("given a confused Pokemon holding Bitter Berry, when end of turn triggers, then Bitter Berry is consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.bitterBerry,
        hasConfusion: true,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
      expect(consumeEffect?.value).toBe(ITEM_IDS.bitterBerry);
    });

    it("given a non-confused Pokemon holding Bitter Berry, when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.bitterBerry,
        hasConfusion: false,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Miracle Berry (Any Primary Status Cure) ---

  describe("Given Miracle Berry held item (any primary status cure)", () => {
    it("given a burned Pokemon holding Miracle Berry, when end of turn triggers, then cures burn", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.miracleBerry,
        status: STATUS_IDS.burn,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });

    it("given a paralyzed Pokemon holding Miracle Berry, when end of turn triggers, then cures paralysis", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.miracleBerry,
        status: STATUS_IDS.paralysis,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });

    it("given a sleeping Pokemon holding Miracle Berry, when end of turn triggers, then cures sleep", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.miracleBerry,
        status: STATUS_IDS.sleep,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });

    it("given a poisoned Pokemon holding Miracle Berry, when end of turn triggers, then cures poison", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.miracleBerry,
        status: STATUS_IDS.poison,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });

    it("given a Pokemon with no status holding Miracle Berry, when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.miracleBerry,
        status: null,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given a Pokemon holding Miracle Berry, when it activates, then Miracle Berry is consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.miracleBerry,
        status: STATUS_IDS.freeze,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
      expect(consumeEffect?.value).toBe(ITEM_IDS.miracleBerry);
    });

    it("given a confused Pokemon holding Miracle Berry with no primary status, when end of turn triggers, then cures confusion", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.miracleBerry,
        status: null,
        hasConfusion: true,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const volatileCure = result.effects.find((e) => e.type === "volatile-cure");
      expect(volatileCure).toBeDefined();
      expect(volatileCure?.value).toBe(VOLATILE_IDS.confusion);
    });

    it("given a confused Pokemon holding Miracle Berry with primary status, when end of turn triggers, then cures both", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.miracleBerry,
        status: STATUS_IDS.burn,
        hasConfusion: true,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
      const volatileCure = result.effects.find((e) => e.type === "volatile-cure");
      expect(volatileCure).toBeDefined();
      expect(volatileCure?.value).toBe(VOLATILE_IDS.confusion);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
      expect(consumeEffect?.value).toBe(ITEM_IDS.miracleBerry);
    });
  });

  // --- Ice Berry (Burn Cure) ---

  describe("Given Ice Berry held item (burn cure)", () => {
    it("given a burned Pokemon holding Ice Berry, when end of turn triggers, then cures burn", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.iceBerry,
        status: STATUS_IDS.burn,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });
  });

  // --- Mint Berry (Sleep Cure) ---

  describe("Given Mint Berry held item (sleep cure)", () => {
    it("given a sleeping Pokemon holding Mint Berry, when end of turn triggers, then cures sleep", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.mintBerry,
        status: STATUS_IDS.sleep,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });
  });

  // --- Burnt Berry (Freeze Cure) ---

  describe("Given Burnt Berry held item (freeze cure)", () => {
    it("given a frozen Pokemon holding Burnt Berry, when end of turn triggers, then cures freeze", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.burntBerry,
        status: STATUS_IDS.freeze,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });
  });

  // --- PSNCureBerry (Poison Cure) ---

  describe("Given PSNCureBerry held item (poison cure)", () => {
    it("given a poisoned Pokemon holding PSNCureBerry, when end of turn triggers, then cures poison", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.psnCureBerry,
        status: STATUS_IDS.poison,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });

    it("given a badly-poisoned Pokemon holding PSNCureBerry, when end of turn triggers, then cures badly-poisoned", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.psnCureBerry,
        status: STATUS_IDS.badlyPoisoned,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
    });
  });

  // --- Berry Juice ---

  // Source: pret/pokecrystal engine/battle/effect_commands.asm — Berry Juice heals 20 HP when HP <= 50%
  describe("Given Berry Juice held item", () => {
    it("given a Pokemon at 50% HP holding Berry Juice, when end of turn triggers, then heals 20 HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berryJuice,
        currentHp: 100,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect).toBeDefined();
      expect(healEffect?.value).toBe(ITEM_HEAL_AMOUNTS.berryJuice);
    });

    it("given a Pokemon at 50% HP holding Berry Juice, when end of turn triggers, then is consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berryJuice,
        currentHp: 100,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(true);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
      expect(consumeEffect?.value).toBe(ITEM_IDS.berryJuice);
    });

    it("given a Pokemon above 50% HP holding Berry Juice, when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berryJuice,
        currentHp: 150,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Focus Band ---

  describe("Given Focus Band held item", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:2119-2131 — cp c where c=30 (HELD_FOCUS_BAND), so 30/256 chance

    it("given a Pokemon holding Focus Band and RNG roll < 30, when damage would KO, then survives with 1 HP", () => {
      // Arrange: RNG int returns 15 (< 30 threshold → activates)
      const context = createItemContext({
        heldItem: ITEM_IDS.focusBand,
        currentHp: 30,
        maxHp: 200,
        intResult: 15, // 15 < 30, so Focus Band activates
        damage: 50, // 50 damage would KO from 30 HP
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert
      expect(result.activated).toBe(true);
      const surviveEffect = result.effects.find((e) => e.type === "survive");
      expect(surviveEffect).toBeDefined();
      expect(surviveEffect?.value).toBe(1);
    });

    it("given a Pokemon holding Focus Band and RNG roll >= 30, when damage would KO, then no activation", () => {
      // Arrange: RNG int returns 200 (>= 30 threshold → does not activate)
      const context = createItemContext({
        heldItem: ITEM_IDS.focusBand,
        currentHp: 30,
        maxHp: 200,
        intResult: 200, // 200 >= 30, so Focus Band does NOT activate
        damage: 50,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- King's Rock ---

  describe("Given King's Rock held item", () => {
    it("given a Pokemon holding King's Rock and RNG succeeds (30/256 chance), when hit triggers, then returns flinch effect", () => {
      // Arrange: RNG chance returns true (30/256 proc)
      const context = createItemContext({
        heldItem: ITEM_IDS.kingsRock,
        chanceResult: true,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onHit, context);

      // Assert
      expect(result.activated).toBe(true);
      const flinchEffect = result.effects.find((e) => e.type === "flinch");
      expect(flinchEffect).toBeDefined();
    });

    it("given a Pokemon holding King's Rock and RNG fails, when hit triggers, then no activation", () => {
      // Arrange: RNG chance returns false
      const context = createItemContext({
        heldItem: ITEM_IDS.kingsRock,
        chanceResult: false,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onHit, context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- No Item / Unknown Item ---

  describe("Given no item or unhandled item", () => {
    it("given a Pokemon with no held item, when any trigger fires, then no activation", () => {
      // Arrange
      const context = createItemContext({ heldItem: null });

      // Act
      const endOfTurn = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);
      const onDmg = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);
      const onHit = applyGen2HeldItem(ITEM_TRIGGERS.onHit, context);

      // Assert
      expect(endOfTurn.activated).toBe(false);
      expect(onDmg.activated).toBe(false);
      expect(onHit.activated).toBe(false);
    });

    it("given a Pokemon with an unhandled but valid item, when any trigger fires, then no activation", () => {
      // Arrange
      const context = createItemContext({ heldItem: ITEM_IDS.blackBelt });

      // Act
      const endOfTurn = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);
      const onDmg = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);
      const onHit = applyGen2HeldItem(ITEM_TRIGGERS.onHit, context);

      // Assert
      expect(endOfTurn.activated).toBe(false);
      expect(onDmg.activated).toBe(false);
      expect(onHit.activated).toBe(false);
    });

    it("given any item, when an unknown trigger fires, then no activation", () => {
      // Arrange
      const context = createItemContext({ heldItem: ITEM_IDS.leftovers });

      // Act
      const result = applyGen2HeldItem("unknown-trigger", context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Berry non-matching status tests ---

  describe("Given berries with non-matching statuses", () => {
    it("given Ice Berry but Pokemon has paralysis (not burn), when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.iceBerry,
        status: STATUS_IDS.paralysis,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given Mint Berry but Pokemon has burn (not sleep), when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.mintBerry,
        status: STATUS_IDS.burn,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given Burnt Berry but Pokemon has poison (not freeze), when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.burntBerry,
        status: STATUS_IDS.poison,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given PSNCureBerry but Pokemon has burn (not poison), when end of turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.psnCureBerry,
        status: STATUS_IDS.burn,
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.endOfTurn, context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Berry Juice damage taken ---

  describe("Given Berry Juice damage taken", () => {
    it("given Berry Juice and HP drops below 50% after damage, when damage taken triggers, then heals 20 HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berryJuice,
        currentHp: 120,
        maxHp: 200,
        damage: 30, // 120 - 30 = 90, which is <= 100 (50% of 200)
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert
      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect).toBeDefined();
      expect(healEffect?.value).toBe(ITEM_HEAL_AMOUNTS.berryJuice);
    });

    it("given Berry Juice and HP stays above 50% after damage, when damage taken triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berryJuice,
        currentHp: 180,
        maxHp: 200,
        damage: 10, // 180 - 10 = 170, which is > 100 (50% of 200)
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given Berry Juice and damage would KO, when damage taken triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.berryJuice,
        currentHp: 30,
        maxHp: 200,
        damage: 50, // 30 - 50 = -20, which is <= 0 (KO)
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert: Berry Juice doesn't activate on KO
      expect(result.activated).toBe(false);
    });
  });

  // --- Focus Band non-KO case ---

  describe("Given Focus Band when damage does not KO", () => {
    it("given Focus Band and damage does not KO, when damage taken triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: ITEM_IDS.focusBand,
        currentHp: 100,
        maxHp: 200,
        chanceResult: true,
        damage: 10, // 100 - 10 = 90 > 0, not a KO
      });

      // Act
      const result = applyGen2HeldItem(ITEM_TRIGGERS.onDamageTaken, context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });
});
