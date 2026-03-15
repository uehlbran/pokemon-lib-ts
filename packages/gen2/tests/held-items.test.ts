import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { ItemContext, ItemResult } from "@pokemon-lib-ts/battle";
import type { PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen2HeldItem } from "../src/Gen2Items";

/**
 * Gen 2 Held Item Tests
 *
 * Gen 2 introduced held items. This module tests the item effect handlers
 * for end-of-turn, on-damage-taken, and on-hit triggers.
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock RNG with configurable chance result. */
function createMockRng(chanceResult = false, intResult = 0) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intResult,
    chance: (_percent: number) => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0]!,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** Create a minimal ActivePokemon mock for item tests. */
function createMockPokemon(opts: {
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  types?: PokemonType[];
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
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: "",
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
    pokeball: "pokeball",
    calculatedStats: stats,
  };

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
    volatileStatuses: new Map(),
    types: opts.types ?? ["normal"],
    ability: "",
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
  } as unknown as ActivePokemon;
}

/** Create a mock ItemContext. */
function createItemContext(opts: {
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  chanceResult?: boolean;
  damage?: number;
}): ItemContext {
  const pokemon = createMockPokemon({
    heldItem: opts.heldItem,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    status: opts.status,
  });

  return {
    pokemon,
    state: {} as BattleState,
    rng: createMockRng(opts.chanceResult ?? false) as ItemContext["rng"],
    damage: opts.damage,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Held Items", () => {
  // --- Leftovers ---

  describe("Given Leftovers held item", () => {
    it("given a Pokemon holding Leftovers, when end-of-turn triggers, then heals 1/16 max HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "leftovers",
        currentHp: 150,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert: 1/16 of 200 = 12
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.type).toBe("heal");
      expect(result.effects[0]!.value).toBe(12);
    });

    it("given a Pokemon holding Leftovers, when end-of-turn triggers, then Leftovers is NOT consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "leftovers",
        currentHp: 150,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert: No consume effect
      expect(result.activated).toBe(true);
      const consumeEffects = result.effects.filter((e) => e.type === "consume");
      expect(consumeEffects.length).toBe(0);
    });
  });

  // --- Berry (Paralysis Cure) ---

  describe("Given Berry held item (paralysis cure)", () => {
    it("given a paralyzed Pokemon holding Berry, when end-of-turn triggers, then cures paralysis", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry",
        status: "paralysis",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
      expect(statusCure!.value).toBe("paralysis");
    });

    it("given a paralyzed Pokemon holding Berry, when end-of-turn triggers, then Berry is consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry",
        status: "paralysis",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(true);
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
    });

    it("given a non-paralyzed Pokemon holding Berry, when end-of-turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry",
        status: null,
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Ice Berry (Burn Cure) ---

  describe("Given Ice Berry held item (burn cure)", () => {
    it("given a burned Pokemon holding Ice Berry, when end-of-turn triggers, then cures burn", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "ice-berry",
        status: "burn",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
      expect(statusCure!.value).toBe("burn");
    });
  });

  // --- Mint Berry (Sleep Cure) ---

  describe("Given Mint Berry held item (sleep cure)", () => {
    it("given a sleeping Pokemon holding Mint Berry, when end-of-turn triggers, then cures sleep", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "mint-berry",
        status: "sleep",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
      expect(statusCure!.value).toBe("sleep");
    });
  });

  // --- Burnt Berry (Freeze Cure) ---

  describe("Given Burnt Berry held item (freeze cure)", () => {
    it("given a frozen Pokemon holding Burnt Berry, when end-of-turn triggers, then cures freeze", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "burnt-berry",
        status: "freeze",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
      expect(statusCure!.value).toBe("freeze");
    });
  });

  // --- PSNCureBerry (Poison Cure) ---

  describe("Given PSNCureBerry held item (poison cure)", () => {
    it("given a poisoned Pokemon holding PSNCureBerry, when end-of-turn triggers, then cures poison", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "psncureberry",
        status: "poison",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
      expect(statusCure!.value).toBe("poison");
    });

    it("given a badly-poisoned Pokemon holding PSNCureBerry, when end-of-turn triggers, then cures badly-poisoned", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "psncureberry",
        status: "badly-poisoned",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(true);
      const statusCure = result.effects.find((e) => e.type === "status-cure");
      expect(statusCure).toBeDefined();
      expect(statusCure!.value).toBe("badly-poisoned");
    });
  });

  // --- Berry Juice ---

  describe("Given Berry Juice held item", () => {
    it("given a Pokemon at 50% HP holding Berry Juice, when end-of-turn triggers, then heals 20 HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry-juice",
        currentHp: 100,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect).toBeDefined();
      expect(healEffect!.value).toBe(20);
    });

    it("given a Pokemon at 50% HP holding Berry Juice, when end-of-turn triggers, then is consumed", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry-juice",
        currentHp: 100,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      const consumeEffect = result.effects.find((e) => e.type === "consume");
      expect(consumeEffect).toBeDefined();
    });

    it("given a Pokemon above 50% HP holding Berry Juice, when end-of-turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry-juice",
        currentHp: 150,
        maxHp: 200,
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Focus Band ---

  describe("Given Focus Band held item", () => {
    it("given a Pokemon holding Focus Band and RNG succeeds (12% chance), when damage would KO, then survives with 1 HP", () => {
      // Arrange: RNG chance returns true (12% proc)
      const context = createItemContext({
        heldItem: "focus-band",
        currentHp: 30,
        maxHp: 200,
        chanceResult: true,
        damage: 50, // 50 damage would KO from 30 HP
      });

      // Act
      const result = applyGen2HeldItem("on-damage-taken", context);

      // Assert
      expect(result.activated).toBe(true);
      const surviveEffect = result.effects.find((e) => e.type === "survive");
      expect(surviveEffect).toBeDefined();
      expect(surviveEffect!.value).toBe(1);
    });

    it("given a Pokemon holding Focus Band and RNG fails, when damage would KO, then no activation", () => {
      // Arrange: RNG chance returns false
      const context = createItemContext({
        heldItem: "focus-band",
        currentHp: 30,
        maxHp: 200,
        chanceResult: false,
        damage: 50,
      });

      // Act
      const result = applyGen2HeldItem("on-damage-taken", context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- King's Rock ---

  describe("Given King's Rock held item", () => {
    it("given a Pokemon holding King's Rock and RNG succeeds (10% chance), when on-hit triggers, then returns flinch effect", () => {
      // Arrange: RNG chance returns true (10% proc)
      const context = createItemContext({
        heldItem: "kings-rock",
        chanceResult: true,
      });

      // Act
      const result = applyGen2HeldItem("on-hit", context);

      // Assert
      expect(result.activated).toBe(true);
      const flinchEffect = result.effects.find((e) => e.type === "flinch");
      expect(flinchEffect).toBeDefined();
    });

    it("given a Pokemon holding King's Rock and RNG fails, when on-hit triggers, then no activation", () => {
      // Arrange: RNG chance returns false
      const context = createItemContext({
        heldItem: "kings-rock",
        chanceResult: false,
      });

      // Act
      const result = applyGen2HeldItem("on-hit", context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- No Item / Unknown Item ---

  describe("Given no item or unknown item", () => {
    it("given a Pokemon with no held item, when any trigger fires, then no activation", () => {
      // Arrange
      const context = createItemContext({ heldItem: null });

      // Act
      const endOfTurn = applyGen2HeldItem("end-of-turn", context);
      const onDmg = applyGen2HeldItem("on-damage-taken", context);
      const onHit = applyGen2HeldItem("on-hit", context);

      // Assert
      expect(endOfTurn.activated).toBe(false);
      expect(onDmg.activated).toBe(false);
      expect(onHit.activated).toBe(false);
    });

    it("given a Pokemon with an unknown item, when any trigger fires, then no activation", () => {
      // Arrange
      const context = createItemContext({ heldItem: "mystery-widget" });

      // Act
      const endOfTurn = applyGen2HeldItem("end-of-turn", context);
      const onDmg = applyGen2HeldItem("on-damage-taken", context);
      const onHit = applyGen2HeldItem("on-hit", context);

      // Assert
      expect(endOfTurn.activated).toBe(false);
      expect(onDmg.activated).toBe(false);
      expect(onHit.activated).toBe(false);
    });

    it("given any item, when an unknown trigger fires, then no activation", () => {
      // Arrange
      const context = createItemContext({ heldItem: "leftovers" });

      // Act
      const result = applyGen2HeldItem("unknown-trigger", context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Berry non-matching status tests ---

  describe("Given berries with non-matching statuses", () => {
    it("given Ice Berry but Pokemon has paralysis (not burn), when end-of-turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "ice-berry",
        status: "paralysis",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given Mint Berry but Pokemon has burn (not sleep), when end-of-turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "mint-berry",
        status: "burn",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given Burnt Berry but Pokemon has poison (not freeze), when end-of-turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "burnt-berry",
        status: "poison",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given PSNCureBerry but Pokemon has burn (not poison), when end-of-turn triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "psncureberry",
        status: "burn",
      });

      // Act
      const result = applyGen2HeldItem("end-of-turn", context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });

  // --- Berry Juice on-damage-taken ---

  describe("Given Berry Juice on-damage-taken", () => {
    it("given Berry Juice and HP drops below 50% after damage, when on-damage-taken triggers, then heals 20 HP", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry-juice",
        currentHp: 120,
        maxHp: 200,
        damage: 30, // 120 - 30 = 90, which is <= 100 (50% of 200)
      });

      // Act
      const result = applyGen2HeldItem("on-damage-taken", context);

      // Assert
      expect(result.activated).toBe(true);
      const healEffect = result.effects.find((e) => e.type === "heal");
      expect(healEffect).toBeDefined();
      expect(healEffect!.value).toBe(20);
    });

    it("given Berry Juice and HP stays above 50% after damage, when on-damage-taken triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry-juice",
        currentHp: 180,
        maxHp: 200,
        damage: 10, // 180 - 10 = 170, which is > 100 (50% of 200)
      });

      // Act
      const result = applyGen2HeldItem("on-damage-taken", context);

      // Assert
      expect(result.activated).toBe(false);
    });

    it("given Berry Juice and damage would KO, when on-damage-taken triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "berry-juice",
        currentHp: 30,
        maxHp: 200,
        damage: 50, // 30 - 50 = -20, which is <= 0 (KO)
      });

      // Act
      const result = applyGen2HeldItem("on-damage-taken", context);

      // Assert: Berry Juice doesn't activate on KO
      expect(result.activated).toBe(false);
    });
  });

  // --- Focus Band non-KO case ---

  describe("Given Focus Band when damage does not KO", () => {
    it("given Focus Band and damage does not KO, when on-damage-taken triggers, then no activation", () => {
      // Arrange
      const context = createItemContext({
        heldItem: "focus-band",
        currentHp: 100,
        maxHp: 200,
        chanceResult: true,
        damage: 10, // 100 - 10 = 90 > 0, not a KO
      });

      // Act
      const result = applyGen2HeldItem("on-damage-taken", context);

      // Assert
      expect(result.activated).toBe(false);
    });
  });
});
