import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MECHANIC_MULTIPLIERS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  type MoveData,
  type MoveEffect,
  type PokemonType,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
} from "../src";
import {
  getAteAbilityOverride,
  getFurCoatMultiplier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getSheerForceMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getToughClawsMultiplier,
  handleGen7DamageCalcAbility,
  handleGen7DamageImmunityAbility,
  isParentalBondEligible,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "../src/Gen7AbilitiesDamage";

const dataManager = createGen7DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const speciesIds = GEN7_SPECIES_IDS;
const moveIds = { ...CORE_MOVE_IDS, ...GEN7_MOVE_IDS } as const;
const statusIds = CORE_STATUS_IDS;
const typeIds = CORE_TYPE_IDS;
const triggerIds = CORE_ABILITY_TRIGGER_IDS;
const defaultNature = GEN7_NATURE_IDS.hardy;
const defaultPokeBall = GEN7_ITEM_IDS.pokeBall;

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

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
      speciesId: overrides.speciesId ?? speciesIds.bulbasaur,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: defaultNature,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? abilityIds.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: CORE_GENDERS.male as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: defaultPokeBall,
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
    types: overrides.types ?? [typeIds.normal],
    ability: overrides.ability ?? abilityIds.none,
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

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData> = {}): MoveData {
  return {
    ...baseMove,
    ...overrides,
    flags: {
      ...baseMove.flags,
      ...overrides.flags,
    },
    hasCrashDamage: overrides.hasCrashDamage ?? false,
  } as MoveData;
}

function createBattleState(overrides?: {
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
    generation: 7,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function createAbilityContext(overrides: {
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
    pokemon: createOnFieldPokemon({
      ability: overrides.ability,
      currentHp: overrides.currentHp ?? hp,
      hp,
      status: overrides.status ?? null,
      types: overrides.types ?? [typeIds.normal],
      nickname: overrides.nickname ?? null,
    }),
    opponent: overrides.opponent ?? createOnFieldPokemon({}),
    state: createBattleState(
      overrides.weather ? { weather: { type: overrides.weather, turnsLeft: 5, source: "" } } : {},
    ),
    rng: new SeededRandom(42),
    trigger: triggerIds.onDamageCalc,
    move: overrides.move,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 7 Damage Abilities", () => {
  // ---- Tough Claws ----

  describe("Tough Claws", () => {
    it("given a contact move, when Tough Claws is active, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- toughclaws: move.flags.contact
      const ctx = createAbilityContext({
        ability: abilityIds.toughClaws,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given a non-contact move, when Tough Claws is active, then returns activated:false", () => {
      // Source: Showdown data/abilities.ts -- toughclaws: only contact moves
      const ctx = createAbilityContext({
        ability: abilityIds.toughClaws,
        move: dataManager.getMove(moveIds.flamethrower),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });

    it("given Tough Claws multiplier helper, when contact move, then returns 5325/4096 (~1.3x)", () => {
      // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
      // 5325 / 4096 = 1.2998046875
      const mult = getToughClawsMultiplier(abilityIds.toughClaws, true);
      expect(mult).toBe(5325 / 4096);
    });

    it("given Tough Claws multiplier helper, when non-contact, then returns 1", () => {
      const mult = getToughClawsMultiplier(abilityIds.toughClaws, false);
      expect(mult).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
    });
  });

  // ---- Multiscale / Shadow Shield ----

  describe("Multiscale", () => {
    it("given full HP, when Multiscale is active, then returns activated:true with damage-reduction", () => {
      // Source: Showdown data/abilities.ts -- multiscale: at full HP, halve damage
      const ctx = createAbilityContext({
        ability: abilityIds.multiscale,
        currentHp: 200,
        maxHp: 200,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0].effectType).toBe("damage-reduction");
    });

    it("given HP below max, when Multiscale is active, then returns activated:false", () => {
      // Source: Showdown data/abilities.ts -- multiscale: only at full HP
      const ctx = createAbilityContext({
        ability: abilityIds.multiscale,
        currentHp: 150,
        maxHp: 200,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });

    it("given Multiscale multiplier helper at full HP, then returns 0.5", () => {
      // Source: Showdown data/abilities.ts -- multiscale: chainModify(0.5) at full HP
      const mult = getMultiscaleMultiplier(abilityIds.multiscale, 200, 200);
      expect(mult).toBe(0.5);
    });

    it("given Multiscale multiplier helper below full HP, then returns 1", () => {
      const mult = getMultiscaleMultiplier(abilityIds.multiscale, 150, 200);
      expect(mult).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
    });
  });

  describe("Shadow Shield", () => {
    it("given full HP, when Shadow Shield is active, then returns activated:true", () => {
      // Shadow Shield is new in Gen 7 (Lunala). Same effect as Multiscale.
      // Source: Showdown data/abilities.ts -- shadowshield: same as multiscale
      // Source: Bulbapedia "Shadow Shield" -- "same as Multiscale"
      const ctx = createAbilityContext({
        ability: abilityIds.shadowShield,
        currentHp: 200,
        maxHp: 200,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toContain("Shadow Shield");
    });

    it("given Shadow Shield multiplier helper at full HP, then returns 0.5", () => {
      // Source: Showdown data/abilities.ts -- shadowshield: same multiplier as multiscale
      const mult = getMultiscaleMultiplier(abilityIds.shadowShield, 200, 200);
      expect(mult).toBe(0.5);
    });
  });

  // ---- Solid Rock / Filter ----

  describe("Solid Rock / Filter", () => {
    it("given Solid Rock ability, when triggered, then returns activated:true with damage-reduction", () => {
      // Source: Showdown data/abilities.ts -- solidrock: 0.75x super-effective damage
      const ctx = createAbilityContext({
        ability: abilityIds.solidRock,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0].effectType).toBe("damage-reduction");
    });

    it("given Filter ability, when triggered, then returns activated:true with damage-reduction", () => {
      // Source: Showdown data/abilities.ts -- filter: same as solidrock
      const ctx = createAbilityContext({
        ability: abilityIds.filter,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Prism Armor (NEW Gen 7) ----

  describe("Prism Armor", () => {
    it("given Prism Armor ability, when triggered, then returns activated:true with damage-reduction", () => {
      // Prism Armor: new in Gen 7 (Necrozma). 0.75x super-effective damage.
      // Source: Showdown data/abilities.ts -- prismarmor: same as solidrock/filter
      // Source: Bulbapedia "Prism Armor" -- "reduces super-effective damage by 25%"
      const ctx = createAbilityContext({
        ability: abilityIds.prismArmor,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0].effectType).toBe("damage-reduction");
      expect(result.messages[0]).toContain("Prism Armor");
    });

    it("given Prism Armor, then it has a distinct message from Solid Rock/Filter", () => {
      // Source: Showdown -- Prism Armor has its own message
      const ctx = createAbilityContext({
        ability: abilityIds.prismArmor,
        nickname: "Necrozma",
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.messages[0]).toBe("Necrozma's Prism Armor weakened the attack!");
    });
  });

  // ---- Sheer Force ----

  describe("Sheer Force", () => {
    it("given a move with status-chance effect, when Sheer Force is active, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- sheerforce: boosts moves with secondary effects
      const statusChanceEffect: MoveEffect = {
        type: "status-chance",
        status: statusIds.burn,
        chance: 30,
      };
      const ctx = createAbilityContext({
        ability: abilityIds.sheerForce,
        move: createSyntheticMoveFrom(dataManager.getMove(moveIds.flamethrower), {
          effect: statusChanceEffect,
        }),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given a move without secondary effects, when Sheer Force is active, then returns activated:false", () => {
      // Source: Showdown data/abilities.ts -- sheerforce: only secondary-effect moves
      const ctx = createAbilityContext({
        ability: abilityIds.sheerForce,
        move: createSyntheticMoveFrom(dataManager.getMove(moveIds.tackle), { effect: null }),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });

    it("given Sheer Force multiplier helper with secondary-effect move, then returns 5325/4096 (~1.3x)", () => {
      // Source: Showdown data/abilities.ts -- sheerforce: chainModify([5325, 4096])
      const effect: MoveEffect = { type: "status-chance", status: statusIds.burn, chance: 30 };
      const mult = getSheerForceMultiplier(abilityIds.sheerForce, effect);
      expect(mult).toBe(5325 / 4096);
    });

    it("given Sheer Force with Tri-Attack (whitelist move), then returns 5325/4096", () => {
      // Tri-Attack is on the Sheer Force whitelist because its secondary
      // is implemented as an onHit function in Showdown.
      // Source: Showdown data/moves.ts -- triattack: secondary.onHit
      const mult = getSheerForceMultiplier(abilityIds.sheerForce, null, moveIds.triAttack);
      expect(mult).toBe(5325 / 4096);
    });

    it("given Sheer Force with secondary-effect move, then suppresses Life Orb recoil", () => {
      // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
      const effect: MoveEffect = { type: "status-chance", status: statusIds.burn, chance: 10 };
      expect(sheerForceSuppressesLifeOrb(abilityIds.sheerForce, effect)).toBe(true);
    });
  });

  // ---- Fur Coat ----

  describe("Fur Coat", () => {
    it("given a physical move, when Fur Coat is active, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- furcoat: physical only
      const ctx = createAbilityContext({
        ability: abilityIds.furCoat,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0].effectType).toBe("damage-reduction");
    });

    it("given a special move, when Fur Coat is active, then returns activated:false", () => {
      // Source: Showdown data/abilities.ts -- furcoat: physical only
      const ctx = createAbilityContext({
        ability: abilityIds.furCoat,
        move: dataManager.getMove(moveIds.flamethrower),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });

    it("given Fur Coat multiplier helper with physical move, then returns 2.0", () => {
      // Source: Showdown data/abilities.ts -- furcoat: chainModify(2) for physical Defense
      // This means the defense is DOUBLED, effectively halving physical damage.
      const mult = getFurCoatMultiplier(abilityIds.furCoat, true);
      expect(mult).toBe(2);
    });

    it("given Fur Coat multiplier helper with special move, then returns 1.0", () => {
      const mult = getFurCoatMultiplier(abilityIds.furCoat, false);
      expect(mult).toBe(CORE_MECHANIC_MULTIPLIERS.neutral);
    });
  });

  // ---- Strong Jaw ----

  describe("Strong Jaw", () => {
    it("given a bite move, when Strong Jaw is active, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- strongjaw: move.flags.bite
      const ctx = createAbilityContext({
        ability: abilityIds.strongJaw,
        move: dataManager.getMove(moveIds.crunch),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given Strong Jaw multiplier helper with bite move, then returns 1.5", () => {
      // Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
      const mult = getStrongJawMultiplier(abilityIds.strongJaw, true);
      expect(mult).toBe(CORE_MECHANIC_MULTIPLIERS.stab);
    });
  });

  // ---- Mega Launcher ----

  describe("Mega Launcher", () => {
    it("given a pulse move, when Mega Launcher is active, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- megalauncher: move.flags.pulse
      const ctx = createAbilityContext({
        ability: abilityIds.megaLauncher,
        move: dataManager.getMove(moveIds.auraSphere),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given Mega Launcher multiplier helper with pulse move, then returns 1.5", () => {
      // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
      const mult = getMegaLauncherMultiplier(abilityIds.megaLauncher, true);
      expect(mult).toBe(CORE_MECHANIC_MULTIPLIERS.stab);
    });
  });

  // ---- -ate Abilities (Gen 7 nerf: 1.2x) ----

  describe("-ate Abilities (Gen 7: 1.2x)", () => {
    it("given Pixilate with Normal-type move, then returns type-change to fairy", () => {
      // Source: Showdown data/abilities.ts -- pixilate: Normal -> Fairy
      const ctx = createAbilityContext({
        ability: abilityIds.pixilate,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0].effectType).toBe("type-change");
      if (result.effects[0].effectType === "type-change") {
        expect(result.effects[0].types).toEqual([typeIds.fairy]);
      }
    });

    it("given getAteAbilityOverride for Pixilate in Gen 7, then multiplier is 4915/4096 (~1.2x)", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 pixilate: chainModify([4915, 4096])
      // 4915 / 4096 = 1.19995117... (the Gen 7 nerf from 1.3x)
      const override = getAteAbilityOverride(abilityIds.pixilate, typeIds.normal);
      expect(override).not.toBeNull();
      expect(override!.type).toBe(typeIds.fairy);
      expect(override!.multiplier).toBe(4915 / 4096);
    });

    it("given getAteAbilityOverride for Galvanize (new Gen 7), then Normal -> Electric + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- galvanize: Normal -> Electric + 1.2x
      // Source: Bulbapedia "Galvanize" -- introduced in Gen 7
      const override = getAteAbilityOverride(abilityIds.galvanize, typeIds.normal);
      expect(override).not.toBeNull();
      expect(override!.type).toBe(typeIds.electric);
      expect(override!.multiplier).toBe(4915 / 4096);
    });

    it("given getAteAbilityOverride with non-Normal move, then returns null", () => {
      // -ate abilities only convert Normal-type moves
      const override = getAteAbilityOverride(abilityIds.pixilate, typeIds.fire);
      expect(override).toBeNull();
    });

    it("given getAteAbilityOverride for Aerilate, then Normal -> Flying + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 aerilate: Normal -> Flying
      const override = getAteAbilityOverride(abilityIds.aerilate, typeIds.normal);
      expect(override!.type).toBe(typeIds.flying);
      expect(override!.multiplier).toBe(4915 / 4096);
    });

    it("given getAteAbilityOverride for Refrigerate, then Normal -> Ice + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 refrigerate: Normal -> Ice
      const override = getAteAbilityOverride(abilityIds.refrigerate, typeIds.normal);
      expect(override!.type).toBe(typeIds.ice);
      expect(override!.multiplier).toBe(4915 / 4096);
    });
  });

  // ---- Parental Bond (Gen 7 nerf: 0.25x second hit) ----

  describe("Parental Bond", () => {
    it("given Gen 7 Parental Bond second-hit multiplier, then it is 0.25 (not 0.5)", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 parentalbond: secondHit 0.25
      // Source: Bulbapedia "Parental Bond" -- "nerfed from 50% to 25% in Gen 7"
      expect(PARENTAL_BOND_SECOND_HIT_MULTIPLIER).toBe(0.25);
    });

    it("given Parental Bond with a powered move, then isParentalBondEligible returns true", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: damaging moves
      expect(isParentalBondEligible(abilityIds.parentalBond, 100, null)).toBe(true);
    });

    it("given Parental Bond with a multi-hit move, then isParentalBondEligible returns false", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: not multi-hit
      expect(isParentalBondEligible(abilityIds.parentalBond, 100, "multi-hit")).toBe(false);
    });

    it("given Parental Bond handler with a powered move, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: damaging moves
      const ctx = createAbilityContext({
        ability: abilityIds.parentalBond,
        move: dataManager.getMove(moveIds.strength),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Sturdy ----

  describe("Sturdy", () => {
    it("given an OHKO move, when Sturdy blocks it, then returns movePrevented:true", () => {
      // Source: Showdown data/abilities.ts -- sturdy: blocks OHKO moves
      const ohkoEffect: MoveEffect = { type: "ohko" };
      const ctx = createAbilityContext({
        ability: abilityIds.sturdy,
        move: createSyntheticMoveFrom(dataManager.getMove(moveIds.fissure), { effect: ohkoEffect }),
      });
      const result = handleGen7DamageImmunityAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.movePrevented).toBe(true);
    });

    it("given Sturdy damage cap helper at full HP with lethal damage, then returns maxHp - 1", () => {
      // Source: Showdown data/abilities.ts -- sturdy: cap at 1 HP from full
      const capped = getSturdyDamageCap(abilityIds.sturdy, 300, 200, 200);
      expect(capped).toBe(199);
    });

    it("given Sturdy damage cap helper below full HP, then returns unmodified damage", () => {
      // Source: Showdown data/abilities.ts -- sturdy: only at full HP
      const capped = getSturdyDamageCap(abilityIds.sturdy, 300, 150, 200);
      expect(capped).toBe(300);
    });

    it("given sturdyBlocksOHKO with OHKO effect, then returns true", () => {
      const ohkoEffect: MoveEffect = { type: "ohko" };
      expect(sturdyBlocksOHKO(abilityIds.sturdy, ohkoEffect)).toBe(true);
    });

    it("given sturdyBlocksOHKO with non-OHKO effect, then returns false", () => {
      const normalEffect: MoveEffect = { type: "recoil", recoilPercent: 25 };
      expect(sturdyBlocksOHKO(abilityIds.sturdy, normalEffect)).toBe(false);
    });
  });

  // ---- Sniper ----

  describe("Sniper", () => {
    it("given Sniper ability, when triggered, then always returns activated:true", () => {
      // Sniper just signals activation; damage calc handles the 2.25x multiplier
      // Source: Showdown data/abilities.ts -- sniper: crit 1.5x * 1.5x = 2.25x
      const ctx = createAbilityContext({ ability: abilityIds.sniper });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Tinted Lens ----

  describe("Tinted Lens", () => {
    it("given Tinted Lens ability, when triggered, then always returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- tintedlens: NVE moves deal 2x
      const ctx = createAbilityContext({ ability: abilityIds.tintedLens });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Iron Fist ----

  describe("Iron Fist", () => {
    it("given a punch move, when Iron Fist is active, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- ironfist: move.flags.punch
      const ctx = createAbilityContext({
        ability: abilityIds.ironFist,
        move: dataManager.getMove(moveIds.thunderPunch),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given a non-punch move, when Iron Fist is active, then returns activated:false", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.ironFist,
        move: dataManager.getMove(moveIds.tackle),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Reckless ----

  describe("Reckless", () => {
    it("given a recoil move, when Reckless is active, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- reckless: move has recoil
      const recoilEffect: MoveEffect = { type: "recoil", recoilPercent: 33 };
      const ctx = createAbilityContext({
        ability: abilityIds.reckless,
        move: createSyntheticMoveFrom(dataManager.getMove(moveIds.doubleEdge), {
          effect: recoilEffect,
        }),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given a non-recoil move, when Reckless is active, then returns activated:false", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.reckless,
        move: createSyntheticMoveFrom(dataManager.getMove(moveIds.tackle), { effect: null }),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // ---- Analytic ----

  describe("Analytic", () => {
    it("given opponent has already moved, when Analytic is active, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- analytic: if target already moved
      const ctx = createAbilityContext({
        ability: abilityIds.analytic,
        move: dataManager.getMove(moveIds.tackle),
        opponent: createOnFieldPokemon({ movedThisTurn: true }),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given opponent has not moved yet, when Analytic is active, then returns activated:false", () => {
      const ctx = createAbilityContext({
        ability: abilityIds.analytic,
        move: dataManager.getMove(moveIds.tackle),
        opponent: createOnFieldPokemon({ movedThisTurn: false }),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });
});
