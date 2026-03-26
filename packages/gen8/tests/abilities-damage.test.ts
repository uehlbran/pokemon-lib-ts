import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_ABILITY_IDS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
  createEvs,
  createIvs,
  createPokemonInstance,
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
const itemIds = { ...CORE_ITEM_IDS, ...GEN8_ITEM_IDS } as const;
const moveCategories = CORE_MOVE_CATEGORIES;
const moveIds = { ...CORE_MOVE_IDS, ...GEN8_MOVE_IDS } as const;
const natureIds = GEN8_NATURE_IDS;
const speciesIds = GEN8_SPECIES_IDS;
const dragonsMawAbilityId = gen8Data.getSpecies(speciesIds.regidrago).abilities.normal[0];
const abilityIds = {
  ...CORE_ABILITY_IDS,
  ...GEN8_ABILITY_IDS,
  dragonsMaw: dragonsMawAbilityId,
} as const;
const abilityTriggerIds = CORE_ABILITY_TRIGGER_IDS;
const statusIds = CORE_STATUS_IDS;
const typeIds = CORE_TYPE_IDS;
const volatileIds = CORE_VOLATILE_IDS;
const weatherIds = CORE_WEATHER_IDS;
const defaultSpecies = gen8Data.getSpecies(speciesIds.eevee);
const defaultNature = gen8Data.getNature(natureIds.hardy).id;
const regidragoAbilityId = gen8Data.getSpecies(speciesIds.regidrago).abilities.normal[0]!;
const defaultCalculatedStats = {
  hp: 200,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
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
  ability?: (typeof abilityIds)[keyof typeof abilityIds];
  heldItem?: (typeof itemIds)[keyof typeof itemIds] | null;
  status?: (typeof statusIds)[keyof typeof statusIds] | null;
  speciesId?: (typeof speciesIds)[keyof typeof speciesIds];
  nickname?: string | null;
  movedThisTurn?: boolean;
}): ActivePokemon {
  const level = overrides.level ?? 50;
  const maxHp = overrides.hp ?? defaultCalculatedStats.hp;
  const species = gen8Data.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, level, new SeededRandom(7), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    moves: [],
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });

  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = (overrides.status ?? null) as any;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: overrides.attack ?? defaultCalculatedStats.attack,
    defense: overrides.defense ?? defaultCalculatedStats.defense,
    spAttack: overrides.spAttack ?? defaultCalculatedStats.spAttack,
    spDefense: overrides.spDefense ?? defaultCalculatedStats.spDefense,
    speed: overrides.speed ?? defaultCalculatedStats.speed,
  };

  const active = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(species.types as PokemonType[])],
  );
  active.ability = overrides.ability ?? abilityIds.none;
  active.movedThisTurn = overrides.movedThisTurn ?? false;
  return active;
}

function createCanonicalMove(moveId: string): MoveData {
  return gen8Data.getMove(moveId);
}

function createSyntheticMoveFrom(
  baseMove: MoveData,
  overrides: {
  type?: PokemonType;
  category?: MoveData["category"];
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  hasCrashDamage?: boolean;
  id?: string;
} = {},
): MoveData {
  return {
    ...baseMove,
    id: overrides.id ?? baseMove.id,
    type: overrides.type ?? baseMove.type,
    category: overrides.category ?? baseMove.category,
    power: overrides.power ?? baseMove.power,
    flags: {
      ...baseMove.flags,
      ...overrides.flags,
    },
    effect: overrides.effect ?? baseMove.effect,
    hasCrashDamage: overrides.hasCrashDamage ?? baseMove.hasCrashDamage ?? false,
  } as MoveData;
}

function createBattleState(overrides?: {
  weather?:
    | {
        type: (typeof weatherIds)[keyof typeof weatherIds];
        turnsLeft: number;
        source: (typeof abilityIds)[keyof typeof abilityIds];
      }
    | null;
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

function createAbilityContext(overrides: {
  ability: (typeof abilityIds)[keyof typeof abilityIds];
  move?: MoveData;
  currentHp?: number;
  maxHp?: number;
  status?: (typeof statusIds)[keyof typeof statusIds] | null;
  types?: PokemonType[];
  nickname?: string | null;
  opponent?: ActivePokemon;
  weather?: (typeof weatherIds)[keyof typeof weatherIds] | null;
}): AbilityContext {
  const hp = overrides.maxHp ?? 200;
  return {
    pokemon: createOnFieldPokemon({
      ability: overrides.ability,
      currentHp: overrides.currentHp ?? hp,
      hp: hp,
      status: overrides.status ?? null,
      types: overrides.types,
      nickname: overrides.nickname ?? null,
    }),
    opponent: overrides.opponent ?? createOnFieldPokemon({}),
    state: createBattleState(
      overrides.weather
        ? { weather: { type: overrides.weather, turnsLeft: 5, source: abilityIds.none } }
        : {},
    ),
    rng: new SeededRandom(42),
    trigger: abilityTriggerIds.onDamageCalc,
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
        status: statusIds.burn,
        chance: 10,
      };
      const mult = getSheerForceMultiplier(abilityIds.sheerForce, effect);
      expect(mult).toBe(CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity);
    });

    it("given a move without secondary effects, when Sheer Force is active, then returns 1.0x", () => {
      // Source: Showdown data/abilities.ts -- sheerforce: only boosts moves with secondaries
      const mult = getSheerForceMultiplier(abilityIds.sheerForce, null);
      expect(mult).toBe(1);
    });

    it("given Sheer Force and an eligible move, when checking Life Orb suppression, then returns true", () => {
      // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
      const effect: MoveEffect = {
        type: "status-chance",
        status: statusIds.paralysis,
        chance: 30,
      };
      expect(sheerForceSuppressesLifeOrb(abilityIds.sheerForce, effect)).toBe(true);
    });

    it("given non-Sheer-Force ability, when checking Life Orb suppression, then returns false", () => {
      const effect: MoveEffect = {
        type: "status-chance",
        status: statusIds.burn,
        chance: 10,
      };
      expect(sheerForceSuppressesLifeOrb(abilityIds.ironFist, effect)).toBe(false);
    });

    it("given the dispatcher, when Sheer Force user uses eligible move, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- sheerforce
      const ctx = createAbilityContext({
        ability: abilityIds.sheerForce,
        move: createSyntheticMoveFrom(createCanonicalMove(moveIds.tackle), {
          effect: { type: "status-chance", status: statusIds.burn, chance: 10 },
        }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Sheer Force user uses non-eligible move, then returns activated:false", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.sheerForce,
        move: createCanonicalMove(moveIds.tackle),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Tough Claws ----

  describe("Tough Claws", () => {
    it("given a contact move, when Tough Claws is active, then returns 5325/4096 (~1.3x)", () => {
      // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
      const mult = getToughClawsMultiplier(abilityIds.toughClaws, true);
      expect(mult).toBe(CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity);
    });

    it("given a non-contact move, when Tough Claws is active, then returns 1.0x", () => {
      const mult = getToughClawsMultiplier(abilityIds.toughClaws, false);
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Tough Claws for contact move, then returns 1.0x", () => {
      const mult = getToughClawsMultiplier(abilityIds.ironFist, true);
      expect(mult).toBe(1);
    });
  });

  // ---- Strong Jaw ----

  describe("Strong Jaw", () => {
    it("given a bite move, when Strong Jaw is active, then returns 1.5x", () => {
      // Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
      const mult = getStrongJawMultiplier(abilityIds.strongJaw, true);
      expect(mult).toBe(1.5);
    });

    it("given a non-bite move, when Strong Jaw is active, then returns 1.0x", () => {
      const mult = getStrongJawMultiplier(abilityIds.strongJaw, false);
      expect(mult).toBe(1);
    });
  });

  // ---- Mega Launcher ----

  describe("Mega Launcher", () => {
    it("given a pulse move, when Mega Launcher is active, then returns 1.5x", () => {
      // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
      const mult = getMegaLauncherMultiplier(abilityIds.megaLauncher, true);
      expect(mult).toBe(1.5);
    });

    it("given a non-pulse move, when Mega Launcher is active, then returns 1.0x", () => {
      const mult = getMegaLauncherMultiplier(abilityIds.megaLauncher, false);
      expect(mult).toBe(1);
    });
  });

  // ---- Multiscale ----

  describe("Multiscale", () => {
    it("given full HP, when Multiscale is active, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- multiscale: at full HP, halve damage
      const mult = getMultiscaleMultiplier(abilityIds.multiscale, 200, 200);
      expect(mult).toBe(CORE_FIXED_POINT.half / CORE_FIXED_POINT.identity);
    });

    it("given less than full HP, when Multiscale is active, then returns 1.0x", () => {
      const mult = getMultiscaleMultiplier(abilityIds.multiscale, 199, 200);
      expect(mult).toBe(1);
    });

    it("given Shadow Shield at full HP, when checking multiplier, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- shadowshield: same as multiscale
      const mult = getMultiscaleMultiplier(abilityIds.shadowShield, 300, 300);
      expect(mult).toBe(CORE_FIXED_POINT.half / CORE_FIXED_POINT.identity);
    });

    it("given a different ability, when checking Multiscale, then returns 1.0x", () => {
      const mult = getMultiscaleMultiplier(abilityIds.intimidate, 200, 200);
      expect(mult).toBe(1);
    });
  });

  // ---- Fur Coat ----

  describe("Fur Coat", () => {
    it("given a physical move, when Fur Coat is active, then returns 2.0x defense multiplier", () => {
      // Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
      const mult = getFurCoatMultiplier(abilityIds.furCoat, true);
      expect(mult).toBe(2);
    });

    it("given a special move, when Fur Coat is active, then returns 1.0x", () => {
      const mult = getFurCoatMultiplier(abilityIds.furCoat, false);
      expect(mult).toBe(1);
    });
  });

  // ---- -ate abilities ----

  describe("-ate abilities", () => {
    it("given Pixilate and a Normal move, when checking type override, then returns Fairy + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- pixilate Gen 7+: chainModify([4915, 4096])
      // CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity = 1.1999...
      const result = getAteAbilityOverride(abilityIds.pixilate, typeIds.normal);
      expect(result).toEqual({ type: typeIds.fairy, multiplier: CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity });
    });

    it("given Aerilate and a Normal move, when checking type override, then returns Flying + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- aerilate Gen 7+: chainModify([4915, 4096])
      const result = getAteAbilityOverride(abilityIds.aerilate, typeIds.normal);
      expect(result).toEqual({ type: typeIds.flying, multiplier: CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity });
    });

    it("given Refrigerate and a Normal move, when checking type override, then returns Ice + 1.2x", () => {
      const result = getAteAbilityOverride(abilityIds.refrigerate, typeIds.normal);
      expect(result).toEqual({ type: typeIds.ice, multiplier: CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity });
    });

    it("given Galvanize and a Normal move, when checking type override, then returns Electric + 1.2x", () => {
      const result = getAteAbilityOverride(abilityIds.galvanize, typeIds.normal);
      expect(result).toEqual({ type: typeIds.electric, multiplier: CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity });
    });

    it("given Pixilate and a Fire move (non-Normal), when checking type override, then returns null", () => {
      // Source: -ate abilities only change Normal moves
      const result = getAteAbilityOverride(abilityIds.pixilate, typeIds.fire);
      expect(result).toBeNull();
    });

    it("given a non-ate ability and Normal move, when checking type override, then returns null", () => {
      const result = getAteAbilityOverride(abilityIds.intimidate, typeIds.normal);
      expect(result).toBeNull();
    });
  });

  // ---- Parental Bond ----

  describe("Parental Bond", () => {
    it("given Parental Bond and a powered move, when checking eligibility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: Gen 7+ secondHit 0.25
      expect(isParentalBondEligible(abilityIds.parentalBond, 50, null)).toBe(true);
    });

    it("given Parental Bond and a multi-hit move, when checking eligibility, then returns false", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: excluded for multi-hit
      expect(isParentalBondEligible(abilityIds.parentalBond, 50, "multi-hit")).toBe(false);
    });

    it("given Parental Bond and a zero-power move, when checking eligibility, then returns false", () => {
      expect(isParentalBondEligible(abilityIds.parentalBond, 0, null)).toBe(false);
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
      const mult = getGorillaTacticsMultiplier(abilityIds.gorillaTactics, moveCategories.physical);
      expect(mult).toBe(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity);
    });

    it("given a special move, when Gorilla Tactics is active, then returns 1.0x", () => {
      // Source: Showdown data/abilities.ts -- gorillatactics: only boosts physical Attack
      const mult = getGorillaTacticsMultiplier(abilityIds.gorillaTactics, moveCategories.special);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Gorilla Tactics user uses physical move, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.gorillaTactics,
        move: createCanonicalMove(moveIds.tackle),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Gorilla Tactics user uses special move, then returns activated:false", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.gorillaTactics,
        move: createCanonicalMove(moveIds.thunderbolt),
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
      const mult = getTransistorMultiplier(abilityIds.transistor, typeIds.electric);
      expect(mult).toBe(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity);
    });

    it("given a non-Electric move, when Transistor is active, then returns 1.0x", () => {
      const mult = getTransistorMultiplier(abilityIds.transistor, typeIds.fire);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Transistor user uses Thunderbolt, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.transistor,
        move: createCanonicalMove(moveIds.thunderbolt),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Transistor user uses Flamethrower, then returns activated:false", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.transistor,
        move: createCanonicalMove(moveIds.flamethrower),
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
      const mult = getDragonsMawMultiplier(regidragoAbilityId, typeIds.dragon);
      expect(mult).toBe(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity);
    });

    it("given a non-Dragon move, when Dragon's Maw is active, then returns 1.0x", () => {
      const mult = getDragonsMawMultiplier(regidragoAbilityId, typeIds.fire);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Dragon's Maw user uses Dragon Pulse, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: regidragoAbilityId,
        move: createCanonicalMove(moveIds.dragonPulse),
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
      const mult = getPunkRockMultiplier(abilityIds.punkRock, true);
      expect(mult).toBe(CORE_FIXED_POINT.boost13 / CORE_FIXED_POINT.identity);
    });

    it("given a non-sound move, when Punk Rock attacker checks outgoing multiplier, then returns 1.0x", () => {
      const mult = getPunkRockMultiplier(abilityIds.punkRock, false);
      expect(mult).toBe(1);
    });

    it("given a sound move, when Punk Rock defender checks incoming multiplier, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- punkrock: onSourceModifyDamage, chainModify(0.5)
      // Source: Bulbapedia "Punk Rock" -- "halves the damage taken from sound-based moves"
      const mult = getPunkRockIncomingMultiplier(abilityIds.punkRock, true);
      expect(mult).toBe(CORE_FIXED_POINT.half / CORE_FIXED_POINT.identity);
    });

    it("given a non-sound move, when Punk Rock defender checks incoming multiplier, then returns 1.0x", () => {
      const mult = getPunkRockIncomingMultiplier(abilityIds.punkRock, false);
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Punk Rock outgoing, then returns 1.0x", () => {
      const mult = getPunkRockMultiplier(abilityIds.intimidate, true);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Punk Rock user uses sound move, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.punkRock,
        move: createCanonicalMove(moveIds.hyperVoice),
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
      const mult = getIceScalesMultiplier(abilityIds.iceScales, moveCategories.special);
      expect(mult).toBe(CORE_FIXED_POINT.half / CORE_FIXED_POINT.identity);
    });

    it("given a physical move, when Ice Scales defender is active, then returns 1.0x", () => {
      const mult = getIceScalesMultiplier(abilityIds.iceScales, moveCategories.physical);
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Ice Scales for special move, then returns 1.0x", () => {
      const mult = getIceScalesMultiplier(abilityIds.thickFat, moveCategories.special);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Ice Scales defender is hit by special move, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.iceScales,
        move: createCanonicalMove(moveIds.thunderbolt),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Ice Scales defender is hit by physical move, then returns activated:false", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.iceScales,
        move: createCanonicalMove(moveIds.tackle),
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
      const mult = getSteelworkerMultiplier(abilityIds.steelworker, typeIds.steel);
      expect(mult).toBe(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity);
    });

    it("given a non-Steel move, when Steelworker is active, then returns 1.0x", () => {
      const mult = getSteelworkerMultiplier(abilityIds.steelworker, typeIds.fire);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Steelworker user uses Steel move, then returns activated:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.steelworker,
        move: createCanonicalMove(moveIds.ironHead),
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
      const capped = getSturdyDamageCap(abilityIds.sturdy, lethalDamage, maxHp, maxHp);
      expect(capped).toBe(maxHp - 1);
    });

    it("given Sturdy not at full HP and lethal damage, when checking cap, then does not cap", () => {
      const lethalDamage = 300;
      const currentHp = 150;
      const maxHp = 200;
      const capped = getSturdyDamageCap(abilityIds.sturdy, lethalDamage, currentHp, maxHp);
      expect(capped).toBe(lethalDamage);
    });

    it("given Sturdy at full HP and non-lethal damage, when checking cap, then does not cap", () => {
      const damage = 50;
      const hp = 200;
      const capped = getSturdyDamageCap(abilityIds.sturdy, damage, hp, hp);
      expect(capped).toBe(damage);
    });

    it("given Sturdy and an OHKO move, when checking block, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sturdy onTryHit
      const ohkoEffect: MoveEffect = { type: "ohko" };
      expect(sturdyBlocksOHKO(abilityIds.sturdy, ohkoEffect)).toBe(true);
    });

    it("given Sturdy and a non-OHKO move, when checking block, then returns false", () => {
      expect(sturdyBlocksOHKO(abilityIds.sturdy, null)).toBe(false);
    });

    it("given the immunity dispatcher, when Sturdy faces OHKO move, then returns movePrevented:true", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.sturdy,
        move: createSyntheticMoveFrom(createCanonicalMove(moveIds.tackle), {
          effect: { type: "ohko" },
        }),
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
        volatile: volatileIds.flinch,
        chance: 30,
      };
      expect(hasSheerForceEligibleEffect(effect)).toBe(true);
    });

    it("given null effect, when checking eligibility, then returns false", () => {
      expect(hasSheerForceEligibleEffect(null)).toBe(false);
    });
  });
});
