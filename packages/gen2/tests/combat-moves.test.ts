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
    it("given DVs Atk=15 Def=15 Spe=15 Spc=15 (all odd), when calculating HP type, then returns Dark (index 15)", () => {
      // Arrange
      // Source: Bulbapedia -- "Hidden Power (move)/Generation II"
      // typeIndex = (15%2)*8 + (15%2)*4 + (15%2)*2 + (15%2) = 1*8 + 1*4 + 1*2 + 1 = 15
      // HP_TYPES[15] = "dark"
      const attacker = createMockActive({
        ivs: { attack: 15, defense: 15, speed: 15, spAttack: 15 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("dark");
    });

    it("given DVs Atk=15 Def=15 Spe=15 Spc=15, when calculating HP power, then returns 70 (max power, capped)", () => {
      // Arrange
      // Source: Bulbapedia — "The base power can range between 31 and 70"
      // Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
      // All bits 3 and 2 are 1 for DV=15 (binary 1111):
      //   bit3Atk=1, bit3Def=1, bit3Spe=1, bit3Spc=1, bit2Atk=1, bit2Def=1
      //   powerBits = 1*32 + 1*16 + 1*8 + 1*4 + 1*2 + 1 = 63
      //   raw = floor((63 * 40) / 63) + 31 = 40 + 31 = 71, capped to 70
      const attacker = createMockActive({
        ivs: { attack: 15, defense: 15, speed: 15, spAttack: 15 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.power).toBe(70);
    });

    it("given DVs Atk=0 Def=0 Spe=0 Spc=0 (all even), when calculating HP type, then returns Fighting (index 0)", () => {
      // Arrange
      // Source: Bulbapedia -- "Hidden Power (move)/Generation II"
      // typeIndex = (0%2)*8 + (0%2)*4 + (0%2)*2 + (0%2) = 0
      // HP_TYPES[0] = "fighting"
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
      // Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
      // All bits are 0 => powerBits = 0
      // power = floor((0 * 40) / 63) + 31 = 0 + 31 = 31
      const attacker = createMockActive({
        ivs: { attack: 0, defense: 0, speed: 0, spAttack: 0 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.power).toBe(31);
    });

    it("given DVs Atk=13 Def=13 Spe=13 Spc=13, when calculating HP type and power, then returns Dark/70", () => {
      // Arrange
      // Source: Bulbapedia -- "Hidden Power (move)/Generation II"
      // 13 = 0b1101: 13%2=1 (odd), bit3=(13>>3)&1=1, bit2=(13>>2)&1=1
      // typeIndex = 1*8 + 1*4 + 1*2 + 1 = 15 => "dark"
      // powerBits = 1*32+1*16+1*8+1*4+1*2+1 = 63 => raw=71, capped to 70
      const attacker = createMockActive({
        ivs: { attack: 13, defense: 13, speed: 13, spAttack: 13 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("dark");
      expect(result.power).toBe(70);
    });

    it("given DVs that produce Grass type (Atk=15 Def=14 Spe=13 Spc=12), when calculating HP type, then returns Grass", () => {
      // Arrange
      // Source: Bulbapedia -- "Hidden Power (move)/Generation II"
      // Low bits: 15%2=1, 14%2=0, 13%2=1, 12%2=0
      // typeIndex = 1*8 + 0*4 + 1*2 + 0 = 10 => HP_TYPES[10] = "grass"
      const attacker = createMockActive({
        ivs: { attack: 15, defense: 14, speed: 13, spAttack: 12 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("grass");
    });

    it("given DVs Atk=2 Def=3 Spe=6 Spc=7, when calculating HP type and power, then returns Bug/31", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
      // Low bits: 2%2=0, 3%2=1, 6%2=0, 7%2=1
      // typeIndex = 0*8 + 1*4 + 0*2 + 1 = 5 => HP_TYPES[5] = "bug"
      //
      // bit3: (2>>3)&1=0, (3>>3)&1=0, (6>>3)&1=0, (7>>3)&1=0
      // bit2: (2>>2)&1=0, (3>>2)&1=0
      // powerBits = 0 => power = floor(0*40/63)+31 = 31
      const attacker = createMockActive({
        ivs: { attack: 2, defense: 3, speed: 6, spAttack: 7 },
      });

      // Act
      const result = calculateGen2HiddenPower(attacker);

      // Assert
      expect(result.type).toBe("bug");
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

    it("given Hyper Beam misses (damage=0), when executeMoveEffect is called, then noRecharge is true", () => {
      // Arrange
      // Source: pret/pokecrystal engine/battle/core.asm HyperBeamCheck
      // In Gen 2, if Hyper Beam misses (damage=0), the attacker skips the recharge turn.
      // The engine passes damage=0 when a move misses.
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

      // Assert -- miss means no recharge
      expect(result.noRecharge).toBe(true);
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
      priority: -1,
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
      priority: -1,
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

    it("given attacker with DVs producing Grass type, when calculateDamage is called with hidden-power, then effectiveType is grass", () => {
      // Arrange
      // Source: Bulbapedia — "Hidden Power (move)/Generation II"
      // DVs: Atk=15 Def=14 Spe=13 Spc=12 → typeIndex = 1*8+0*4+1*2+0 = 10 → "grass"
      const attacker = createMockActive({
        level: 50,
        spAttack: 120,
        ivs: { attack: 15, defense: 14, speed: 13, spAttack: 12 },
        types: ["grass"],
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
      expect(result.effectiveType).toBe("grass");
      // Grass is a special type in Gen 2, so effectiveCategory should be "special"
      expect(result.effectiveCategory).toBe("special");
    });
  });
});
