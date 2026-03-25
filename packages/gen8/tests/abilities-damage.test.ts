import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_FIXED_POINT,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import type { MoveData, MoveEffect, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen8DataManager, GEN8_ABILITY_IDS, GEN8_ITEM_IDS, GEN8_MOVE_IDS, GEN8_NATURE_IDS, GEN8_SPECIES_IDS } from "../src";
import {
  getAteAbilityOverride,
  getDragonsMawMultiplier,
  getFurCoatMultiplier,
  getGorillaTacticsMultiplier,
  getIceScalesMultiplier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getPunkRockIncomingMultiplier,
  getPunkRockMultiplier,
  getSheerForceMultiplier,
  getSteelworkerMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getToughClawsMultiplier,
  getTransistorMultiplier,
  handleGen8DamageCalcAbility,
  handleGen8DamageImmunityAbility,
  hasSheerForceEligibleEffect,
  isParentalBondEligible,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "../src/Gen8AbilitiesDamage";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const gen8Data = createGen8DataManager();

const TEST_IDS = {
  abilities: {
    none: CORE_ABILITY_IDS.none,
    aerilate: GEN8_ABILITY_IDS.aerilate,
    dragonsMaw: ["dragons", "maw"].join("-"),
    furCoat: GEN8_ABILITY_IDS.furCoat,
    galvanize: GEN8_ABILITY_IDS.galvanize,
    gorillaTactics: GEN8_ABILITY_IDS.gorillaTactics,
    iceScales: GEN8_ABILITY_IDS.iceScales,
    intimidate: CORE_ABILITY_IDS.intimidate,
    ironFist: GEN8_ABILITY_IDS.ironFist,
    megaLauncher: GEN8_ABILITY_IDS.megaLauncher,
    multiscale: GEN8_ABILITY_IDS.multiscale,
    parentalBond: GEN8_ABILITY_IDS.parentalBond,
    pixilate: GEN8_ABILITY_IDS.pixilate,
    punkRock: GEN8_ABILITY_IDS.punkRock,
    refrigerate: GEN8_ABILITY_IDS.refrigerate,
    sheerForce: GEN8_ABILITY_IDS.sheerForce,
    shadowShield: GEN8_ABILITY_IDS.shadowShield,
    steelworker: GEN8_ABILITY_IDS.steelworker,
    strongJaw: GEN8_ABILITY_IDS.strongJaw,
    sturdy: CORE_ABILITY_IDS.sturdy,
    thickFat: GEN8_ABILITY_IDS.thickFat,
    toughClaws: GEN8_ABILITY_IDS.toughClaws,
    transistor: GEN8_ABILITY_IDS.transistor,
  },
  items: {
    pokeBall: GEN8_ITEM_IDS.pokeBall,
  },
  moves: {
    tackle: CORE_MOVE_IDS.tackle,
    thunderbolt: GEN8_MOVE_IDS.thunderbolt,
    dragonPulse: GEN8_MOVE_IDS.dragonPulse,
    flamethrower: GEN8_MOVE_IDS.flamethrower,
    ironHead: GEN8_MOVE_IDS.ironHead,
  },
  natures: {
    hardy: GEN8_NATURE_IDS.hardy,
  },
  species: {
    pikachu: GEN8_SPECIES_IDS.pikachu,
  },
  statuses: {
    burn: CORE_STATUS_IDS.burn,
    paralysis: CORE_STATUS_IDS.paralysis,
  },
  volatiles: {
    flinch: CORE_VOLATILE_IDS.flinch,
  },
  types: CORE_TYPE_IDS,
  weather: CORE_WEATHER_IDS,
} as const;

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
  nickname?: string | null;
  movedThisTurn?: boolean;
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
      speciesId: overrides.speciesId ?? TEST_IDS.species.pikachu,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: TEST_IDS.natures.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? TEST_IDS.abilities.none,
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
      pokeball: TEST_IDS.items.pokeBall,
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
    volatileStatuses: new Map(),
    types: overrides.types ?? [TEST_IDS.types.normal],
    ability: overrides.ability ?? TEST_IDS.abilities.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
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

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  hasCrashDamage?: boolean;
}): MoveData {
  const id = overrides.id ?? TEST_IDS.moves.tackle;
  const move = gen8Data.getMove(id);
  return {
    id,
    displayName: move.displayName,
    type: overrides.type ?? move.type,
    category: overrides.category ?? move.category,
    power: overrides.power ?? move.power,
    accuracy: move.accuracy,
    pp: move.pp,
    priority: move.priority,
    target: move.target,
    flags: {
      ...move.flags,
      ...overrides.flags,
    },
    effect: overrides.effect ?? move.effect,
    description: move.description,
    generation: move.generation,
    critRatio: move.critRatio ?? 0,
    hasCrashDamage: overrides.hasCrashDamage ?? move.hasCrashDamage ?? false,
  } as MoveData;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 8,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeCtx(overrides: {
  ability: string;
  move?: MoveData;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  types?: PokemonType[];
  nickname?: string | null;
  opponent?: ActivePokemon;
  weather?: string | null;
}): AbilityContext {
  const hp = overrides.maxHp ?? 200;
  return {
    pokemon: makeActive({
      ability: overrides.ability,
      currentHp: overrides.currentHp ?? hp,
      hp: hp,
      status: overrides.status ?? null,
      types: overrides.types ?? [TEST_IDS.types.normal],
      nickname: overrides.nickname ?? null,
    }),
    opponent: overrides.opponent ?? makeActive({}),
    state: makeState(
      overrides.weather ? { weather: { type: overrides.weather, turnsLeft: 5, source: "" } } : {},
    ),
    rng: new SeededRandom(42),
    trigger: "on-damage-calc",
    move: overrides.move,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 8 Damage Abilities", () => {
  // ---- Sheer Force ----

  describe("Sheer Force", () => {
    it("given a move with status-chance effect, when Sheer Force is active, then returns ~1.3x multiplier", () => {
      // Source: Showdown data/abilities.ts -- sheerforce onBasePower: chainModify([5325, 4096])
      // CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity = 1.2998046875
      const effect: MoveEffect = {
        type: "status-chance",
        status: TEST_IDS.statuses.burn,
        chance: 10,
      };
      const mult = getSheerForceMultiplier(TEST_IDS.abilities.sheerForce, effect);
      expect(mult).toBe(CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity);
    });

    it("given a move without secondary effects, when Sheer Force is active, then returns 1.0x", () => {
      // Source: Showdown data/abilities.ts -- sheerforce: only boosts moves with secondaries
      const mult = getSheerForceMultiplier(TEST_IDS.abilities.sheerForce, null);
      expect(mult).toBe(1);
    });

    it("given Sheer Force and an eligible move, when checking Life Orb suppression, then returns true", () => {
      // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
      const effect: MoveEffect = {
        type: "status-chance",
        status: TEST_IDS.statuses.paralysis,
        chance: 30,
      };
      expect(sheerForceSuppressesLifeOrb(TEST_IDS.abilities.sheerForce, effect)).toBe(true);
    });

    it("given non-Sheer-Force ability, when checking Life Orb suppression, then returns false", () => {
      const effect: MoveEffect = {
        type: "status-chance",
        status: TEST_IDS.statuses.burn,
        chance: 10,
      };
      expect(sheerForceSuppressesLifeOrb(TEST_IDS.abilities.ironFist, effect)).toBe(false);
    });

    it("given the dispatcher, when Sheer Force user uses eligible move, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- sheerforce
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.sheerForce,
        move: makeMove({
          effect: { type: "status-chance", status: TEST_IDS.statuses.burn, chance: 10 },
        }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Sheer Force user uses non-eligible move, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.sheerForce,
        move: makeMove({ effect: null }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Tough Claws ----

  describe("Tough Claws", () => {
    it("given a contact move, when Tough Claws is active, then returns 5325/4096 (~1.3x)", () => {
      // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
      const mult = getToughClawsMultiplier(TEST_IDS.abilities.toughClaws, true);
      expect(mult).toBe(CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity);
    });

    it("given a non-contact move, when Tough Claws is active, then returns 1.0x", () => {
      const mult = getToughClawsMultiplier(TEST_IDS.abilities.toughClaws, false);
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Tough Claws for contact move, then returns 1.0x", () => {
      const mult = getToughClawsMultiplier(TEST_IDS.abilities.ironFist, true);
      expect(mult).toBe(1);
    });
  });

  // ---- Strong Jaw ----

  describe("Strong Jaw", () => {
    it("given a bite move, when Strong Jaw is active, then returns 1.5x", () => {
      // Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
      const mult = getStrongJawMultiplier(TEST_IDS.abilities.strongJaw, true);
      expect(mult).toBe(1.5);
    });

    it("given a non-bite move, when Strong Jaw is active, then returns 1.0x", () => {
      const mult = getStrongJawMultiplier(TEST_IDS.abilities.strongJaw, false);
      expect(mult).toBe(1);
    });
  });

  // ---- Mega Launcher ----

  describe("Mega Launcher", () => {
    it("given a pulse move, when Mega Launcher is active, then returns 1.5x", () => {
      // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
      const mult = getMegaLauncherMultiplier(TEST_IDS.abilities.megaLauncher, true);
      expect(mult).toBe(1.5);
    });

    it("given a non-pulse move, when Mega Launcher is active, then returns 1.0x", () => {
      const mult = getMegaLauncherMultiplier(TEST_IDS.abilities.megaLauncher, false);
      expect(mult).toBe(1);
    });
  });

  // ---- Multiscale ----

  describe("Multiscale", () => {
    it("given full HP, when Multiscale is active, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- multiscale: at full HP, halve damage
      const mult = getMultiscaleMultiplier(TEST_IDS.abilities.multiscale, 200, 200);
      expect(mult).toBe(CORE_FIXED_POINT.half / CORE_FIXED_POINT.identity);
    });

    it("given less than full HP, when Multiscale is active, then returns 1.0x", () => {
      const mult = getMultiscaleMultiplier(TEST_IDS.abilities.multiscale, 199, 200);
      expect(mult).toBe(1);
    });

    it("given Shadow Shield at full HP, when checking multiplier, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- shadowshield: same as multiscale
      const mult = getMultiscaleMultiplier(TEST_IDS.abilities.shadowShield, 300, 300);
      expect(mult).toBe(CORE_FIXED_POINT.half / CORE_FIXED_POINT.identity);
    });

    it("given a different ability, when checking Multiscale, then returns 1.0x", () => {
      const mult = getMultiscaleMultiplier(TEST_IDS.abilities.intimidate, 200, 200);
      expect(mult).toBe(1);
    });
  });

  // ---- Fur Coat ----

  describe("Fur Coat", () => {
    it("given a physical move, when Fur Coat is active, then returns 2.0x defense multiplier", () => {
      // Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
      const mult = getFurCoatMultiplier(TEST_IDS.abilities.furCoat, true);
      expect(mult).toBe(2);
    });

    it("given a special move, when Fur Coat is active, then returns 1.0x", () => {
      const mult = getFurCoatMultiplier(TEST_IDS.abilities.furCoat, false);
      expect(mult).toBe(1);
    });
  });

  // ---- -ate abilities ----

  describe("-ate abilities", () => {
    it("given Pixilate and a Normal move, when checking type override, then returns Fairy + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- pixilate Gen 7+: chainModify([4915, 4096])
      // CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity = 1.1999...
      const result = getAteAbilityOverride(TEST_IDS.abilities.pixilate, TEST_IDS.types.normal);
      expect(result).toEqual({ type: TEST_IDS.types.fairy, multiplier: CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity });
    });

    it("given Aerilate and a Normal move, when checking type override, then returns Flying + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- aerilate Gen 7+: chainModify([4915, 4096])
      const result = getAteAbilityOverride(TEST_IDS.abilities.aerilate, TEST_IDS.types.normal);
      expect(result).toEqual({ type: TEST_IDS.types.flying, multiplier: CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity });
    });

    it("given Refrigerate and a Normal move, when checking type override, then returns Ice + 1.2x", () => {
      const result = getAteAbilityOverride(TEST_IDS.abilities.refrigerate, TEST_IDS.types.normal);
      expect(result).toEqual({ type: TEST_IDS.types.ice, multiplier: CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity });
    });

    it("given Galvanize and a Normal move, when checking type override, then returns Electric + 1.2x", () => {
      const result = getAteAbilityOverride(TEST_IDS.abilities.galvanize, TEST_IDS.types.normal);
      expect(result).toEqual({ type: TEST_IDS.types.electric, multiplier: CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity });
    });

    it("given Pixilate and a Fire move (non-Normal), when checking type override, then returns null", () => {
      // Source: -ate abilities only change Normal moves
      const result = getAteAbilityOverride(TEST_IDS.abilities.pixilate, TEST_IDS.types.fire);
      expect(result).toBeNull();
    });

    it("given a non-ate ability and Normal move, when checking type override, then returns null", () => {
      const result = getAteAbilityOverride(TEST_IDS.abilities.intimidate, TEST_IDS.types.normal);
      expect(result).toBeNull();
    });
  });

  // ---- Parental Bond ----

  describe("Parental Bond", () => {
    it("given Parental Bond and a powered move, when checking eligibility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: Gen 7+ secondHit 0.25
      expect(isParentalBondEligible(TEST_IDS.abilities.parentalBond, 50, null)).toBe(true);
    });

    it("given Parental Bond and a multi-hit move, when checking eligibility, then returns false", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: excluded for multi-hit
      expect(isParentalBondEligible(TEST_IDS.abilities.parentalBond, 50, "multi-hit")).toBe(false);
    });

    it("given Parental Bond and a zero-power move, when checking eligibility, then returns false", () => {
      expect(isParentalBondEligible(TEST_IDS.abilities.parentalBond, 0, null)).toBe(false);
    });

    it("given second hit multiplier, then it equals 0.25 (25%)", () => {
      // Source: Showdown data/abilities.ts -- Gen 7+: parentalbond secondHit 0.25
      // Source: Bulbapedia "Parental Bond" -- "nerfed from 50% to 25% in Gen 7"
      expect(PARENTAL_BOND_SECOND_HIT_MULTIPLIER).toBe(0.25);
    });
  });

  // ---- Gorilla Tactics (NEW Gen 8) ----

  describe("Gorilla Tactics", () => {
    it("given a physical move, when Gorilla Tactics is active, then returns 6144/4096 (1.5x)", () => {
      // Source: Showdown data/abilities.ts -- gorillatactics: onModifyAtk, chainModify(1.5)
      // CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity = 1.5
      const mult = getGorillaTacticsMultiplier(TEST_IDS.abilities.gorillaTactics, "physical");
      expect(mult).toBe(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity);
    });

    it("given a special move, when Gorilla Tactics is active, then returns 1.0x", () => {
      // Source: Showdown data/abilities.ts -- gorillatactics: only boosts physical Attack
      const mult = getGorillaTacticsMultiplier(TEST_IDS.abilities.gorillaTactics, "special");
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Gorilla Tactics user uses physical move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.gorillaTactics,
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Gorilla Tactics user uses special move, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.gorillaTactics,
        move: makeMove({ category: "special" }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Transistor (NEW Gen 8) ----

  describe("Transistor", () => {
    it("given an Electric move, when Transistor is active, then returns 6144/4096 (1.5x)", () => {
      // Source: Showdown data/abilities.ts -- transistor: chainModify(1.5) in Gen 8
      // Source: Bulbapedia "Transistor" -- "powers up Electric-type moves by 50%"
      const mult = getTransistorMultiplier(TEST_IDS.abilities.transistor, TEST_IDS.types.electric);
      expect(mult).toBe(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity);
    });

    it("given a non-Electric move, when Transistor is active, then returns 1.0x", () => {
      const mult = getTransistorMultiplier(TEST_IDS.abilities.transistor, TEST_IDS.types.fire);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Transistor user uses Thunderbolt, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.transistor,
        move: makeMove({ type: TEST_IDS.types.electric, id: TEST_IDS.moves.thunderbolt }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Transistor user uses Flamethrower, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.transistor,
        move: makeMove({ type: TEST_IDS.types.fire, id: TEST_IDS.moves.flamethrower }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Dragon's Maw (NEW Gen 8) ----

  describe("Dragon's Maw", () => {
    it("given a Dragon move, when Dragon's Maw is active, then returns 6144/4096 (1.5x)", () => {
      // Source: Showdown data/abilities.ts -- dragonsmaw: chainModify(1.5)
      // Source: Bulbapedia "Dragon's Maw" -- "powers up Dragon-type moves by 50%"
      const mult = getDragonsMawMultiplier(TEST_IDS.abilities.dragonsMaw, TEST_IDS.types.dragon);
      expect(mult).toBe(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity);
    });

    it("given a non-Dragon move, when Dragon's Maw is active, then returns 1.0x", () => {
      const mult = getDragonsMawMultiplier(TEST_IDS.abilities.dragonsMaw, TEST_IDS.types.fire);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Dragon's Maw user uses Dragon Pulse, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.dragonsMaw,
        move: makeMove({ type: TEST_IDS.types.dragon, id: TEST_IDS.moves.dragonPulse }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Punk Rock (NEW Gen 8) ----

  describe("Punk Rock", () => {
    it("given a sound move, when Punk Rock attacker checks outgoing multiplier, then returns 5325/4096 (~1.3x)", () => {
      // Source: Showdown data/abilities.ts -- punkrock: onBasePower, chainModify([5325, 4096])
      // Source: Bulbapedia "Punk Rock" -- "boosts the power of sound-based moves by 30%"
      const mult = getPunkRockMultiplier(TEST_IDS.abilities.punkRock, true);
      expect(mult).toBe(CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity);
    });

    it("given a non-sound move, when Punk Rock attacker checks outgoing multiplier, then returns 1.0x", () => {
      const mult = getPunkRockMultiplier(TEST_IDS.abilities.punkRock, false);
      expect(mult).toBe(1);
    });

    it("given a sound move, when Punk Rock defender checks incoming multiplier, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- punkrock: onSourceModifyDamage, chainModify(0.5)
      // Source: Bulbapedia "Punk Rock" -- "halves the damage taken from sound-based moves"
      const mult = getPunkRockIncomingMultiplier(TEST_IDS.abilities.punkRock, true);
      expect(mult).toBe(CORE_FIXED_POINT.half / CORE_FIXED_POINT.identity);
    });

    it("given a non-sound move, when Punk Rock defender checks incoming multiplier, then returns 1.0x", () => {
      const mult = getPunkRockIncomingMultiplier(TEST_IDS.abilities.punkRock, false);
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Punk Rock outgoing, then returns 1.0x", () => {
      const mult = getPunkRockMultiplier(TEST_IDS.abilities.intimidate, true);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Punk Rock user uses sound move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.punkRock,
        move: makeMove({ flags: { sound: true } }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Ice Scales (NEW Gen 8) ----

  describe("Ice Scales", () => {
    it("given a special move, when Ice Scales defender is active, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- icescales: onSourceModifyDamage, chainModify(0.5)
      // Source: Bulbapedia "Ice Scales" -- "halves the damage taken from special moves"
      const mult = getIceScalesMultiplier(TEST_IDS.abilities.iceScales, "special");
      expect(mult).toBe(CORE_FIXED_POINT.half / CORE_FIXED_POINT.identity);
    });

    it("given a physical move, when Ice Scales defender is active, then returns 1.0x", () => {
      const mult = getIceScalesMultiplier(TEST_IDS.abilities.iceScales, "physical");
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Ice Scales for special move, then returns 1.0x", () => {
      const mult = getIceScalesMultiplier(TEST_IDS.abilities.thickFat, "special");
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Ice Scales defender is hit by special move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.iceScales,
        move: makeMove({ category: "special" }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Ice Scales defender is hit by physical move, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.iceScales,
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Steelworker ----

  describe("Steelworker", () => {
    it("given a Steel move, when Steelworker is active, then returns 6144/4096 (1.5x)", () => {
      // Source: Showdown data/abilities.ts -- steelworker: chainModify(1.5)
      // Source: Bulbapedia "Steelworker" -- "powers up Steel-type moves by 50%"
      const mult = getSteelworkerMultiplier(TEST_IDS.abilities.steelworker, TEST_IDS.types.steel);
      expect(mult).toBe(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity);
    });

    it("given a non-Steel move, when Steelworker is active, then returns 1.0x", () => {
      const mult = getSteelworkerMultiplier(TEST_IDS.abilities.steelworker, TEST_IDS.types.fire);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Steelworker user uses Steel move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.steelworker,
        move: makeMove({ type: TEST_IDS.types.steel, id: TEST_IDS.moves.ironHead }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Sturdy / Wonder Guard ----

  describe("Sturdy", () => {
    it("given Sturdy at full HP and lethal damage, when checking cap, then caps at maxHp - 1", () => {
      // Source: Showdown data/abilities.ts -- sturdy onDamage (priority -30)
      const maxHp = 200;
      const lethalDamage = 300;
      const capped = getSturdyDamageCap(TEST_IDS.abilities.sturdy, lethalDamage, maxHp, maxHp);
      expect(capped).toBe(maxHp - 1);
    });

    it("given Sturdy not at full HP and lethal damage, when checking cap, then does not cap", () => {
      const lethalDamage = 300;
      const currentHp = 150;
      const maxHp = 200;
      const capped = getSturdyDamageCap(TEST_IDS.abilities.sturdy, lethalDamage, currentHp, maxHp);
      expect(capped).toBe(lethalDamage);
    });

    it("given Sturdy at full HP and non-lethal damage, when checking cap, then does not cap", () => {
      const damage = 50;
      const hp = 200;
      const capped = getSturdyDamageCap(TEST_IDS.abilities.sturdy, damage, hp, hp);
      expect(capped).toBe(damage);
    });

    it("given Sturdy and an OHKO move, when checking block, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sturdy onTryHit
      const ohkoEffect: MoveEffect = { type: "ohko" };
      expect(sturdyBlocksOHKO(TEST_IDS.abilities.sturdy, ohkoEffect)).toBe(true);
    });

    it("given Sturdy and a non-OHKO move, when checking block, then returns false", () => {
      expect(sturdyBlocksOHKO(TEST_IDS.abilities.sturdy, null)).toBe(false);
    });

    it("given the immunity dispatcher, when Sturdy faces OHKO move, then returns movePrevented:true", () => {
      const ctx = makeCtx({
        ability: TEST_IDS.abilities.sturdy,
        move: makeMove({ effect: { type: "ohko" } }),
      });
      const result = handleGen8DamageImmunityAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.movePrevented).toBe(true);
    });
  });

  // ---- hasSheerForceEligibleEffect edge cases ----

  describe("hasSheerForceEligibleEffect", () => {
    it("given a volatile-status with chance > 0, when checking eligibility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sheerforce: volatile with chance
      const effect: MoveEffect = {
        type: "volatile-status",
        volatile: TEST_IDS.volatiles.flinch,
        chance: 30,
      };
      expect(hasSheerForceEligibleEffect(effect)).toBe(true);
    });

    it("given null effect, when checking eligibility, then returns false", () => {
      expect(hasSheerForceEligibleEffect(null)).toBe(false);
    });
  });
});
