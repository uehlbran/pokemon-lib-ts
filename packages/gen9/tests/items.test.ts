import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import type { PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
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

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeActive(overrides: {
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
      uid: "test",
      speciesId: overrides.speciesId ?? 1,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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

function makeState(
  overrides: {
    weather?: { type: string; turnsLeft: number } | null;
    magicRoom?: { active: boolean; turnsLeft: number } | null;
  } = {},
): BattleState {
  return {
    format: { generation: 9, battleType: "singles" },
    sides: [
      { active: [], bench: [], entryHazards: {} } as any,
      { active: [], bench: [], entryHazards: {} } as any,
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

function makeRng(overrides?: { chance?: (p: number) => boolean }): SeededRandom {
  return {
    chance: overrides?.chance ?? ((_p: number) => false),
    next: () => 0.5,
    nextInt: (min: number, _max: number) => min,
    seed: 12345,
    getState: () => 12345,
  } as any;
}

function makeContext(overrides: {
  pokemon?: ActivePokemon;
  state?: BattleState;
  rng?: SeededRandom;
  move?: any;
  damage?: number;
  opponent?: ActivePokemon;
}): ItemContext {
  return {
    pokemon: overrides.pokemon ?? makeActive({}),
    state: overrides.state ?? makeState(),
    rng: overrides.rng ?? makeRng(),
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
      const result = getChoiceItemBoost("choice-band");
      expect(result).toEqual({ stat: "atk", multiplier: 1.5 });
    });

    // Source: Showdown data/items.ts -- Choice Specs onModifySpA: 1.5x
    it("given Choice Specs, when getting boost, then returns spatk 1.5x", () => {
      const result = getChoiceItemBoost("choice-specs");
      expect(result).toEqual({ stat: "spatk", multiplier: 1.5 });
    });

    // Source: Showdown data/items.ts -- Choice Scarf onModifySpe: 1.5x
    it("given Choice Scarf, when getting boost, then returns spe 1.5x", () => {
      const result = getChoiceItemBoost("choice-scarf");
      expect(result).toEqual({ stat: "spe", multiplier: 1.5 });
    });

    it("given non-choice item, when getting boost, then returns null", () => {
      expect(getChoiceItemBoost("leftovers")).toBeNull();
    });
  });

  describe("isChoiceLocked", () => {
    // Source: Showdown data/items.ts -- Choice items lock the holder into one move
    it("given Pokemon with Choice Band, when checking lock, then returns true", () => {
      const pokemon = makeActive({ heldItem: "choice-band" });
      expect(isChoiceLocked(pokemon)).toBe(true);
    });

    // Gen 9 has no Dynamax -- Choice lock always applies
    // Source: Bulbapedia -- Dynamax removed in Gen 9, no suppression
    it("given Pokemon with Choice Specs, when checking lock, then returns true (no Dynamax in Gen 9)", () => {
      const pokemon = makeActive({ heldItem: "choice-specs" });
      expect(isChoiceLocked(pokemon)).toBe(true);
    });

    it("given Pokemon with Leftovers, when checking lock, then returns false", () => {
      const pokemon = makeActive({ heldItem: "leftovers" });
      expect(isChoiceLocked(pokemon)).toBe(false);
    });

    it("given Pokemon with no item, when checking lock, then returns false", () => {
      const pokemon = makeActive({ heldItem: null });
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
      expect(getTypeBoostItem("charcoal", "fire")).toBe(4915);
    });

    // Source: Showdown data/items.ts -- Charcoal only boosts Fire moves
    it("given Charcoal with Water move, when checking boost, then returns 4096 (1.0x)", () => {
      expect(getTypeBoostItem("charcoal", "water")).toBe(4096);
    });

    // Source: Showdown data/items.ts -- Mystic Water boosts Water moves
    it("given Mystic Water with Water move, when checking boost, then returns 4915", () => {
      expect(getTypeBoostItem("mystic-water", "water")).toBe(4915);
    });

    // Source: Showdown data/items.ts -- Flame Plate is a plate, boosts Fire
    it("given Flame Plate with Fire move, when checking boost, then returns 4915", () => {
      expect(getTypeBoostItem("flame-plate", "fire")).toBe(4915);
    });

    // Source: Showdown data/items.ts -- Sea Incense boosts Water
    it("given Sea Incense with Water move, when checking boost, then returns 4915", () => {
      expect(getTypeBoostItem("sea-incense", "water")).toBe(4915);
    });

    // Source: Showdown data/items.ts -- Fairy Feather boosts Fairy (Gen 9 new)
    it("given Fairy Feather with Fairy move, when checking boost, then returns 4915 (Gen 9 new)", () => {
      expect(getTypeBoostItem("fairy-feather", "fairy")).toBe(4915);
    });

    // Fairy Feather should not boost non-Fairy moves
    it("given Fairy Feather with Normal move, when checking boost, then returns 4096", () => {
      expect(getTypeBoostItem("fairy-feather", "normal")).toBe(4096);
    });

    it("given non-boost item, when checking boost, then returns 4096", () => {
      expect(getTypeBoostItem("leftovers", "fire")).toBe(4096);
    });
  });

  describe("getItemDamageModifier", () => {
    // Source: Showdown data/items.ts -- Charcoal 4915/4096 for Fire physical
    it("given Charcoal + Fire physical move, when getting modifier, then returns 4915", () => {
      expect(
        getItemDamageModifier("charcoal", { moveType: "fire", moveCategory: "physical" }),
      ).toBe(4915);
    });

    // Source: Showdown data/items.ts -- Life Orb 5325/4096 for any damaging move
    it("given Life Orb + physical move, when getting modifier, then returns 5325 (1.3x)", () => {
      expect(
        getItemDamageModifier("life-orb", { moveType: "normal", moveCategory: "physical" }),
      ).toBe(5325);
    });

    // Source: Showdown data/items.ts -- Life Orb does not boost status moves
    it("given Life Orb + status move, when getting modifier, then returns 4096 (no boost)", () => {
      expect(
        getItemDamageModifier("life-orb", { moveType: "normal", moveCategory: "status" }),
      ).toBe(4096);
    });

    // Source: Showdown data/items.ts -- Choice Band 6144/4096 for physical
    it("given Choice Band + physical move, when getting modifier, then returns 6144 (1.5x)", () => {
      expect(
        getItemDamageModifier("choice-band", { moveType: "normal", moveCategory: "physical" }),
      ).toBe(6144);
    });

    // Source: Showdown data/items.ts -- Choice Band does not boost special moves
    it("given Choice Band + special move, when getting modifier, then returns 4096", () => {
      expect(
        getItemDamageModifier("choice-band", { moveType: "normal", moveCategory: "special" }),
      ).toBe(4096);
    });

    // Source: Showdown data/items.ts -- Choice Specs 6144/4096 for special
    it("given Choice Specs + special move, when getting modifier, then returns 6144", () => {
      expect(
        getItemDamageModifier("choice-specs", { moveType: "normal", moveCategory: "special" }),
      ).toBe(6144);
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
      expect(getTypeResistBerry("occa-berry", "fire", 2)).toBe(2048);
    });

    // Source: Showdown data/items.ts -- Occa Berry does not activate on neutral Fire
    it("given Occa Berry vs neutral Fire move, when checking resist, then returns 4096 (no activation)", () => {
      expect(getTypeResistBerry("occa-berry", "fire", 1)).toBe(4096);
    });

    // Source: Showdown data/items.ts -- Occa Berry does not activate on Water
    it("given Occa Berry vs Water move (wrong type), then returns 4096", () => {
      expect(getTypeResistBerry("occa-berry", "water", 2)).toBe(4096);
    });

    // Source: Showdown data/items.ts -- Roseli Berry halves SE Fairy damage
    it("given Roseli Berry vs SE Fairy move, then returns 2048", () => {
      expect(getTypeResistBerry("roseli-berry", "fairy", 2)).toBe(2048);
    });

    // Source: Showdown data/items.ts -- Chilan Berry halves Normal damage regardless of SE
    // Source: Bulbapedia "Chilan Berry" -- activates on any Normal-type hit
    it("given Chilan Berry vs Normal move (1x), when checking resist, then returns 2048 (always activates for Normal)", () => {
      expect(getTypeResistBerry("chilan-berry", "normal", 1)).toBe(2048);
    });

    it("given non-berry item, when checking resist, then returns 4096", () => {
      expect(getTypeResistBerry("leftovers", "fire", 2)).toBe(4096);
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
      const pokemon = makeActive({ heldItem: "occa-berry", types: ["grass"] });
      const ctx = makeContext({
        pokemon,
        move: { id: "flamethrower", type: "fire", category: "special" },
        damage: 100,
      });
      // on-damage-taken does not handle resist berries (handled in damage calc)
      const result = applyGen9HeldItem("on-damage-taken", ctx);
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
      expect(getLifeOrbRecoil(153)).toBe(15);
    });
  });

  describe("applyGen9HeldItem -- Life Orb on-hit", () => {
    // Source: Showdown data/items.ts -- Life Orb recoil on-hit
    it("given Pokemon with Life Orb dealing damage, when on-hit triggers, then recoil = floor(maxHP/10)", () => {
      const pokemon = makeActive({ heldItem: "life-orb", hp: 200 });
      const ctx = makeContext({
        pokemon,
        move: { id: "tackle", type: "normal", category: "physical", effect: null },
        damage: 50,
      });
      const result = applyGen9HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      // floor(200 / 10) = 20 HP recoil
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "self", value: 20 });
    });

    // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
    it("given Sheer Force Pokemon with Life Orb using move with secondary effect, when on-hit triggers, then no recoil", () => {
      const pokemon = makeActive({ heldItem: "life-orb", hp: 200, ability: "sheer-force" });
      const ctx = makeContext({
        pokemon,
        move: {
          id: "flamethrower",
          type: "fire",
          category: "special",
          effect: { type: "status-chance", status: "burn", chance: 10 },
        },
        damage: 50,
      });
      const result = applyGen9HeldItem("on-hit", ctx);
      expect(result.activated).toBe(false);
    });

    // Life Orb does not trigger when no damage dealt
    it("given Pokemon with Life Orb dealing 0 damage, when on-hit triggers, then no recoil", () => {
      const pokemon = makeActive({ heldItem: "life-orb", hp: 200 });
      const ctx = makeContext({
        pokemon,
        move: { id: "tackle", type: "normal", category: "physical", effect: null },
        damage: 0,
      });
      const result = applyGen9HeldItem("on-hit", ctx);
      expect(result.activated).toBe(false);
    });
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
      expect(getLeftoversHeal(160)).toBe(10);
    });
  });

  describe("applyGen9HeldItem -- Leftovers end-of-turn", () => {
    // Source: Showdown data/items.ts -- Leftovers heals 1/16 max HP each end-of-turn
    it("given Pokemon with Leftovers at end-of-turn, when triggered, then heals floor(maxHP/16)", () => {
      const pokemon = makeActive({ heldItem: "leftovers", hp: 200, currentHp: 150 });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      // floor(200 / 16) = 12
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 12 });
    });

    // Leftovers at full HP still triggers (the engine caps the heal)
    it("given Pokemon with Leftovers at full HP, when triggered, then still returns heal effect", () => {
      const pokemon = makeActive({ heldItem: "leftovers", hp: 200, currentHp: 200 });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
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
      const result = getBlackSludgeEffect({ types: ["poison"], maxHp: 200 });
      expect(result.type).toBe("heal");
      // floor(200 / 16) = 12
      expect(result.amount).toBe(12);
    });

    // Source: Showdown data/items.ts -- Black Sludge damages non-Poison floor(maxHP/8)
    it("given Normal-type Pokemon with maxHP 200, when calculating effect, then damages 25", () => {
      const result = getBlackSludgeEffect({ types: ["normal"], maxHp: 200 });
      expect(result.type).toBe("damage");
      // floor(200 / 8) = 25
      expect(result.amount).toBe(25);
    });
  });

  describe("applyGen9HeldItem -- Black Sludge end-of-turn", () => {
    // Source: Showdown data/items.ts -- Black Sludge onResidual for Poison type
    it("given Poison-type Pokemon with Black Sludge, when end-of-turn, then heals", () => {
      const pokemon = makeActive({
        heldItem: "black-sludge",
        types: ["poison"],
        hp: 200,
        currentHp: 150,
      });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 12 });
    });

    // Source: Showdown data/items.ts -- Black Sludge damages non-Poison
    it("given Normal-type Pokemon with Black Sludge, when end-of-turn, then takes chip damage", () => {
      const pokemon = makeActive({
        heldItem: "black-sludge",
        types: ["normal"],
        hp: 200,
        currentHp: 150,
      });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "self", value: 25 });
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
      const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 200 });
      const ctx = makeContext({ pokemon, damage: 300 });
      const result = applyGen9HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "survive", target: "self", value: 1 },
        { type: "consume", target: "self", value: "focus-sash" },
      ]);
    });

    // Source: Showdown data/items.ts -- Focus Sash only from full HP
    it("given 95% HP Pokemon with Focus Sash hit by KO move, when triggered, then does not activate", () => {
      const pokemon = makeActive({ heldItem: "focus-sash", hp: 200, currentHp: 190 });
      const ctx = makeContext({ pokemon, damage: 300 });
      const result = applyGen9HeldItem("on-damage-taken", ctx);
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
      const pokemon = makeActive({ heldItem: "focus-band", hp: 200, currentHp: 100 });
      const ctx = makeContext({
        pokemon,
        damage: 200,
        rng: makeRng({ chance: () => true }),
      });
      const result = applyGen9HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "survive", target: "self", value: 1 }]);
      // Not consumed -- Focus Band is reusable
      expect(result.effects.some((e: any) => e.type === "consume")).toBe(false);
    });

    // Source: Showdown data/items.ts -- Focus Band 10% chance (fails 90%)
    it("given Pokemon with Focus Band and KO damage, when RNG fails, then does not activate", () => {
      const pokemon = makeActive({ heldItem: "focus-band", hp: 200, currentHp: 100 });
      const ctx = makeContext({
        pokemon,
        damage: 200,
        rng: makeRng({ chance: () => false }),
      });
      const result = applyGen9HeldItem("on-damage-taken", ctx);
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
      expect(getEvioliteModifier(true)).toBe(6144);
    });

    // Source: Showdown data/items.ts -- Eviolite no effect for fully evolved
    it("given fully evolved Pokemon, when checking modifier, then returns 4096 (1.0x)", () => {
      expect(getEvioliteModifier(false)).toBe(4096);
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
      const pokemon = makeActive({ heldItem: "assault-vest" });
      expect(isAssaultVestHolder(pokemon)).toBe(true);
    });

    it("given Pokemon with Leftovers, when checking, then returns false", () => {
      const pokemon = makeActive({ heldItem: "leftovers" });
      expect(isAssaultVestHolder(pokemon)).toBe(false);
    });

    it("given Pokemon with no item, when checking, then returns false", () => {
      const pokemon = makeActive({ heldItem: null });
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
      const defender = makeActive({ heldItem: "rocky-helmet", hp: 200 });
      const attacker = makeActive({ hp: 300 });
      const ctx = makeContext({
        pokemon: defender,
        opponent: attacker,
        move: { id: "tackle", type: "normal", category: "physical", flags: { contact: true } },
      });
      const result = applyGen9HeldItem("on-contact", ctx);
      expect(result.activated).toBe(true);
      // floor(300 / 6) = 50
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "opponent", value: 50 });
    });

    // Source: Showdown data/items.ts -- Rocky Helmet only on contact moves
    it("given defender with Rocky Helmet hit by non-contact move, when on-contact triggers, then no activation", () => {
      const defender = makeActive({ heldItem: "rocky-helmet", hp: 200 });
      const ctx = makeContext({
        pokemon: defender,
        move: { id: "earthquake", type: "ground", category: "physical", flags: {} },
      });
      const result = applyGen9HeldItem("on-contact", ctx);
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
      const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 200, currentHp: 80 });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      // floor(200 / 4) = 50
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 50 });
      expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "sitrus-berry" });
    });

    // Source: Showdown data/items.ts -- Sitrus Berry only at <= 50% HP
    it("given Pokemon at 60% HP with Sitrus Berry at end-of-turn, when triggered, then does not activate", () => {
      const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 200, currentHp: 120 });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("applyGen9HeldItem -- Sitrus Berry on-damage-taken", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry also triggers after taking damage
    it("given Pokemon dropped to 50% HP after damage with Sitrus Berry, when on-damage-taken, then heals and consumed", () => {
      const pokemon = makeActive({ heldItem: "sitrus-berry", hp: 200, currentHp: 100 });
      const ctx = makeContext({ pokemon, damage: 100 });
      const result = applyGen9HeldItem("on-damage-taken", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 50 });
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
      const pokemon = makeActive({ heldItem: "oran-berry", hp: 200, currentHp: 80 });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 10 });
      expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "oran-berry" });
    });

    it("given Pokemon at 60% HP with Oran Berry, when end-of-turn, then no activation", () => {
      const pokemon = makeActive({ heldItem: "oran-berry", hp: 200, currentHp: 120 });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
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
      const pokemon = makeActive({ heldItem: "lum-berry", status: "paralysis" });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
      expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "lum-berry" });
    });

    // Source: Showdown data/items.ts -- Lum Berry also cures confusion
    it("given confused Pokemon (no primary status) with Lum Berry, when end-of-turn, then confusion cured and consumed", () => {
      const volatiles = new Map([["confusion", { turnsLeft: 3 }]]);
      const pokemon = makeActive({ heldItem: "lum-berry", volatiles });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        type: "volatile-cure",
        target: "self",
        value: "confusion",
      });
      expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "lum-berry" });
    });

    it("given healthy Pokemon with Lum Berry, when end-of-turn, then no activation", () => {
      const pokemon = makeActive({ heldItem: "lum-berry" });
      const ctx = makeContext({ pokemon });
      const result = applyGen9HeldItem("end-of-turn", ctx);
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
    const pokemon = makeActive({ heldItem: "cheri-berry", status: "paralysis" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  // Source: Showdown data/items.ts -- Chesto Berry cures sleep
  it("given sleeping Pokemon with Chesto Berry, when end-of-turn, then wakes up", () => {
    const pokemon = makeActive({ heldItem: "chesto-berry", status: "sleep" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  // Source: Showdown data/items.ts -- Pecha Berry cures poison
  it("given poisoned Pokemon with Pecha Berry, when end-of-turn, then cures poison", () => {
    const pokemon = makeActive({ heldItem: "pecha-berry", status: "poison" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  // Source: Showdown data/items.ts -- Rawst Berry cures burn
  it("given burned Pokemon with Rawst Berry, when end-of-turn, then cures burn", () => {
    const pokemon = makeActive({ heldItem: "rawst-berry", status: "burn" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  // Source: Showdown data/items.ts -- Aspear Berry cures freeze
  it("given frozen Pokemon with Aspear Berry, when end-of-turn, then thaws out", () => {
    const pokemon = makeActive({ heldItem: "aspear-berry", status: "freeze" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  // Cheri Berry does not activate without paralysis
  it("given burned Pokemon with Cheri Berry, when end-of-turn, then no activation (wrong status)", () => {
    const pokemon = makeActive({ heldItem: "cheri-berry", status: "burn" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
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
      expect(getPinchBerryThreshold({ ability: "gluttony" }, 0.25)).toBe(0.5);
    });

    it("given non-Gluttony ability with 25% threshold, when checking, then returns 0.25", () => {
      expect(getPinchBerryThreshold({ ability: "none" }, 0.25)).toBe(0.25);
    });
  });

  // Source: Showdown data/items.ts -- Liechi Berry +1 Atk at 25% HP
  it("given Pokemon at 25% HP with Liechi Berry, when on-damage-taken, then +1 Attack and consumed", () => {
    // 200 * 0.25 = 50; currentHp = 50 <= 50 triggers
    const pokemon = makeActive({ heldItem: "liechi-berry", hp: 200, currentHp: 50 });
    const ctx = makeContext({ pokemon, damage: 10 });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "attack" });
    expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "liechi-berry" });
  });

  // Source: Showdown data/items.ts -- Salac Berry +1 Speed at 25% HP
  it("given Pokemon at 25% HP with Salac Berry, when on-damage-taken, then +1 Speed and consumed", () => {
    const pokemon = makeActive({ heldItem: "salac-berry", hp: 200, currentHp: 50 });
    const ctx = makeContext({ pokemon, damage: 10 });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "speed" });
  });

  // Source: Showdown data/items.ts -- Petaya Berry +1 SpAtk at 25% HP
  it("given Pokemon at 25% HP with Petaya Berry, when on-damage-taken, then +1 SpAtk and consumed", () => {
    const pokemon = makeActive({ heldItem: "petaya-berry", hp: 200, currentHp: 50 });
    const ctx = makeContext({ pokemon, damage: 10 });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "spAttack" });
  });

  // Pinch berry does not activate above threshold
  it("given Pokemon at 30% HP with Liechi Berry, when on-damage-taken, then no activation (above 25% threshold)", () => {
    // 200 * 0.25 = 50; currentHp = 60 > 50 does not trigger
    const pokemon = makeActive({ heldItem: "liechi-berry", hp: 200, currentHp: 60 });
    const ctx = makeContext({ pokemon, damage: 10 });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
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
    const pokemon = makeActive({
      heldItem: "weakness-policy",
      types: ["grass"],
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeContext({
      pokemon,
      move: { id: "flamethrower", type: "fire", category: "special" },
      damage: 50,
    });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
      stages: 2,
    });
    expect(result.effects[1]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
      stages: 2,
    });
    expect(result.effects[2]).toEqual({
      type: "consume",
      target: "self",
      value: "weakness-policy",
    });
  });

  // Source: Showdown data/items.ts -- Weakness Policy only on SE (not neutral)
  it("given Pokemon hit by neutral move with Weakness Policy, when on-damage-taken, then no activation", () => {
    const pokemon = makeActive({
      heldItem: "weakness-policy",
      types: ["normal"],
      hp: 200,
      currentHp: 150,
    });
    const ctx = makeContext({
      pokemon,
      move: { id: "flamethrower", type: "fire", category: "special" },
      damage: 50,
    });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Toxic Orb / Flame Orb
// ═══════════════════════════════════════════════════════════════════════════

describe("Status Orbs", () => {
  // Source: Showdown data/items.ts -- Toxic Orb badly poisons at end of turn
  it("given healthy Pokemon with Toxic Orb, when end-of-turn, then badly poisoned", () => {
    const pokemon = makeActive({ heldItem: "toxic-orb" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "inflict-status",
      target: "self",
      status: "badly-poisoned",
    });
  });

  // Source: Showdown -- Poison types immune to Toxic Orb
  it("given Poison-type Pokemon with Toxic Orb, when end-of-turn, then no activation (immune)", () => {
    const pokemon = makeActive({ heldItem: "toxic-orb", types: ["poison"] });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  // Source: Showdown data/items.ts -- Flame Orb burns at end of turn
  it("given healthy Pokemon with Flame Orb, when end-of-turn, then burned", () => {
    const pokemon = makeActive({ heldItem: "flame-orb" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "inflict-status", target: "self", status: "burn" });
  });

  // Source: Showdown -- Fire types immune to Flame Orb
  it("given Fire-type Pokemon with Flame Orb, when end-of-turn, then no activation (immune)", () => {
    const pokemon = makeActive({ heldItem: "flame-orb", types: ["fire"] });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  // Already-statused Pokemon do not gain another status
  it("given already-burned Pokemon with Toxic Orb, when end-of-turn, then no activation", () => {
    const pokemon = makeActive({ heldItem: "toxic-orb", status: "burn" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Booster Energy (Gen 9 new)
// ═══════════════════════════════════════════════════════════════════════════

describe("Booster Energy", () => {
  // Source: Showdown data/items.ts -- boosterenergy item ID
  it("given 'booster-energy' item ID, when checking isBoosterEnergy, then returns true", () => {
    expect(isBoosterEnergy("booster-energy")).toBe(true);
  });

  it("given 'leftovers' item ID, when checking isBoosterEnergy, then returns false", () => {
    expect(isBoosterEnergy("leftovers")).toBe(false);
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
    const pokemon = makeActive({ heldItem: "covert-cloak" });
    expect(hasCovertCloak(pokemon)).toBe(true);
  });

  it("given Pokemon with Leftovers, when checking hasCovertCloak, then returns false", () => {
    const pokemon = makeActive({ heldItem: "leftovers" });
    expect(hasCovertCloak(pokemon)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Air Balloon / Iron Ball / Utility Umbrella / Terrain Extender
// ═══════════════════════════════════════════════════════════════════════════

describe("Utility Items", () => {
  // Source: Showdown data/items.ts -- Air Balloon: immunity to Ground
  it("given Pokemon with Air Balloon, when checking hasAirBalloon, then returns true", () => {
    const pokemon = makeActive({ heldItem: "air-balloon" });
    expect(hasAirBalloon(pokemon)).toBe(true);
  });

  it("given Pokemon without Air Balloon, when checking hasAirBalloon, then returns false", () => {
    const pokemon = makeActive({ heldItem: "leftovers" });
    expect(hasAirBalloon(pokemon)).toBe(false);
  });

  // Source: Showdown data/items.ts -- Iron Ball halves Speed, grounds
  it("given Pokemon with Iron Ball, when checking hasIronBall, then returns true", () => {
    const pokemon = makeActive({ heldItem: "iron-ball" });
    expect(hasIronBall(pokemon)).toBe(true);
  });

  // Source: Showdown data/items.ts -- Utility Umbrella negates weather
  it("given Pokemon with Utility Umbrella, when checking, then returns true", () => {
    const pokemon = makeActive({ heldItem: "utility-umbrella" });
    expect(hasUtilityUmbrella(pokemon)).toBe(true);
  });

  // Source: Showdown data/items.ts -- Terrain Extender extends terrain
  it("given Pokemon with Terrain Extender, when checking, then returns true", () => {
    const pokemon = makeActive({ heldItem: "terrain-extender" });
    expect(hasTerrainExtender(pokemon)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Weather Rocks
// ═══════════════════════════════════════════════════════════════════════════

describe("Weather Rocks", () => {
  // Source: Showdown data/items.ts -- Heat Rock extends Sun to 8 turns
  it("given Heat Rock, when checking weather type, then returns 'sun'", () => {
    expect(getWeatherRockType("heat-rock")).toBe("sun");
  });

  // Source: Showdown data/items.ts -- Damp Rock extends Rain to 8 turns
  it("given Damp Rock, when checking weather type, then returns 'rain'", () => {
    expect(getWeatherRockType("damp-rock")).toBe("rain");
  });

  // Source: Showdown data/items.ts -- Smooth Rock extends Sandstorm to 8 turns
  it("given Smooth Rock, when checking weather type, then returns 'sandstorm'", () => {
    expect(getWeatherRockType("smooth-rock")).toBe("sandstorm");
  });

  // Source: Showdown data/items.ts -- Icy Rock extends Snow to 8 turns (Gen 9: Hail->Snow)
  it("given Icy Rock, when checking weather type, then returns 'snow'", () => {
    expect(getWeatherRockType("icy-rock")).toBe("snow");
  });

  it("given non-rock item, when checking weather type, then returns null", () => {
    expect(getWeatherRockType("leftovers")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Safety Goggles
// ═══════════════════════════════════════════════════════════════════════════

describe("Safety Goggles", () => {
  // Source: Showdown data/items.ts -- Safety Goggles blocks powder moves
  it("given Safety Goggles vs powder move, when checking, then returns true", () => {
    expect(isGen9PowderBlocked("safety-goggles", { powder: true })).toBe(true);
  });

  it("given Safety Goggles vs non-powder move, when checking, then returns false", () => {
    expect(isGen9PowderBlocked("safety-goggles", { powder: false })).toBe(false);
  });

  it("given non-Goggles item vs powder move, when checking, then returns false", () => {
    expect(isGen9PowderBlocked("leftovers", { powder: true })).toBe(false);
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
      const result = getConsumableItemEffect("blunder-policy", { moveMissed: true });
      expect(result).toEqual({ stat: "speed", stages: 2, consumed: true });
    });

    // Source: Showdown data/items.ts -- Room Service -1 Speed in Trick Room
    it("given Room Service with Trick Room active, when checking effect, then returns -1 Speed consumed", () => {
      const result = getConsumableItemEffect("room-service", { trickRoomActive: true });
      expect(result).toEqual({ stat: "speed", stages: -1, consumed: true });
    });

    // Source: Showdown data/items.ts -- Throat Spray +1 SpAtk on sound
    it("given Throat Spray with sound move, when checking effect, then returns +1 SpAtk consumed", () => {
      const result = getConsumableItemEffect("throat-spray", { moveFlags: { sound: true } });
      expect(result).toEqual({ stat: "spAttack", stages: 1, consumed: true });
    });

    // Source: Showdown data/items.ts -- Eject Pack forces switch on stat drop
    it("given Eject Pack with stat lowered, when checking effect, then returns consumed", () => {
      const result = getConsumableItemEffect("eject-pack", { statChange: -1 });
      expect(result).toEqual({ stat: "none", stages: 0, consumed: true });
    });

    it("given non-consumable item, when checking effect, then returns null", () => {
      expect(getConsumableItemEffect("leftovers", {})).toBeNull();
    });
  });

  describe("applyGen9HeldItem -- Throat Spray on-hit", () => {
    // Source: Showdown data/items.ts -- Throat Spray after using sound move
    it("given Pokemon with Throat Spray using sound move, when on-hit, then +1 SpA and consumed", () => {
      const pokemon = makeActive({ heldItem: "throat-spray" });
      const ctx = makeContext({
        pokemon,
        move: { id: "hyper-voice", type: "normal", category: "special", flags: { sound: true } },
        damage: 80,
      });
      const result = applyGen9HeldItem("on-hit", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "spAttack" });
      expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "throat-spray" });
    });

    // Source: Showdown data/items.ts -- Throat Spray does not trigger on non-sound
    it("given Pokemon with Throat Spray using non-sound move, when on-hit, then no activation", () => {
      const pokemon = makeActive({ heldItem: "throat-spray" });
      const ctx = makeContext({
        pokemon,
        move: { id: "tackle", type: "normal", category: "physical", flags: {} },
        damage: 80,
      });
      const result = applyGen9HeldItem("on-hit", ctx);
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
    const pokemon = makeActive({ heldItem: "shell-bell", hp: 200 });
    const ctx = makeContext({
      pokemon,
      move: { id: "tackle", type: "normal", category: "physical" },
      damage: 80,
    });
    const result = applyGen9HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    // floor(80 / 8) = 10
    expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 10 });
  });

  // Source: Showdown data/items.ts -- King's Rock 10% flinch
  it("given Pokemon with King's Rock dealing damage when RNG succeeds, when on-hit, then flinch opponent", () => {
    const pokemon = makeActive({ heldItem: "kings-rock" });
    const ctx = makeContext({
      pokemon,
      move: { id: "tackle", type: "normal", category: "physical" },
      damage: 50,
      rng: makeRng({ chance: () => true }),
    });
    const result = applyGen9HeldItem("on-hit", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "flinch", target: "opponent" });
  });

  // Source: Showdown data/items.ts -- King's Rock 10% chance (fails 90%)
  it("given Pokemon with King's Rock dealing damage when RNG fails, when on-hit, then no activation", () => {
    const pokemon = makeActive({ heldItem: "kings-rock" });
    const ctx = makeContext({
      pokemon,
      move: { id: "tackle", type: "normal", category: "physical" },
      damage: 50,
      rng: makeRng({ chance: () => false }),
    });
    const result = applyGen9HeldItem("on-hit", ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Klutz / Embargo / Magic Room suppression
// ═══════════════════════════════════════════════════════════════════════════

describe("Item Suppression", () => {
  // Source: Showdown data/abilities.ts -- Klutz blocks all item effects
  it("given Klutz holder with Leftovers, when end-of-turn, then no activation", () => {
    const pokemon = makeActive({
      heldItem: "leftovers",
      ability: "klutz",
      hp: 200,
      currentHp: 100,
    });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  // Source: Showdown -- Embargo blocks item effects
  it("given embargoed holder with Leftovers, when end-of-turn, then no activation", () => {
    const volatiles = new Map([["embargo", { turnsLeft: 3 }]]);
    const pokemon = makeActive({ heldItem: "leftovers", hp: 200, currentHp: 100, volatiles });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  // Source: Showdown data/moves.ts -- Magic Room blocks all held item effects
  it("given Magic Room active with Leftovers holder, when end-of-turn, then no activation", () => {
    const pokemon = makeActive({ heldItem: "leftovers", hp: 200, currentHp: 100 });
    const state = makeState({ magicRoom: { active: true, turnsLeft: 3 } });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon, state }));
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Unburden volatile
// ═══════════════════════════════════════════════════════════════════════════

describe("Unburden", () => {
  // Source: Showdown data/abilities.ts -- Unburden doubles Speed after item consumed
  it("given Unburden holder consuming Sitrus Berry, when triggered, then sets unburden volatile", () => {
    const pokemon = makeActive({
      heldItem: "sitrus-berry",
      ability: "unburden",
      hp: 200,
      currentHp: 80,
    });
    const ctx = makeContext({ pokemon });
    const result = applyGen9HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has("unburden")).toBe(true);
  });

  // Source: Showdown -- Unburden does not re-apply if already set
  it("given Unburden holder that already has unburden volatile, when consuming another item, then does not re-set volatile", () => {
    const volatiles = new Map([["unburden", { turnsLeft: -1 }]]);
    const pokemon = makeActive({
      heldItem: "sitrus-berry",
      ability: "unburden",
      hp: 200,
      currentHp: 80,
      volatiles,
    });
    const ctx = makeContext({ pokemon });
    applyGen9HeldItem("end-of-turn", ctx);
    // volatile should still be there (not duplicated/re-set)
    expect(pokemon.volatileStatuses.get("unburden")).toEqual({ turnsLeft: -1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No item / unknown trigger
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("given Pokemon with no held item, when any trigger fires, then returns inactive", () => {
    const pokemon = makeActive({ heldItem: null });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  it("given unknown trigger type, when applyGen9HeldItem called, then returns inactive", () => {
    const pokemon = makeActive({ heldItem: "leftovers" });
    const result = applyGen9HeldItem("unknown-trigger" as string, makeContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Air Balloon on-damage-taken
// ═══════════════════════════════════════════════════════════════════════════

describe("Air Balloon on-damage-taken", () => {
  // Source: Showdown data/items.ts -- Air Balloon pops when hit by damaging move
  it("given Pokemon with Air Balloon hit by damaging move, when on-damage-taken, then balloon consumed", () => {
    const pokemon = makeActive({ heldItem: "air-balloon", hp: 200, currentHp: 180 });
    const ctx = makeContext({ pokemon, damage: 20 });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "consume", target: "self", value: "air-balloon" });
  });

  it("given Pokemon with Air Balloon taking 0 damage, when on-damage-taken, then no activation", () => {
    const pokemon = makeActive({ heldItem: "air-balloon", hp: 200, currentHp: 200 });
    const ctx = makeContext({ pokemon, damage: 0 });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Red Card / Eject Button
// ═══════════════════════════════════════════════════════════════════════════

describe("Red Card and Eject Button", () => {
  // Source: Showdown data/items.ts -- Red Card forces attacker to switch
  it("given Pokemon with Red Card taking damage, when on-damage-taken, then forces opponent switch and consumed", () => {
    const pokemon = makeActive({ heldItem: "red-card", hp: 200, currentHp: 150 });
    const ctx = makeContext({ pokemon, damage: 50 });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "none", target: "opponent", value: "force-switch" });
    expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "red-card" });
  });

  // Source: Showdown data/items.ts -- Eject Button forces holder to switch
  it("given Pokemon with Eject Button taking damage, when on-damage-taken, then forces self switch and consumed", () => {
    const pokemon = makeActive({ heldItem: "eject-button", hp: 200, currentHp: 150 });
    const ctx = makeContext({ pokemon, damage: 50 });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "none", target: "self", value: "force-switch" });
    expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "eject-button" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mental Herb
// ═══════════════════════════════════════════════════════════════════════════

describe("Mental Herb", () => {
  // Source: Showdown data/items.ts -- Mental Herb cures Taunt, Encore, etc.
  it("given taunted Pokemon with Mental Herb, when end-of-turn, then cures taunt and consumed", () => {
    const volatiles = new Map([["taunt", { turnsLeft: 3 }]]);
    const pokemon = makeActive({ heldItem: "mental-herb", volatiles });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "volatile-cure", target: "self", value: "taunt" });
    expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "mental-herb" });
  });

  it("given healthy Pokemon with Mental Herb (no volatiles), when end-of-turn, then no activation", () => {
    const pokemon = makeActive({ heldItem: "mental-herb" });
    const result = applyGen9HeldItem("end-of-turn", makeContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sticky Barb
// ═══════════════════════════════════════════════════════════════════════════

describe("Sticky Barb", () => {
  // Source: Showdown data/items.ts -- Sticky Barb 1/8 HP damage each turn
  it("given Pokemon with Sticky Barb at end-of-turn, when triggered, then takes 1/8 maxHP damage", () => {
    const pokemon = makeActive({ heldItem: "sticky-barb", hp: 200, currentHp: 200 });
    const ctx = makeContext({ pokemon });
    const result = applyGen9HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    // floor(200 / 8) = 25
    expect(result.effects[0]).toEqual({ type: "chip-damage", target: "self", value: 25 });
  });

  // Different maxHP for triangulation
  it("given Pokemon with Sticky Barb with maxHP 160, when end-of-turn, then takes 20 damage", () => {
    const pokemon = makeActive({ heldItem: "sticky-barb", hp: 160, currentHp: 160 });
    const ctx = makeContext({ pokemon });
    const result = applyGen9HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    // floor(160 / 8) = 20
    expect(result.effects[0]).toEqual({ type: "chip-damage", target: "self", value: 20 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Absorb Bulb / Cell Battery / Snowball / Luminous Moss (on-damage-taken)
// ═══════════════════════════════════════════════════════════════════════════

describe("Type-triggered stat berries/items", () => {
  // Source: Showdown data/items.ts -- Absorb Bulb +1 SpA on Water hit
  it("given Pokemon with Absorb Bulb hit by Water move, when on-damage-taken, then +1 SpA and consumed", () => {
    const pokemon = makeActive({ heldItem: "absorb-bulb", hp: 200, currentHp: 150 });
    const ctx = makeContext({
      pokemon,
      move: { id: "surf", type: "water", category: "special" },
      damage: 50,
    });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "spAttack" });
    expect(result.effects[1]).toEqual({ type: "consume", target: "self", value: "absorb-bulb" });
  });

  // Absorb Bulb does not trigger on non-Water
  it("given Pokemon with Absorb Bulb hit by Fire move, when on-damage-taken, then no activation", () => {
    const pokemon = makeActive({ heldItem: "absorb-bulb", hp: 200, currentHp: 150 });
    const ctx = makeContext({
      pokemon,
      move: { id: "flamethrower", type: "fire", category: "special" },
      damage: 50,
    });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });

  // Source: Showdown data/items.ts -- Cell Battery +1 Atk on Electric hit
  it("given Pokemon with Cell Battery hit by Electric move, when on-damage-taken, then +1 Atk and consumed", () => {
    const pokemon = makeActive({ heldItem: "cell-battery", hp: 200, currentHp: 150 });
    const ctx = makeContext({
      pokemon,
      move: { id: "thunderbolt", type: "electric", category: "special" },
      damage: 50,
    });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "attack" });
  });

  // Source: Showdown data/items.ts -- Snowball +1 Atk on Ice hit
  it("given Pokemon with Snowball hit by Ice move, when on-damage-taken, then +1 Atk and consumed", () => {
    const pokemon = makeActive({ heldItem: "snowball", hp: 200, currentHp: 150 });
    const ctx = makeContext({
      pokemon,
      move: { id: "ice-beam", type: "ice", category: "special" },
      damage: 50,
    });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "attack" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kee Berry / Maranga Berry
// ═══════════════════════════════════════════════════════════════════════════

describe("Kee and Maranga Berries", () => {
  // Source: Showdown data/items.ts -- Kee Berry +1 Def on physical hit
  it("given Pokemon with Kee Berry hit by physical move, when on-damage-taken, then +1 Def and consumed", () => {
    const pokemon = makeActive({ heldItem: "kee-berry", hp: 200, currentHp: 150 });
    const ctx = makeContext({
      pokemon,
      move: { id: "tackle", type: "normal", category: "physical" },
      damage: 50,
    });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "defense" });
  });

  // Source: Showdown data/items.ts -- Maranga Berry +1 SpDef on special hit
  it("given Pokemon with Maranga Berry hit by special move, when on-damage-taken, then +1 SpDef and consumed", () => {
    const pokemon = makeActive({ heldItem: "maranga-berry", hp: 200, currentHp: 150 });
    const ctx = makeContext({
      pokemon,
      move: { id: "flamethrower", type: "fire", category: "special" },
      damage: 50,
    });
    const result = applyGen9HeldItem("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "stat-boost", target: "self", value: "spDefense" });
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
    const pokemon = makeActive({ heldItem: "leftovers", hp: 160, currentHp: 120 });
    const ctx = makeContext({ pokemon });
    const result = ruleset.applyHeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
    // floor(160 / 16) = 10 HP healed
    expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 10 });
  });

  it("given Gen9Ruleset, when calling applyHeldItem with no item, then returns inactive result", () => {
    const ruleset = new Gen9Ruleset();
    const pokemon = makeActive({ heldItem: null });
    const ctx = makeContext({ pokemon });
    const result = ruleset.applyHeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });
});
