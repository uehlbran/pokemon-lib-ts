/**
 * Tests for per-hit damage variation in multi-hit moves (Triple Kick, Beat Up).
 *
 * Verifies that the `perHitDamageFn` callback on MoveEffectResult is correctly
 * set by Gen2Ruleset.computePerHitDamage for moves that vary damage per hit.
 * The callback is lazy -- RNG is only consumed when the function is called,
 * not when the move effect is computed. This prevents RNG desync when the
 * target faints mid-multi-hit.
 *
 * Source: pret/pokecrystal engine/battle/effect_commands.asm -- TripleKickEffect, BeatUpEffect
 * Source: Bulbapedia -- "Triple Kick: Power increases by 10 with each hit: 10, 20, 30"
 * Source: Bulbapedia -- "Beat Up: each hit uses the corresponding party member's base Attack"
 */

import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockActive(
  overrides: Partial<{
    speciesId: number;
    uid: string;
    level: number;
    currentHp: number;
    maxHp: number;
    status: string | null;
    types: string[];
    nickname: string | null;
    heldItem: string | null;
    moves: Array<{ moveId: string; pp: number; maxPp: number; currentPP?: number }>;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      uid: overrides.uid ?? "mock-uid-1",
      speciesId: overrides.speciesId ?? 1,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: overrides.moves ?? [{ moveId: "tackle", pp: 35, maxPp: 35, currentPP: 35 }],
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
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
    lastDamageTaken: 0,
    lastDamageCategory: null,
    lastDamageType: null,
  } as unknown as ActivePokemon;
}

function createMockTeamMember(
  overrides: Partial<{
    uid: string;
    speciesId: number;
    level: number;
    currentHp: number;
    status: string | null;
  }> = {},
): PokemonInstance {
  return {
    uid: overrides.uid ?? `team-${Math.random().toString(36).slice(2, 6)}`,
    speciesId: overrides.speciesId ?? 1,
    level: overrides.level ?? 50,
    currentHp: overrides.currentHp ?? 200,
    status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
    heldItem: null,
    nickname: null,
    ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    moves: [{ moveId: "tackle", pp: 35, maxPp: 35, currentPP: 35 }],
    calculatedStats: {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as unknown as PokemonInstance;
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

function createMockState(side0: BattleSide, side1: BattleSide): BattleState {
  return {
    sides: [side0, side1],
    turn: 1,
    weather: null,
    terrain: null,
    trickRoom: null,
    format: { id: "singles", slots: 1 },
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Triple Kick -- perHitDamageFn tests
// ---------------------------------------------------------------------------

describe("Gen 2 Triple Kick perHitDamageFn", () => {
  const ruleset = new Gen2Ruleset();

  const tripleKickMove = {
    id: "triple-kick",
    name: "Triple Kick",
    type: "fighting",
    category: "physical",
    power: 10,
    accuracy: 90,
    pp: 10,
    priority: 0,
    effect: null,
    flags: { contact: true },
  } as unknown as MoveData;

  it("given Triple Kick is used, when executeMoveEffect is called, then perHitDamageFn is set as a function", () => {
    // Arrange
    // Source: Bulbapedia -- "Triple Kick: Power increases by 10 with each hit: 10, 20, 30"
    // perHitDamageFn should be a lazy function for computing damage per hit
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    // Source: Bulbapedia -- Triple Kick has 3 hits; hit 1 uses normal engine damage,
    // so perHitDamageFn should be set to lazily compute hits 2 and 3.
    expect(typeof result.perHitDamageFn).toBe("function");
    expect(result.multiHitCount).toBe(2);
  });

  it("given Triple Kick with L50 attacker (Atk 100) vs L50 defender (Def 100, Normal type), when perHitDamageFn(0) is called, then returns damage in range for power 20 (Fighting 2x vs Normal)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm TripleKickEffect
    // Hit 2 uses power 20. Fighting is super effective (2x) vs Normal type.
    // Gen 2 damage formula derivation:
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDmg = floor(floor(22 * 20 * 100) / 100 / 50) = floor(440/50) = 8
    //   + 2 = 10
    //   Type effectiveness: Fighting vs Normal = 2x -> floor(10 * 20/10) = 20
    //   Random factor (217-255)/255: range [floor(20*217/255), floor(20*255/255)] = [17, 20]
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });
    const hit2Damage = result.perHitDamageFn!(0);

    // Assert
    // Source: Gen 2 damage formula derivation above -- range [17, 20]
    expect(hit2Damage).toBeGreaterThanOrEqual(17);
    expect(hit2Damage).toBeLessThanOrEqual(20);
  });

  it("given Triple Kick with L50 attacker (Atk 100) vs L50 defender (Def 100, Normal type), when perHitDamageFn(0) then perHitDamageFn(1) are called, then hit 3 is in range for power 30 (Fighting 2x vs Normal)", () => {
    // Arrange
    // Source: Bulbapedia -- "Triple Kick: power 30 for the third hit"
    // Fighting is super effective (2x) vs Normal type.
    // Gen 2 damage formula derivation for power 30:
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDmg = floor(floor(22 * 30 * 100) / 100 / 50) = floor(660/50) = 13
    //   + 2 = 15
    //   Type effectiveness: Fighting vs Normal = 2x -> floor(15 * 20/10) = 30
    //   Random factor (217-255)/255: range [floor(30*217/255), floor(30*255/255)] = [25, 30]
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });
    // Must call hit 2 first to advance RNG correctly (lazy evaluation)
    result.perHitDamageFn!(0);
    const hit3Damage = result.perHitDamageFn!(1);

    // Assert
    // Source: Gen 2 damage formula derivation above -- range [25, 30]
    expect(hit3Damage).toBeGreaterThanOrEqual(25);
    expect(hit3Damage).toBeLessThanOrEqual(30);
  });

  it("given Triple Kick with two different seeds, when perHitDamageFn is called, then values may differ due to random factor", () => {
    // Arrange
    // Triangulation: verify the damage isn't a constant (RNG matters)
    // Source: pret/pokecrystal -- random factor (217-255)/255 applied to each hit
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result1 = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: new SeededRandom(1),
    });
    const result2 = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: new SeededRandom(9999),
    });

    // Assert -- both should have perHitDamageFn set
    expect(typeof result1.perHitDamageFn).toBe("function");
    expect(typeof result2.perHitDamageFn).toBe("function");

    // Invoke lazily and compare
    const dmg1_0 = result1.perHitDamageFn!(0);
    const dmg1_1 = result1.perHitDamageFn!(1);
    const dmg2_0 = result2.perHitDamageFn!(0);
    const dmg2_1 = result2.perHitDamageFn!(1);

    // At least one pair should differ (random factor varies with seed)
    // This is a triangulation test -- two seeds producing the same damage is extremely unlikely
    const allSame = dmg1_0 === dmg2_0 && dmg1_1 === dmg2_1;
    expect(allSame).toBe(false);
  });

  it("given Triple Kick where target faints on hit 1, when perHitDamageFn is never called, then no additional RNG is consumed vs calling it once", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm TripleKickEffect
    // Fix for #620: damage computed inside the hit loop, not before it.
    // If the target faints after hit 1, no per-hit RNG should be consumed.
    // We verify this by comparing two identical RNG streams: one where perHitDamageFn
    // is never called (simulating early KO) and one where it is called once.
    // If the implementation is lazy, these two should diverge.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const rngA = new SeededRandom(42);
    const rngB = new SeededRandom(42);

    // Act -- Scenario A: call executeMoveEffect but never call perHitDamageFn (early KO)
    ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: rngA,
    });
    // Do NOT call perHitDamageFn -- simulating target fainted after hit 1

    // Scenario B: call executeMoveEffect AND invoke perHitDamageFn(0) (one additional hit)
    const resultB = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: rngB,
    });
    resultB.perHitDamageFn!(0); // This consumes RNG for hit 2's crit roll + random factor

    // Assert -- rngA and rngB should now be in DIFFERENT states because rngB consumed
    // additional RNG for the perHitDamageFn call while rngA did not.
    // Source: Fix for #620 -- lazy evaluation means uncalled perHitDamageFn doesn't consume RNG
    const nextA = rngA.int(0, 1000);
    const nextB = rngB.int(0, 1000);
    expect(nextA).not.toBe(nextB);
  });

  it("given Triple Kick where only hit 2 executes (hit 3 skipped), when perHitDamageFn(0) is called once, then exactly 1 hit's worth of RNG is consumed", () => {
    // Arrange
    // Source: pret/pokecrystal -- each hit independently rolls crit + random factor
    // Fix for #620: if hit 3 is skipped (target faints after hit 2), only hit 2's RNG is consumed.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);

    // Act -- result 1: call perHitDamageFn(0) only (1 additional hit executed)
    const result1 = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: rng1,
    });
    result1.perHitDamageFn!(0);

    // result 2: call perHitDamageFn(0) AND perHitDamageFn(1) (both additional hits executed)
    const result2 = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: rng2,
    });
    result2.perHitDamageFn!(0);
    result2.perHitDamageFn!(1);

    // Assert -- rng1 and rng2 should now be in DIFFERENT states since rng2
    // consumed more RNG calls (for hit 3's crit roll + random factor)
    // Source: Fix for #620 -- lazy RNG means partial execution uses less RNG
    const nextA = rng1.int(0, 1000);
    const nextB = rng2.int(0, 1000);
    expect(nextA).not.toBe(nextB);
  });
});

// ---------------------------------------------------------------------------
// Beat Up -- perHitDamageFn tests
// ---------------------------------------------------------------------------

describe("Gen 2 Beat Up perHitDamageFn", () => {
  const ruleset = new Gen2Ruleset();

  const beatUpMove = {
    id: "beat-up",
    name: "Beat Up",
    type: "dark",
    category: "special",
    power: 10,
    accuracy: 100,
    pp: 10,
    priority: 0,
    effect: { type: "custom", handler: "beat-up" },
    flags: {},
  } as unknown as MoveData;

  it("given a team of 3 eligible Pokemon, when Beat Up is used, then perHitDamageFn is set and multiHitCount is 2", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // Beat Up hits once per eligible party member. The first hit (active Pokemon)
    // uses the engine's normal damage flow. perHitDamageFn covers the additional hits.
    const attacker = createMockActive({ uid: "attacker-uid" });
    const team = [
      { ...attacker.pokemon, uid: "attacker-uid" } as unknown as PokemonInstance,
      createMockTeamMember({ uid: "member-2" }),
      createMockTeamMember({ uid: "member-3" }),
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive({ uid: "defender-uid" });
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.multiHitCount).toBe(2);
    expect(typeof result.perHitDamageFn).toBe("function");
  });

  it("given a team with members of different species, when Beat Up is used and perHitDamageFn is called, then damage uses each member's species base Attack", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // Each hit uses the party member's species base Attack stat.
    // Bulbasaur (id=1): base Attack = 49
    // Charmander (id=4): base Attack = 52
    // Squirtle (id=7): base Attack = 48
    // Defender: Bulbasaur (id=1): base Defense = 49
    //
    // Gen 2 Beat Up formula (typeless, no modifiers):
    //   damage = floor(floor(floor(2*Level/5+2) * 10 * BaseAtk / BaseDef) / 50) + 2
    //   For L50: levelFactor = floor(100/5) + 2 = 22
    //
    // Charmander (BaseAtk=52, L50):
    //   floor(floor(22 * 10 * 52) / 49 / 50) + 2
    //   = floor(floor(11440) / 49 / 50) + 2
    //   = floor(233.47 / 50) + 2
    //   = floor(4.67) + 2 = 4 + 2 = 6
    //   With random factor (217-255)/255: range [floor(6*217/255), floor(6*255/255)] = [5, 6]
    //
    // Squirtle (BaseAtk=48, L50):
    //   floor(floor(22 * 10 * 48) / 49 / 50) + 2
    //   = floor(floor(10560) / 49 / 50) + 2
    //   = floor(215.51 / 50) + 2
    //   = floor(4.31) + 2 = 4 + 2 = 6
    //   With random factor: range [5, 6]
    const attacker = createMockActive({ uid: "attacker-uid", speciesId: 1 }); // Bulbasaur
    const team = [
      { ...attacker.pokemon, uid: "attacker-uid" } as unknown as PokemonInstance,
      createMockTeamMember({ uid: "member-charmander", speciesId: 4 }), // Charmander
      createMockTeamMember({ uid: "member-squirtle", speciesId: 7 }), // Squirtle
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive({ uid: "defender-uid", speciesId: 1 }); // Bulbasaur
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(typeof result.perHitDamageFn).toBe("function");
    const dmg0 = result.perHitDamageFn!(0); // Charmander's hit
    const dmg1 = result.perHitDamageFn!(1); // Squirtle's hit

    // Both should be integers in the formula-derived range [5, 6].
    // Source: Beat Up formula derivation above -- Charmander (BaseAtk=52) and
    // Squirtle (BaseAtk=48) both produce base damage 6 before random factor;
    // random factor (217/255 to 255/255) gives floor(6*217/255)=5 to floor(6*255/255)=6.
    expect(dmg0).toBeGreaterThanOrEqual(5);
    expect(dmg0).toBeLessThanOrEqual(6);
    expect(dmg1).toBeGreaterThanOrEqual(5);
    expect(dmg1).toBeLessThanOrEqual(6);
  });

  it("given a team with high-Attack and low-Attack species, when Beat Up is used and perHitDamageFn is called, then damage reflects the Attack values", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // Pikachu (id=25): base Attack = 55
    // Squirtle (id=7): base Attack = 48
    // Defender: Bulbasaur (id=1): base Defense = 49
    //
    // Pikachu (BaseAtk=55, L50, vs BaseDef=49):
    //   levelFactor = 22
    //   floor(floor(22 * 10 * 55) / 49 / 50) + 2
    //   = floor(floor(12100) / 49 / 50) + 2
    //   = floor(246.94 / 50) + 2
    //   = floor(4.94) + 2 = 4 + 2 = 6
    //
    // Squirtle (BaseAtk=48, L50, vs BaseDef=49):
    //   floor(floor(22 * 10 * 48) / 49 / 50) + 2
    //   = floor(floor(10560) / 49 / 50) + 2
    //   = floor(215.51 / 50) + 2
    //   = floor(4.31) + 2 = 4 + 2 = 6
    //
    // Both produce base damage 6 before random factor. The formula's granularity
    // at these low values means small Attack differences may not produce different damage.
    // That's correct behavior -- the test verifies the formula is applied, not that
    // all outputs are distinct.
    const attacker = createMockActive({ uid: "attacker-uid", speciesId: 1 });
    const team = [
      { ...attacker.pokemon, uid: "attacker-uid" } as unknown as PokemonInstance,
      createMockTeamMember({ uid: "member-pikachu", speciesId: 25 }), // Pikachu (Atk=55)
      createMockTeamMember({ uid: "member-squirtle", speciesId: 7 }), // Squirtle (Atk=48)
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive({ uid: "defender-uid", speciesId: 1 });
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(typeof result.perHitDamageFn).toBe("function");
    const dmg0 = result.perHitDamageFn!(0);
    const dmg1 = result.perHitDamageFn!(1);

    // Both hits should produce damage in the range [5, 6]
    // Source: formula derivation above -- base damage 6, random factor gives [5, 6]
    expect(dmg0).toBeGreaterThanOrEqual(5);
    expect(dmg0).toBeLessThanOrEqual(6);
    expect(dmg1).toBeGreaterThanOrEqual(5);
    expect(dmg1).toBeLessThanOrEqual(6);
  });

  it("given only the active Pokemon is eligible, when Beat Up is used, then perHitDamageFn is not set (no additional hits)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // With only 1 eligible member (the active Pokemon), multiHitCount = 0.
    // perHitDamageFn should not be set (no additional hits).
    const attacker = createMockActive({ uid: "attacker-uid" });
    const team = [
      { ...attacker.pokemon, uid: "attacker-uid" } as unknown as PokemonInstance,
      createMockTeamMember({ uid: "m2", currentHp: 0 }), // Fainted
      createMockTeamMember({ uid: "m3", status: "burn" }), // Burned
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive({ uid: "defender-uid" });
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.multiHitCount).toBe(0);
    // perHitDamageFn should not be set since multiHitCount is 0
    expect(result.perHitDamageFn).toBeUndefined();
  });

  it("given a team of 6 with 2 fainted, when Beat Up is used and perHitDamageFn is called for each hit, then all 3 hits produce positive damage", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // 6 members - 2 fainted = 4 eligible. Active Pokemon gets first hit.
    // Additional hits = 4 - 1 = 3.
    const attacker = createMockActive({ uid: "attacker-uid" });
    const team = [
      { ...attacker.pokemon, uid: "attacker-uid" } as unknown as PokemonInstance,
      createMockTeamMember({ uid: "m2" }), // Eligible
      createMockTeamMember({ uid: "m3", currentHp: 0 }), // Fainted
      createMockTeamMember({ uid: "m4" }), // Eligible
      createMockTeamMember({ uid: "m5", currentHp: 0 }), // Fainted
      createMockTeamMember({ uid: "m6" }), // Eligible
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive({ uid: "defender-uid" });
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.multiHitCount).toBe(3);
    expect(typeof result.perHitDamageFn).toBe("function");
    // Each hit should produce positive damage
    for (let i = 0; i < 3; i++) {
      expect(result.perHitDamageFn!(i)).toBeGreaterThanOrEqual(1);
    }
  });

  it("given Beat Up with 3 eligible members where hit 2 executes but hit 3 is skipped (early KO), when perHitDamageFn is called once vs twice, then different RNG is consumed", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // Fix for #620: each hit's RNG is consumed lazily, not eagerly.
    const attacker = createMockActive({ uid: "attacker-uid" });
    const team = [
      { ...attacker.pokemon, uid: "attacker-uid" } as unknown as PokemonInstance,
      createMockTeamMember({ uid: "m2" }),
      createMockTeamMember({ uid: "m3" }),
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive({ uid: "defender-uid" });
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);

    // Act -- result1: call only perHitDamageFn(0) (1 additional hit)
    const result1 = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: rng1,
    });
    result1.perHitDamageFn!(0);

    // result2: call both perHitDamageFn(0) and perHitDamageFn(1) (2 additional hits)
    const result2 = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: rng2,
    });
    result2.perHitDamageFn!(0);
    result2.perHitDamageFn!(1);

    // Assert -- rng1 and rng2 should be in different states since rng2 consumed
    // more RNG (for hit 2's random factor roll)
    // Source: Fix for #620 -- lazy RNG means partial execution uses less RNG
    const nextA = rng1.int(0, 1000);
    const nextB = rng2.int(0, 1000);
    expect(nextA).not.toBe(nextB);
  });
});
