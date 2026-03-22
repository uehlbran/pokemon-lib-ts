import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getAteAbilityOverride,
  handleGen7DamageCalcAbility,
  PARENTAL_BOND_SECOND_HIT_MULTIPLIER,
} from "../src/Gen7AbilitiesDamage";
import {
  getTriagePriorityBonus,
  handleGen7StatAbility,
  isGaleWingsActive,
  isPranksterBlockedByDarkType,
} from "../src/Gen7AbilitiesStat";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as abilities-damage.test.ts)
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
  turnsOnField?: number;
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
    turnsOnField: overrides.turnsOnField ?? 0,
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
    generation: 7,
    critRatio: 0,
    hasCrashDamage: false,
  } as MoveData;
}

function makeState(): BattleState {
  return {
    weather: null,
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

function makeCtx(overrides: {
  ability: string;
  trigger:
    | "on-damage-calc"
    | "on-priority-check"
    | "on-after-move-used"
    | "on-damage-taken"
    | "on-turn-end"
    | "on-flinch"
    | "on-stat-change";
  move?: MoveData;
  currentHp?: number;
  maxHp?: number;
  types?: PokemonType[];
  nickname?: string | null;
  opponent?: ActivePokemon;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  turnsOnField?: number;
}): AbilityContext {
  const hp = overrides.maxHp ?? 200;
  return {
    pokemon: makeActive({
      ability: overrides.ability,
      currentHp: overrides.currentHp ?? hp,
      hp: hp,
      types: overrides.types ?? ["normal"],
      nickname: overrides.nickname ?? null,
      attack: overrides.attack,
      defense: overrides.defense,
      spAttack: overrides.spAttack,
      spDefense: overrides.spDefense,
      speed: overrides.speed,
      turnsOnField: overrides.turnsOnField,
    }),
    opponent: overrides.opponent ?? makeActive({}),
    state: makeState(),
    rng: new SeededRandom(42),
    trigger: overrides.trigger,
    move: overrides.move,
  };
}

// ===========================================================================
// Gen 7 Ability Nerfs -- tests that verify Gen 7-specific changes from Gen 6
// ===========================================================================

describe("Gen 7 Ability Nerfs", () => {
  // -----------------------------------------------------------------------
  // Pixilate / -ate nerf: 1.2x (was 1.3x in Gen 6)
  // -----------------------------------------------------------------------

  describe("-ate Abilities: 1.2x nerf (was 1.3x in Gen 6)", () => {
    it("given Pixilate in Gen 7, when converting Normal move, then multiplier is 4915/4096 (~1.2x), not 5325/4096 (~1.3x)", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 pixilate: chainModify([4915, 4096])
      // Source: Showdown data/mods/gen6/abilities.ts -- Gen 6 pixilate: chainModify([5325, 4096])
      // Source: Bulbapedia "Pixilate" -- "From Generation VII onward, the power bonus was reduced from 1.3x to 1.2x."
      const override = getAteAbilityOverride("pixilate", "normal");
      expect(override).not.toBeNull();
      expect(override!.multiplier).toBe(4915 / 4096);
      // Verify it is NOT the Gen 6 value
      expect(override!.multiplier).not.toBe(5325 / 4096);
    });

    it("given Aerilate in Gen 7, when converting Normal move, then multiplier is 4915/4096 (~1.2x)", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 aerilate: same as pixilate
      const override = getAteAbilityOverride("aerilate", "normal");
      expect(override).not.toBeNull();
      expect(override!.multiplier).toBe(4915 / 4096);
    });

    it("given Refrigerate in Gen 7, when converting Normal move, then multiplier is 4915/4096 (~1.2x)", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 refrigerate: same as pixilate
      const override = getAteAbilityOverride("refrigerate", "normal");
      expect(override).not.toBeNull();
      expect(override!.multiplier).toBe(4915 / 4096);
    });

    it("given Galvanize (new Gen 7), when converting Normal move, then multiplier is 4915/4096 (~1.2x)", () => {
      // Source: Showdown data/abilities.ts -- galvanize: Normal -> Electric, chainModify([4915, 4096])
      // Source: Bulbapedia "Galvanize" -- "introduced in Gen 7, 1.2x power bonus"
      const override = getAteAbilityOverride("galvanize", "normal");
      expect(override).not.toBeNull();
      expect(override!.type).toBe("electric");
      expect(override!.multiplier).toBe(4915 / 4096);
    });

    it("given Pixilate handler with Normal move, when on-damage-calc triggers, then activated:true with type-change to fairy", () => {
      // Source: Showdown data/abilities.ts -- pixilate: Normal -> Fairy
      const ctx = makeCtx({
        ability: "pixilate",
        trigger: "on-damage-calc",
        move: makeMove({ type: "normal" }),
      });
      const result = handleGen7DamageCalcAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0].effectType).toBe("type-change");
      if (result.effects[0].effectType === "type-change") {
        expect(result.effects[0].types).toEqual(["fairy"]);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Parental Bond nerf: 0.25x second hit (was 0.5x in Gen 6)
  // -----------------------------------------------------------------------

  describe("Parental Bond: 0.25x second hit (was 0.5x in Gen 6)", () => {
    it("given Gen 7 Parental Bond, then second-hit multiplier constant is 0.25", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 parentalbond: secondHit 0.25
      // Source: Bulbapedia "Parental Bond" -- "nerfed from 50% to 25% in Generation VII"
      expect(PARENTAL_BOND_SECOND_HIT_MULTIPLIER).toBe(0.25);
    });

    it("given Gen 7 Parental Bond, then second-hit multiplier is NOT 0.5 (Gen 6 value)", () => {
      // Source: Showdown data/mods/gen6/abilities.ts -- Gen 6 parentalbond: secondHit 0.5
      expect(PARENTAL_BOND_SECOND_HIT_MULTIPLIER).not.toBe(0.5);
    });

    it("given Gen 7 Parental Bond, then second hit deals exactly 25% of the first hit", () => {
      // Source: Showdown data/abilities.ts -- Gen 7 parentalbond
      // For a first hit dealing 100 damage, the second hit is 25.
      const firstHitDamage = 100;
      const secondHitDamage = Math.floor(firstHitDamage * PARENTAL_BOND_SECOND_HIT_MULTIPLIER);
      expect(secondHitDamage).toBe(25);
    });
  });

  // -----------------------------------------------------------------------
  // Prankster: fails vs Dark-type (NEW in Gen 7)
  // -----------------------------------------------------------------------

  describe("Prankster: status moves fail vs Dark-type target (new in Gen 7)", () => {
    it("given Prankster user using a status move vs Dark-type, then isPranksterBlockedByDarkType returns true", () => {
      // Source: Showdown data/abilities.ts -- Prankster Gen 7: dark targets immune to boosted status
      // Source: Bulbapedia "Prankster" Gen 7 -- "status moves fail against Dark-type targets"
      expect(isPranksterBlockedByDarkType("prankster", "status", ["dark"])).toBe(true);
    });

    it("given Prankster user using a status move vs Dark/Fairy-type, then blocked (partial Dark typing)", () => {
      // Source: Showdown data/abilities.ts -- checks if target has Dark type
      expect(isPranksterBlockedByDarkType("prankster", "status", ["dark", "fairy"])).toBe(true);
    });

    it("given Prankster user using a physical move vs Dark-type, then NOT blocked (non-status)", () => {
      // Source: Showdown data/abilities.ts -- only status moves are blocked
      expect(isPranksterBlockedByDarkType("prankster", "physical", ["dark"])).toBe(false);
    });

    it("given Prankster user using a special move vs Dark-type, then NOT blocked (non-status)", () => {
      // Source: Showdown data/abilities.ts -- only status moves are blocked
      expect(isPranksterBlockedByDarkType("prankster", "special", ["dark"])).toBe(false);
    });

    it("given Prankster user using a status move vs Normal-type, then NOT blocked (non-Dark)", () => {
      // Source: Showdown data/abilities.ts -- only Dark-type targets
      expect(isPranksterBlockedByDarkType("prankster", "status", ["normal"])).toBe(false);
    });

    it("given non-Prankster ability using status move vs Dark-type, then NOT blocked", () => {
      // Only Prankster triggers this check
      expect(isPranksterBlockedByDarkType("keen-eye", "status", ["dark"])).toBe(false);
    });

    it("given Prankster handler on-priority-check with status move, then returns activated:true (priority still granted)", () => {
      // Source: Showdown data/abilities.ts -- Prankster DOES grant priority; the immunity
      // is a separate check during move execution. The move gains priority but then fails.
      const ctx = makeCtx({
        ability: "prankster",
        trigger: "on-priority-check",
        move: makeMove({ category: "status", type: "normal" }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toContain("Prankster");
    });
  });

  // -----------------------------------------------------------------------
  // Gale Wings: only at full HP (was unconditional in Gen 6)
  // -----------------------------------------------------------------------

  describe("Gale Wings: no priority below full HP (new nerf in Gen 7)", () => {
    it("given Gale Wings at full HP with Flying move, then isGaleWingsActive returns true", () => {
      // Source: Showdown data/abilities.ts -- galeWings Gen 7: hp === maxhp
      // Source: Bulbapedia "Gale Wings" Gen 7 -- "only activates when at full HP"
      expect(isGaleWingsActive("gale-wings", "flying", 200, 200)).toBe(true);
    });

    it("given Gale Wings at 199/200 HP with Flying move, then isGaleWingsActive returns false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: strictly requires full HP
      // This is the key Gen 7 nerf: even 1 HP of damage disables Gale Wings.
      expect(isGaleWingsActive("gale-wings", "flying", 199, 200)).toBe(false);
    });

    it("given Gale Wings at 1/200 HP with Flying move, then isGaleWingsActive returns false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: hp < maxhp -> no boost
      expect(isGaleWingsActive("gale-wings", "flying", 1, 200)).toBe(false);
    });

    it("given Gale Wings at full HP with non-Flying move, then isGaleWingsActive returns false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: only Flying-type moves
      expect(isGaleWingsActive("gale-wings", "fire", 200, 200)).toBe(false);
    });

    it("given Gale Wings handler at full HP with Flying move on-priority-check, then activated:true", () => {
      // Source: Showdown data/abilities.ts -- galeWings: onModifyPriority +1
      const ctx = makeCtx({
        ability: "gale-wings",
        trigger: "on-priority-check",
        move: makeMove({ type: "flying" }),
        currentHp: 200,
        maxHp: 200,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toContain("Gale Wings");
    });

    it("given Gale Wings handler below full HP with Flying move on-priority-check, then activated:false", () => {
      // Source: Showdown data/abilities.ts -- galeWings: Gen 7 hp check
      // The Gen 7 nerf: priority is NOT granted when below full HP.
      const ctx = makeCtx({
        ability: "gale-wings",
        trigger: "on-priority-check",
        move: makeMove({ type: "flying" }),
        currentHp: 150,
        maxHp: 200,
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Beast Boost: triggers on KO, raises highest stat (NEW in Gen 7)
  // -----------------------------------------------------------------------

  describe("Beast Boost: +1 highest stat on KO (new in Gen 7)", () => {
    it("given Beast Boost user KOs opponent with Attack as highest stat, then raises Attack by 1", () => {
      // Source: Showdown data/abilities.ts -- beastboost: onSourceAfterFaint
      // Source: Bulbapedia "Beast Boost" -- "raises the user's highest stat by one stage"
      const ctx = makeCtx({
        ability: "beast-boost",
        trigger: "on-after-move-used",
        attack: 150,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
        opponent: makeActive({ currentHp: 0, hp: 200 }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].effectType).toBe("stat-change");
      if (result.effects[0].effectType === "stat-change") {
        expect(result.effects[0].stat).toBe("attack");
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Beast Boost user KOs opponent with Speed as highest stat, then raises Speed by 1", () => {
      // Source: Showdown data/abilities.ts -- beastboost: picks highest stat
      const ctx = makeCtx({
        ability: "beast-boost",
        trigger: "on-after-move-used",
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 180,
        opponent: makeActive({ currentHp: 0, hp: 200 }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      if (result.effects[0].effectType === "stat-change") {
        expect(result.effects[0].stat).toBe("speed");
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Beast Boost user KOs opponent with SpAtk as highest stat, then raises SpAtk by 1", () => {
      // Source: Showdown data/abilities.ts -- beastboost: checks spa
      const ctx = makeCtx({
        ability: "beast-boost",
        trigger: "on-after-move-used",
        attack: 90,
        defense: 90,
        spAttack: 200,
        spDefense: 90,
        speed: 90,
        opponent: makeActive({ currentHp: 0, hp: 200 }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      if (result.effects[0].effectType === "stat-change") {
        expect(result.effects[0].stat).toBe("spAttack");
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Beast Boost user with all stats equal, then raises Attack (tie-break priority: Atk first)", () => {
      // Source: Showdown data/abilities.ts -- beastboost: iteration order is atk, def, spa, spd, spe
      // When all stats are equal, Attack wins because it is checked first and no subsequent
      // stat is strictly greater.
      const ctx = makeCtx({
        ability: "beast-boost",
        trigger: "on-after-move-used",
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
        opponent: makeActive({ currentHp: 0, hp: 200 }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      if (result.effects[0].effectType === "stat-change") {
        expect(result.effects[0].stat).toBe("attack");
      }
    });

    it("given Beast Boost user when opponent is NOT fainted, then activated:false", () => {
      // Source: Showdown data/abilities.ts -- beastboost: only on faint
      const ctx = makeCtx({
        ability: "beast-boost",
        trigger: "on-after-move-used",
        attack: 150,
        opponent: makeActive({ currentHp: 100, hp: 200 }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(false);
    });

    it("given Beast Boost, then message includes the stat name", () => {
      // Source: Showdown battle-actions.ts -- boost messages
      const ctx = makeCtx({
        ability: "beast-boost",
        trigger: "on-after-move-used",
        nickname: "Pheromosa",
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 200,
        opponent: makeActive({ currentHp: 0, hp: 200 }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.messages[0]).toContain("Beast Boost");
      expect(result.messages[0]).toContain("Speed");
    });
  });

  // -----------------------------------------------------------------------
  // Stamina: +1 Def on each hit (NEW in Gen 7)
  // -----------------------------------------------------------------------

  describe("Stamina: +1 Def on each damaging hit (new in Gen 7)", () => {
    it("given Stamina user hit by a physical move, then raises Defense by 1", () => {
      // Source: Showdown data/abilities.ts -- Stamina onDamagingHit
      // Source: Bulbapedia "Stamina" -- "+1 Defense when hit by a damage-dealing move"
      const ctx = makeCtx({
        ability: "stamina",
        trigger: "on-damage-taken",
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].effectType).toBe("stat-change");
      if (result.effects[0].effectType === "stat-change") {
        expect(result.effects[0].stat).toBe("defense");
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Stamina user hit by a special move, then raises Defense by 1 (triggers on all damaging moves)", () => {
      // Source: Showdown data/abilities.ts -- Stamina: triggers on both physical and special
      const ctx = makeCtx({
        ability: "stamina",
        trigger: "on-damage-taken",
        move: makeMove({ category: "special" }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      if (result.effects[0].effectType === "stat-change") {
        expect(result.effects[0].stat).toBe("defense");
        expect(result.effects[0].stages).toBe(1);
      }
    });

    it("given Stamina user hit by a status move, then activated:false (status moves don't trigger)", () => {
      // Source: Showdown data/abilities.ts -- Stamina: only damaging moves
      const ctx = makeCtx({
        ability: "stamina",
        trigger: "on-damage-taken",
        move: makeMove({ category: "status" }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(false);
    });

    it("given Stamina, then message mentions Stamina and Defense", () => {
      // Source: Showdown battle-actions.ts -- ability activation messages
      const ctx = makeCtx({
        ability: "stamina",
        trigger: "on-damage-taken",
        nickname: "Mudsdale",
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.messages[0]).toContain("Stamina");
      expect(result.messages[0]).toContain("Defense");
    });
  });

  // -----------------------------------------------------------------------
  // Weak Armor: +2 Speed in Gen 7 (was +1 in Gen 5-6)
  // -----------------------------------------------------------------------

  describe("Weak Armor: +2 Speed in Gen 7 (was +1 in Gen 5-6)", () => {
    it("given Weak Armor user hit by physical move in Gen 7, then -1 Def and +2 Speed", () => {
      // Source: Showdown data/abilities.ts -- Weak Armor Gen 7: spe +2
      // Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6: spe +1
      // Source: Bulbapedia "Weak Armor" -- "From Generation VII onwards, Speed is raised by 2"
      const ctx = makeCtx({
        ability: "weak-armor",
        trigger: "on-damage-taken",
        move: makeMove({ category: "physical" }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(2);

      // First effect: -1 Defense
      expect(result.effects[0].effectType).toBe("stat-change");
      if (result.effects[0].effectType === "stat-change") {
        expect(result.effects[0].stat).toBe("defense");
        expect(result.effects[0].stages).toBe(-1);
      }

      // Second effect: +2 Speed (NOT +1 like Gen 5-6)
      expect(result.effects[1].effectType).toBe("stat-change");
      if (result.effects[1].effectType === "stat-change") {
        expect(result.effects[1].stat).toBe("speed");
        expect(result.effects[1].stages).toBe(2);
      }
    });

    it("given Weak Armor user hit by special move, then activated:false (physical only)", () => {
      // Source: Showdown data/abilities.ts -- Weak Armor: only physical moves
      const ctx = makeCtx({
        ability: "weak-armor",
        trigger: "on-damage-taken",
        move: makeMove({ category: "special" }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Triage: +3 priority to healing moves (NEW in Gen 7)
  // -----------------------------------------------------------------------

  describe("Triage: +3 priority to healing moves (new in Gen 7)", () => {
    it("given Triage with Drain Punch, then priority bonus is +3", () => {
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority +3
      // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
      expect(getTriagePriorityBonus("triage", "drain-punch", "drain")).toBe(3);
    });

    it("given Triage with Roost (recovery move), then priority bonus is +3", () => {
      // Source: Showdown data/abilities.ts -- triage: includes recovery moves
      expect(getTriagePriorityBonus("triage", "roost", null)).toBe(3);
    });

    it("given Triage with Giga Drain, then priority bonus is +3", () => {
      // Source: Showdown data/abilities.ts -- triage: drain moves
      expect(getTriagePriorityBonus("triage", "giga-drain", "drain")).toBe(3);
    });

    it("given Triage with Floral Healing (Gen 7 move), then priority bonus is +3", () => {
      // Source: Showdown data/abilities.ts -- triage: includes Floral Healing
      expect(getTriagePriorityBonus("triage", "floral-healing", null)).toBe(3);
    });

    it("given Triage with Tackle (non-healing move), then priority bonus is 0", () => {
      // Source: Showdown data/abilities.ts -- triage: only healing moves get bonus
      expect(getTriagePriorityBonus("triage", "tackle", null)).toBe(0);
    });

    it("given non-Triage ability with healing move, then priority bonus is 0", () => {
      // Only Triage provides this bonus
      expect(getTriagePriorityBonus("adaptability", "drain-punch", "drain")).toBe(0);
    });

    it("given Triage handler on-priority-check with healing move, then activated:true", () => {
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority
      const ctx = makeCtx({
        ability: "triage",
        trigger: "on-priority-check",
        move: makeMove({
          id: "drain-punch",
          type: "fighting",
          effect: { type: "drain", drainPercent: 50 },
        }),
      });
      const result = handleGen7StatAbility(ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toContain("Triage");
    });
  });
});
