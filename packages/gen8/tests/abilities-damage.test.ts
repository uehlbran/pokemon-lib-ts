import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveEffect, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
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
      speciesId: overrides.speciesId ?? 1,
      nickname: overrides.nickname ?? null,
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
    volatileStatuses: new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
      ...overrides.flags,
    },
    effect: overrides.effect ?? null,
    description: "",
    generation: 8,
    critRatio: 0,
    hasCrashDamage: overrides.hasCrashDamage ?? false,
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
      types: overrides.types ?? ["normal"],
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
      // 5325 / 4096 = 1.2998046875
      const effect: MoveEffect = {
        type: "status-chance",
        status: "burn",
        chance: 10,
      };
      const mult = getSheerForceMultiplier("sheer-force", effect);
      expect(mult).toBe(5325 / 4096);
    });

    it("given a move without secondary effects, when Sheer Force is active, then returns 1.0x", () => {
      // Source: Showdown data/abilities.ts -- sheerforce: only boosts moves with secondaries
      const mult = getSheerForceMultiplier("sheer-force", null);
      expect(mult).toBe(1);
    });

    it("given Sheer Force and an eligible move, when checking Life Orb suppression, then returns true", () => {
      // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
      const effect: MoveEffect = {
        type: "status-chance",
        status: "paralysis",
        chance: 30,
      };
      expect(sheerForceSuppressesLifeOrb("sheer-force", effect)).toBe(true);
    });

    it("given non-Sheer-Force ability, when checking Life Orb suppression, then returns false", () => {
      const effect: MoveEffect = {
        type: "status-chance",
        status: "burn",
        chance: 10,
      };
      expect(sheerForceSuppressesLifeOrb("iron-fist", effect)).toBe(false);
    });

    it("given the dispatcher, when Sheer Force user uses eligible move, then returns activated:true", () => {
      // Source: Showdown data/abilities.ts -- sheerforce
      const ctx = makeCtx({
        ability: "sheer-force",
        move: makeMove({
          effect: { type: "status-chance", status: "burn", chance: 10 },
        }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Sheer Force user uses non-eligible move, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: "sheer-force",
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
      const mult = getToughClawsMultiplier("tough-claws", true);
      expect(mult).toBe(5325 / 4096);
    });

    it("given a non-contact move, when Tough Claws is active, then returns 1.0x", () => {
      const mult = getToughClawsMultiplier("tough-claws", false);
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Tough Claws for contact move, then returns 1.0x", () => {
      const mult = getToughClawsMultiplier("iron-fist", true);
      expect(mult).toBe(1);
    });
  });

  // ---- Strong Jaw ----

  describe("Strong Jaw", () => {
    it("given a bite move, when Strong Jaw is active, then returns 1.5x", () => {
      // Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
      const mult = getStrongJawMultiplier("strong-jaw", true);
      expect(mult).toBe(1.5);
    });

    it("given a non-bite move, when Strong Jaw is active, then returns 1.0x", () => {
      const mult = getStrongJawMultiplier("strong-jaw", false);
      expect(mult).toBe(1);
    });
  });

  // ---- Mega Launcher ----

  describe("Mega Launcher", () => {
    it("given a pulse move, when Mega Launcher is active, then returns 1.5x", () => {
      // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
      const mult = getMegaLauncherMultiplier("mega-launcher", true);
      expect(mult).toBe(1.5);
    });

    it("given a non-pulse move, when Mega Launcher is active, then returns 1.0x", () => {
      const mult = getMegaLauncherMultiplier("mega-launcher", false);
      expect(mult).toBe(1);
    });
  });

  // ---- Multiscale ----

  describe("Multiscale", () => {
    it("given full HP, when Multiscale is active, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- multiscale: at full HP, halve damage
      const mult = getMultiscaleMultiplier("multiscale", 200, 200);
      expect(mult).toBe(0.5);
    });

    it("given less than full HP, when Multiscale is active, then returns 1.0x", () => {
      const mult = getMultiscaleMultiplier("multiscale", 199, 200);
      expect(mult).toBe(1);
    });

    it("given Shadow Shield at full HP, when checking multiplier, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- shadowshield: same as multiscale
      const mult = getMultiscaleMultiplier("shadow-shield", 300, 300);
      expect(mult).toBe(0.5);
    });

    it("given a different ability, when checking Multiscale, then returns 1.0x", () => {
      const mult = getMultiscaleMultiplier("intimidate", 200, 200);
      expect(mult).toBe(1);
    });
  });

  // ---- Fur Coat ----

  describe("Fur Coat", () => {
    it("given a physical move, when Fur Coat is active, then returns 2.0x defense multiplier", () => {
      // Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
      const mult = getFurCoatMultiplier("fur-coat", true);
      expect(mult).toBe(2);
    });

    it("given a special move, when Fur Coat is active, then returns 1.0x", () => {
      const mult = getFurCoatMultiplier("fur-coat", false);
      expect(mult).toBe(1);
    });
  });

  // ---- -ate abilities ----

  describe("-ate abilities", () => {
    it("given Pixilate and a Normal move, when checking type override, then returns Fairy + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- pixilate Gen 7+: chainModify([4915, 4096])
      // 4915 / 4096 = 1.1999...
      const result = getAteAbilityOverride("pixilate", "normal");
      expect(result).toEqual({ type: "fairy", multiplier: 4915 / 4096 });
    });

    it("given Aerilate and a Normal move, when checking type override, then returns Flying + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- aerilate Gen 7+: chainModify([4915, 4096])
      const result = getAteAbilityOverride("aerilate", "normal");
      expect(result).toEqual({ type: "flying", multiplier: 4915 / 4096 });
    });

    it("given Refrigerate and a Normal move, when checking type override, then returns Ice + 1.2x", () => {
      const result = getAteAbilityOverride("refrigerate", "normal");
      expect(result).toEqual({ type: "ice", multiplier: 4915 / 4096 });
    });

    it("given Galvanize and a Normal move, when checking type override, then returns Electric + 1.2x", () => {
      const result = getAteAbilityOverride("galvanize", "normal");
      expect(result).toEqual({ type: "electric", multiplier: 4915 / 4096 });
    });

    it("given Pixilate and a Fire move (non-Normal), when checking type override, then returns null", () => {
      // Source: -ate abilities only change Normal moves
      const result = getAteAbilityOverride("pixilate", "fire");
      expect(result).toBeNull();
    });

    it("given a non-ate ability and Normal move, when checking type override, then returns null", () => {
      const result = getAteAbilityOverride("intimidate", "normal");
      expect(result).toBeNull();
    });
  });

  // ---- Parental Bond ----

  describe("Parental Bond", () => {
    it("given Parental Bond and a powered move, when checking eligibility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: Gen 7+ secondHit 0.25
      expect(isParentalBondEligible("parental-bond", 50, null)).toBe(true);
    });

    it("given Parental Bond and a multi-hit move, when checking eligibility, then returns false", () => {
      // Source: Showdown data/abilities.ts -- parentalbond: excluded for multi-hit
      expect(isParentalBondEligible("parental-bond", 50, "multi-hit")).toBe(false);
    });

    it("given Parental Bond and a zero-power move, when checking eligibility, then returns false", () => {
      expect(isParentalBondEligible("parental-bond", 0, null)).toBe(false);
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
      // 6144 / 4096 = 1.5
      const mult = getGorillaTacticsMultiplier("gorilla-tactics", "physical");
      expect(mult).toBe(6144 / 4096);
    });

    it("given a special move, when Gorilla Tactics is active, then returns 1.0x", () => {
      // Source: Showdown data/abilities.ts -- gorillatactics: only boosts physical Attack
      const mult = getGorillaTacticsMultiplier("gorilla-tactics", "special");
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Gorilla Tactics user uses physical move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "gorilla-tactics",
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Gorilla Tactics user uses special move, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: "gorilla-tactics",
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
      const mult = getTransistorMultiplier("transistor", "electric");
      expect(mult).toBe(6144 / 4096);
    });

    it("given a non-Electric move, when Transistor is active, then returns 1.0x", () => {
      const mult = getTransistorMultiplier("transistor", "fire");
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Transistor user uses Thunderbolt, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "transistor",
        move: makeMove({ type: "electric", id: "thunderbolt" }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Transistor user uses Flamethrower, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: "transistor",
        move: makeMove({ type: "fire", id: "flamethrower" }),
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
      const mult = getDragonsMawMultiplier("dragons-maw", "dragon");
      expect(mult).toBe(6144 / 4096);
    });

    it("given a non-Dragon move, when Dragon's Maw is active, then returns 1.0x", () => {
      const mult = getDragonsMawMultiplier("dragons-maw", "fire");
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Dragon's Maw user uses Dragon Pulse, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "dragons-maw",
        move: makeMove({ type: "dragon", id: "dragon-pulse" }),
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
      const mult = getPunkRockMultiplier("punk-rock", true);
      expect(mult).toBe(5325 / 4096);
    });

    it("given a non-sound move, when Punk Rock attacker checks outgoing multiplier, then returns 1.0x", () => {
      const mult = getPunkRockMultiplier("punk-rock", false);
      expect(mult).toBe(1);
    });

    it("given a sound move, when Punk Rock defender checks incoming multiplier, then returns 0.5x", () => {
      // Source: Showdown data/abilities.ts -- punkrock: onSourceModifyDamage, chainModify(0.5)
      // Source: Bulbapedia "Punk Rock" -- "halves the damage taken from sound-based moves"
      const mult = getPunkRockIncomingMultiplier("punk-rock", true);
      expect(mult).toBe(0.5);
    });

    it("given a non-sound move, when Punk Rock defender checks incoming multiplier, then returns 1.0x", () => {
      const mult = getPunkRockIncomingMultiplier("punk-rock", false);
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Punk Rock outgoing, then returns 1.0x", () => {
      const mult = getPunkRockMultiplier("intimidate", true);
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Punk Rock user uses sound move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "punk-rock",
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
      const mult = getIceScalesMultiplier("ice-scales", "special");
      expect(mult).toBe(0.5);
    });

    it("given a physical move, when Ice Scales defender is active, then returns 1.0x", () => {
      const mult = getIceScalesMultiplier("ice-scales", "physical");
      expect(mult).toBe(1);
    });

    it("given a different ability, when checking Ice Scales for special move, then returns 1.0x", () => {
      const mult = getIceScalesMultiplier("thick-fat", "special");
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Ice Scales defender is hit by special move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "ice-scales",
        move: makeMove({ category: "special" }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });

    it("given the dispatcher, when Ice Scales defender is hit by physical move, then returns activated:false", () => {
      const ctx = makeCtx({
        ability: "ice-scales",
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
      const mult = getSteelworkerMultiplier("steelworker", "steel");
      expect(mult).toBe(6144 / 4096);
    });

    it("given a non-Steel move, when Steelworker is active, then returns 1.0x", () => {
      const mult = getSteelworkerMultiplier("steelworker", "fire");
      expect(mult).toBe(1);
    });

    it("given the dispatcher, when Steelworker user uses Steel move, then returns activated:true", () => {
      const ctx = makeCtx({
        ability: "steelworker",
        move: makeMove({ type: "steel", id: "iron-head" }),
      });
      const result = handleGen8DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
    });
  });

  // ---- Sturdy / Wonder Guard ----

  describe("Sturdy", () => {
    it("given Sturdy at full HP and lethal damage, when checking cap, then caps at maxHp - 1", () => {
      // Source: Showdown data/abilities.ts -- sturdy onDamage (priority -30)
      const capped = getSturdyDamageCap("sturdy", 300, 200, 200);
      expect(capped).toBe(199);
    });

    it("given Sturdy not at full HP and lethal damage, when checking cap, then does not cap", () => {
      const capped = getSturdyDamageCap("sturdy", 300, 150, 200);
      expect(capped).toBe(300);
    });

    it("given Sturdy at full HP and non-lethal damage, when checking cap, then does not cap", () => {
      const capped = getSturdyDamageCap("sturdy", 50, 200, 200);
      expect(capped).toBe(50);
    });

    it("given Sturdy and an OHKO move, when checking block, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sturdy onTryHit
      const ohkoEffect: MoveEffect = { type: "ohko" };
      expect(sturdyBlocksOHKO("sturdy", ohkoEffect)).toBe(true);
    });

    it("given Sturdy and a non-OHKO move, when checking block, then returns false", () => {
      expect(sturdyBlocksOHKO("sturdy", null)).toBe(false);
    });

    it("given the immunity dispatcher, when Sturdy faces OHKO move, then returns movePrevented:true", () => {
      const ctx = makeCtx({
        ability: "sturdy",
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
        volatile: "flinch",
        chance: 30,
      };
      expect(hasSheerForceEligibleEffect(effect)).toBe(true);
    });

    it("given null effect, when checking eligibility, then returns false", () => {
      expect(hasSheerForceEligibleEffect(null)).toBe(false);
    });
  });
});
