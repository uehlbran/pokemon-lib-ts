import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2HiddenPower } from "../src/Gen2DamageCalc";
import { Gen2Ruleset } from "../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Helper to create a minimal ActivePokemon mock for testing.
 * Mirrors the pattern in ruleset.test.ts, with additional fields for
 * lastDamageTaken/lastDamageCategory needed by Counter/Mirror Coat tests.
 */
function createMockActive(
  overrides: Partial<{
    level: number;
    currentHp: number;
    maxHp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    status: string | null;
    types: string[];
    heldItem: string | null;
    speciesId: number;
    nickname: string | null;
    moves: Array<{ moveId: string; pp: number; maxPp: number }>;
    ivs: Partial<{
      hp: number;
      attack: number;
      defense: number;
      spAttack: number;
      spDefense: number;
      speed: number;
    }>;
    lastDamageTaken: number;
    lastDamageCategory: string | null;
    lastDamageType: string | null;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      speciesId: overrides.speciesId ?? 1,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      ivs: {
        hp: overrides.ivs?.hp ?? 15,
        attack: overrides.ivs?.attack ?? 15,
        defense: overrides.ivs?.defense ?? 15,
        spAttack: overrides.ivs?.spAttack ?? 15,
        spDefense: overrides.ivs?.spDefense ?? 15,
        speed: overrides.ivs?.speed ?? 15,
      },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: overrides.moves ?? [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      calculatedStats: {
        hp: maxHp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
    },
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
    types: (overrides.types as unknown as PokemonType[]) ?? ["normal"],
    ability: "",
    lastMoveUsed: null,
    turnsOnField: 0,
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
    lastDamageTaken: overrides.lastDamageTaken ?? 0,
    lastDamageCategory: overrides.lastDamageCategory ?? null,
    lastDamageType: overrides.lastDamageType ?? null,
  } as unknown as ActivePokemon;
}

function createMockSide(
  index: 0 | 1,
  active: ActivePokemon,
  team: PokemonInstance[] = [],
): BattleSide {
  return {
    index,
    trainer: null,
    team: team.length > 0 ? team : [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createMockState(
  side0: BattleSide,
  side1: BattleSide,
  weather: { type: string; turnsLeft: number } | null = null,
): BattleState {
  return {
    sides: [side0, side1],
    turn: 1,
    weather,
    terrain: null,
    trickRoom: null,
    format: { id: "singles", slots: 1 },
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Combat Moves", () => {
  const ruleset = new Gen2Ruleset();

  // =========================================================================
  // Counter
  // =========================================================================

  describe("Counter", () => {
    const counterMove = {
      id: "counter",
      name: "Counter",
      type: "fighting",
      category: "physical",
      power: null,
      accuracy: 100,
      pp: 20,
      priority: -1,
      effect: null,
      flags: {},
    } as unknown as MoveData;

    it("given attacker took 40 physical damage, when Counter is used, then deals 80 damage to defender", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Counter
      // Counter reflects 2x the physical damage taken this turn.
      const attacker = createMockActive({
        lastDamageTaken: 40,
        lastDamageCategory: "physical",
        lastDamageType: "normal",
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: counterMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toEqual({
        target: "defender",
        amount: 80,
        source: "counter",
      });
    });

    it("given attacker took 100 physical damage, when Counter is used, then deals 200 damage to defender", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Counter
      // Second triangulation case with different input.
      const attacker = createMockActive({
        lastDamageTaken: 100,
        lastDamageCategory: "physical",
        lastDamageType: "fighting",
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: counterMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toEqual({
        target: "defender",
        amount: 200,
        source: "counter",
      });
    });

    it("given attacker took no damage this turn, when Counter is used, then fails", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Counter
      // Counter fails if no physical damage was taken.
      const attacker = createMockActive({
        lastDamageTaken: 0,
        lastDamageCategory: null,
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: counterMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toBeUndefined();
      expect(result.messages).toContain("But it failed!");
    });

    it("given attacker took physical damage from a Rock-type move, when Counter is used, then deals 2x damage", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/move_effects/counter.asm:33-35
      //   ld a, [wStringBuffer1 + MOVE_TYPE]
      //   cp SPECIAL  ; SPECIAL = 20 (Fire is first special type)
      //   ret nc      ; fail if type >= SPECIAL (i.e., special type)
      // Counter works on ALL physical types (type < SPECIAL), not just Normal/Fighting.
      // Rock is type 5 (physical), so Counter should reflect Rock-type damage.
      const attacker = createMockActive({
        lastDamageTaken: 60,
        lastDamageCategory: "physical",
        lastDamageType: "rock",
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: counterMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toEqual({
        target: "defender",
        amount: 120,
        source: "counter",
      });
    });

    it("given attacker took physical damage from a Ghost-type move, when Counter is used, then deals 2x damage", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/move_effects/counter.asm:33-35
      // Ghost is type 8 (physical in Gen 2, < SPECIAL=20), so Counter should reflect Ghost damage.
      // This is a notable edge case because Ghost was special in some fan understanding.
      const attacker = createMockActive({
        lastDamageTaken: 50,
        lastDamageCategory: "physical",
        lastDamageType: "ghost",
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: counterMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toEqual({
        target: "defender",
        amount: 100,
        source: "counter",
      });
    });

    it("given attacker took special damage, when Counter is used, then fails", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Counter
      // In Gen 2, Counter works against physical-type moves only (not special).
      const attacker = createMockActive({
        lastDamageTaken: 60,
        lastDamageCategory: "special",
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: counterMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toBeUndefined();
      expect(result.messages).toContain("But it failed!");
    });
  });

  // =========================================================================
  // Mirror Coat
  // =========================================================================

  describe("Mirror Coat", () => {
    const mirrorCoatMove = {
      id: "mirror-coat",
      name: "Mirror Coat",
      type: "psychic",
      category: "special",
      power: null,
      accuracy: 100,
      pp: 20,
      priority: -1,
      effect: null,
      flags: {},
    } as unknown as MoveData;

    it("given attacker took 50 special damage, when Mirror Coat is used, then deals 100 damage to defender", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_MirrorCoat
      // Mirror Coat reflects 2x the special damage taken this turn.
      const attacker = createMockActive({
        lastDamageTaken: 50,
        lastDamageCategory: "special",
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: mirrorCoatMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toEqual({
        target: "defender",
        amount: 100,
        source: "mirror-coat",
      });
    });

    it("given attacker took 75 special damage, when Mirror Coat is used, then deals 150 damage to defender", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_MirrorCoat
      // Second triangulation case with different input.
      const attacker = createMockActive({
        lastDamageTaken: 75,
        lastDamageCategory: "special",
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: mirrorCoatMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toEqual({
        target: "defender",
        amount: 150,
        source: "mirror-coat",
      });
    });

    it("given attacker took no damage this turn, when Mirror Coat is used, then fails", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_MirrorCoat
      // Mirror Coat fails if no special damage was taken.
      const attacker = createMockActive({
        lastDamageTaken: 0,
        lastDamageCategory: null,
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: mirrorCoatMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toBeUndefined();
      expect(result.messages).toContain("But it failed!");
    });

    it("given attacker took physical damage, when Mirror Coat is used, then fails", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_MirrorCoat
      // Mirror Coat only reflects special damage, not physical.
      const attacker = createMockActive({
        lastDamageTaken: 60,
        lastDamageCategory: "physical",
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: mirrorCoatMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.customDamage).toBeUndefined();
      expect(result.messages).toContain("But it failed!");
    });
  });

  // =========================================================================
  // Hidden Power
  // =========================================================================

  describe("Hidden Power", () => {
    // Source: pret/pokecrystal engine/battle/hidden_power.asm — HiddenPowerDamage
    //
    // TYPE formula (decomp):
    //   typeIndex = (atkDv & 3) * 4 + (defDv & 3)
    //   Maps through HP_TYPES[0..15] → Fighting..Dark (skipping Normal/Bird/unused)
    //
    // POWER formula (decomp):
    //   topBits = ((atkDv>>3)&1)*8 + ((defDv>>3)&1)*4 + ((spdDv>>3)&1)*2 + ((spcDv>>3)&1)
    //   power = floor((topBits * 5 + (spcDv & 3)) / 2) + 31
    //   Range: 31-70

    it("given DVs Atk=15 Def=15 Spe=15 Spc=15, when calculating HP type, then returns Dark (index 15)", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm
      // typeIndex = (15 & 3) * 4 + (15 & 3) = 3*4+3 = 15 → HP_TYPES[15] = "dark"
      const attacker = createMockActive({
        ivs: { attack: 15, defense: 15, speed: 15, spAttack: 15 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("dark");
    });

    it("given DVs Atk=15 Def=15 Spe=15 Spc=15, when calculating HP power, then returns 70 (max)", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm
      // topBits = 1*8+1*4+1*2+1 = 15, spc&3 = 3
      // power = floor((15*5+3)/2)+31 = floor(78/2)+31 = 39+31 = 70
      const attacker = createMockActive({
        ivs: { attack: 15, defense: 15, speed: 15, spAttack: 15 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.power).toBe(70);
    });

    it("given DVs Atk=0 Def=0 Spe=0 Spc=0, when calculating HP type, then returns Fighting (index 0)", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm
      // typeIndex = (0 & 3) * 4 + (0 & 3) = 0 → HP_TYPES[0] = "fighting"
      const attacker = createMockActive({
        ivs: { attack: 0, defense: 0, speed: 0, spAttack: 0 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("fighting");
    });

    it("given DVs Atk=0 Def=0 Spe=0 Spc=0, when calculating HP power, then returns 31 (minimum)", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm
      // topBits = 0, spc&3 = 0, power = floor(0/2)+31 = 31
      const attacker = createMockActive({
        ivs: { attack: 0, defense: 0, speed: 0, spAttack: 0 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.power).toBe(31);
    });

    it("given DVs Atk=13 Def=13 Spe=13 Spc=13, when calculating HP, then returns Bug/69", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm
      // typeIndex = (13 & 3) * 4 + (13 & 3) = 1*4+1 = 5 → HP_TYPES[5] = "bug"
      // topBits = 1*8+1*4+1*2+1 = 15, spc&3 = 13&3 = 1
      // power = floor((15*5+1)/2)+31 = floor(76/2)+31 = 38+31 = 69
      const attacker = createMockActive({
        ivs: { attack: 13, defense: 13, speed: 13, spAttack: 13 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("bug");
      expect(result.power).toBe(69);
    });

    it("given DVs Atk=15 Def=14 Spe=13 Spc=12, when calculating HP type, then returns Dragon (index 14)", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm
      // typeIndex = (15 & 3) * 4 + (14 & 3) = 3*4+2 = 14 → HP_TYPES[14] = "dragon"
      const attacker = createMockActive({
        ivs: { attack: 15, defense: 14, speed: 13, spAttack: 12 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("dragon");
    });

    it("given DVs Atk=2 Def=3 Spe=6 Spc=7, when calculating HP, then returns Electric/32", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm
      // typeIndex = (2 & 3) * 4 + (3 & 3) = 2*4+3 = 11 → HP_TYPES[11] = "electric"
      // topBits: (2>>3)&1=0, (3>>3)&1=0, (6>>3)&1=0, (7>>3)&1=0 → 0
      // spc&3 = 7&3 = 3
      // power = floor((0*5+3)/2)+31 = floor(3/2)+31 = 1+31 = 32
      const attacker = createMockActive({
        ivs: { attack: 2, defense: 3, speed: 6, spAttack: 7 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("electric");
      expect(result.power).toBe(32);
    });

    it("given DVs Atk=4 Def=0 Spe=0 Spc=0, when calculating HP, then returns Fighting type with power 31", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm
      // typeIndex = (4 & 3) * 4 + (0 & 3) = 0*4+0 = 0 → HP_TYPES[0] = "fighting"
      // topBits: (4>>3)&1=0, (0>>3)&1=0, (0>>3)&1=0, (0>>3)&1=0 → 0
      // spc&3 = 0, power = floor(0/2)+31 = 31
      const attacker = createMockActive({
        ivs: { attack: 4, defense: 0, speed: 0, spAttack: 0 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("fighting");
      expect(result.power).toBe(31);
    });
  });

  // =========================================================================
  // Hyper Beam Recharge
  // =========================================================================

  describe("Hyper Beam", () => {
    const hyperBeamMove = {
      id: "hyper-beam",
      name: "Hyper Beam",
      type: "normal",
      category: "special",
      power: 150,
      accuracy: 90,
      pp: 5,
      priority: 0,
      effect: null,
      flags: { recharge: true },
    } as unknown as MoveData;

    it("given Hyper Beam hits and target survives (currentHp > 0), when executeMoveEffect is called, then noRecharge is not set", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
      // Hyper Beam should still require recharge when the target survives.
      // The engine applies damage before calling executeMoveEffect; target has 50 HP left.
      const attacker = createMockActive();
      const defender = createMockActive({ currentHp: 50, maxHp: 200 });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: hyperBeamMove,
        damage: 100,
        state,
        rng: new SeededRandom(42),
      });

      // Assert -- noRecharge should be undefined or falsy when target survives
      expect(result.noRecharge).toBeFalsy();
    });

    it("given Hyper Beam KOs the target (currentHp === 0), when executeMoveEffect is called, then noRecharge is true", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
      // In Gen 2, if Hyper Beam KOs the target, the attacker skips the recharge turn.
      // The engine applies damage to defender.pokemon.currentHp BEFORE calling
      // executeMoveEffect, so a KO is detected by checking currentHp === 0.
      const attacker = createMockActive();
      const defender = createMockActive({ currentHp: 0, maxHp: 200 });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: hyperBeamMove,
        damage: 150,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.noRecharge).toBe(true);
    });

    it("given Hyper Beam misses (damage=0 but defender alive), when executeMoveEffect is called, then noRecharge is NOT set (user must recharge)", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
      // In Gen 2, Hyper Beam recharge is skipped ONLY on KO — NOT on miss.
      // Unlike Gen 1 where miss skips recharge, Gen 2 always forces recharge unless KO.
      const attacker = createMockActive();
      const defender = createMockActive({ currentHp: 150, maxHp: 200 });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: hyperBeamMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert -- miss does NOT skip recharge in Gen 2 (unlike Gen 1)
      expect(result.noRecharge).toBeFalsy();
    });
  });

  // =========================================================================
  // Whirlwind / Roar (Phazing)
  // =========================================================================

  describe("Whirlwind/Roar", () => {
    const whirlwindMove = {
      id: "whirlwind",
      name: "Whirlwind",
      type: "normal",
      category: "status",
      power: null,
      accuracy: null,
      pp: 20,
      priority: -6,
      effect: null,
      flags: {},
    } as unknown as MoveData;

    const roarMove = {
      id: "roar",
      name: "Roar",
      type: "normal",
      category: "status",
      power: null,
      accuracy: null,
      pp: 20,
      priority: -6,
      effect: null,
      flags: {},
    } as unknown as MoveData;

    it("given Whirlwind is used, when executeMoveEffect is called, then sets switchOut and forcedSwitch", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Whirlwind
      // In Gen 2, Whirlwind forces the opponent to switch to a random party member.
      // The forcedSwitch flag tells the engine that the DEFENDER is forced to switch.
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: whirlwindMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.switchOut).toBe(true);
      expect(result.forcedSwitch).toBe(true);
    });

    it("given Roar is used, when executeMoveEffect is called, then sets switchOut and forcedSwitch", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Whirlwind
      // Roar has the same phazing effect as Whirlwind.
      const attacker = createMockActive();
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: roarMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.switchOut).toBe(true);
      expect(result.forcedSwitch).toBe(true);
    });
  });

  // =========================================================================
  // Counter stale damage tracking (Fix 6)
  // =========================================================================

  describe("Counter stale damage", () => {
    const counterMove = {
      id: "counter",
      name: "Counter",
      type: "fighting",
      category: "physical",
      power: null,
      accuracy: 100,
      pp: 20,
      priority: -1,
      effect: null,
      flags: {},
    } as unknown as MoveData;

    it("given Counter is used the turn after taking physical damage (but NOT hit this turn), when executeMoveEffect, then fails", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Counter
      // Counter should only reflect damage taken during the current turn.
      // The engine resets lastDamageTaken/lastDamageCategory at turn-end (Fix 6),
      // so by the next turn these fields should be 0/null.
      // This test verifies the ruleset correctly fails when no damage was taken this turn.
      const attacker = createMockActive({
        lastDamageTaken: 0,
        lastDamageCategory: null,
      });
      const defender = createMockActive();
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: counterMove,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert -- no damage taken this turn means Counter fails
      expect(result.customDamage).toBeUndefined();
      expect(result.messages).toContain("But it failed!");
    });
  });

  // =========================================================================
  // Hidden Power damage (Fix 5 regression)
  // =========================================================================

  describe("Hidden Power damage calc", () => {
    it("given attacker with all DVs=15, when calculateDamage is called with hidden-power, then returns non-zero damage", () => {
      // Arrange
      // Source: Bulbapedia — "Hidden Power (move)/Generation II"
      // All DVs=15 → type=Dark, power=70 (capped from 71)
      // This regression test verifies that hidden-power with power=1 in moves.json
      // still calculates correct damage because Gen2DamageCalc overrides the power via dynamicPower.
      const attacker = createMockActive({
        level: 50,
        spAttack: 150,
        ivs: { attack: 15, defense: 15, speed: 15, spAttack: 15 },
        types: ["psychic"],
      });
      const defender = createMockActive({
        level: 50,
        spDefense: 100,
        types: ["normal"],
      });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      const hiddenPowerMove = {
        id: "hidden-power",
        name: "Hidden Power",
        type: "normal",
        category: "physical",
        power: 1,
        accuracy: 100,
        pp: 15,
        priority: 0,
        effect: { type: "custom", handler: "hidden-power" },
        flags: {},
      } as unknown as MoveData;

      // Act
      const result = ruleset.calculateDamage({
        attacker,
        defender,
        move: hiddenPowerMove,
        state,
        rng: new SeededRandom(42),
        isCrit: false,
      });

      // Assert -- damage should be non-zero since power is overridden to 70 by DV calc
      expect(result.damage).toBeGreaterThan(0);
      // And the effective type should be Dark (all DVs=15 → type index 15 → "dark")
      expect(result.effectiveType).toBe("dark");
    });

    it("given attacker with DVs producing Dragon type, when calculateDamage is called with hidden-power, then effectiveType is dragon", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/hidden_power.asm — HiddenPowerDamage
      // typeIndex = (atkDv & 3) * 4 + (defDv & 3)
      // DVs: Atk=15, Def=14 → (15 & 3)*4 + (14 & 3) = 3*4+2 = 14 → HP_TYPES[14] = "dragon"
      const attacker = createMockActive({
        level: 50,
        spAttack: 120,
        ivs: { attack: 15, defense: 14, speed: 13, spAttack: 12 },
        types: ["dragon"],
      });
      const defender = createMockActive({
        level: 50,
        spDefense: 100,
        types: ["normal"],
      });
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

      const hiddenPowerMove = {
        id: "hidden-power",
        name: "Hidden Power",
        type: "normal",
        category: "physical",
        power: 1,
        accuracy: 100,
        pp: 15,
        priority: 0,
        effect: { type: "custom", handler: "hidden-power" },
        flags: {},
      } as unknown as MoveData;

      // Act
      const result = ruleset.calculateDamage({
        attacker,
        defender,
        move: hiddenPowerMove,
        state,
        rng: new SeededRandom(42),
        isCrit: false,
      });

      // Assert
      expect(result.damage).toBeGreaterThan(0);
      expect(result.effectiveType).toBe("dragon");
      // Dragon is a special type in Gen 2, so effectiveCategory should be "special"
      expect(result.effectiveCategory).toBe("special");
    });
  });
});
