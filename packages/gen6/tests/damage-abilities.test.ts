import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS, CORE_TYPE_IDS, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
  createGen6DataManager,
} from "../src";
import { calculateGen6Damage } from "../src/Gen6DamageCalc";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

const dataManager = createGen6DataManager();

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
  gender?: "male" | "female" | "genderless";
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
      speciesId: overrides.speciesId ?? GEN6_SPECIES_IDS.bulbasaur,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: GEN6_NATURE_IDS.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? GEN6_ABILITY_IDS.none,
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: (overrides.gender ?? "male") as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: GEN6_ITEM_IDS.pokeBall,
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
    types: overrides.types ?? [CORE_TYPE_IDS.psychic],
    ability: overrides.ability ?? GEN6_ABILITY_IDS.none,
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

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  format?: string;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
    generation: 6,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? dataManager.getMove(GEN6_MOVE_IDS.tackle),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// Tough Claws (contact moves get ~1.3x boost)
// Source: Showdown data/abilities.ts -- toughclaws: onBasePowerPriority 21,
//   this.chainModify([5325, 4096])  (5325/4096 ≈ 1.3x)
// ---------------------------------------------------------------------------
describe("Tough Claws", () => {
  it("given a contact move with Tough Claws, when calculating damage, then base power is boosted by 5325/4096", () => {
    // Arrange: Tough Claws attacker using a contact physical move
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.toughClaws, types: [CORE_TYPE_IDS.dragon] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const contactMove = dataManager.getMove(GEN6_MOVE_IDS.dragonClaw);

    // Baseline: same setup without Tough Claws
    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.dragon] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: contactMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: contactMove,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
    // With the same random roll, damage should scale by pokeRound(basePower, 5325)/basePower
    // The boosted power = pokeRound(80, 5325) = floor((80*5325 + 2047) / 4096) = floor(428047/4096) = 104
    // So the ratio should be approximately 104/80 = 1.3x
    expect(resultWithAbility.damage).toBeGreaterThan(resultWithout.damage);

    // Derive the expected damage manually:
    // Level 50, attack=100, defense=100, power=80 (unboosted) or 104 (boosted)
    // levelFactor = floor(2*50/5) + 2 = 22
    // baseDamage = floor(floor(22 * power * 100 / 100) / 50) + 2
    // Without: floor(22 * 80 / 50) + 2 = floor(35.2) + 2 = 35 + 2 = 37
    //   (wait, that's wrong -- need to calc with floor(22 * 80 * 100 / 100) / 50)
    //   = floor(22*80/50) + 2? No: floor(floor(22 * 80 * 100 / 100) / 50) + 2
    //   = floor(floor(176000/100)/50) + 2 = floor(1760/50) + 2 = floor(35.2) + 2 = 35 + 2 = 37
    // But this includes STAB (dragon move + dragon type). STAB = 1.5x.
    // Without boost: damage starts at 37
    //   After random roll (seed=100): we'd need to check the exact roll.
    //   Instead, verify the ratio between the two damages is approximately 1.3x.
    //
    // Source: inline formula derivation using Showdown's modifier math
    const ratio = resultWithAbility.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.3, 1);
  });

  it("given a non-contact move with Tough Claws, when calculating damage, then no boost is applied", () => {
    // Arrange: Tough Claws attacker using a non-contact special move
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.toughClaws, types: [CORE_TYPE_IDS.dragon] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const nonContactMove = dataManager.getMove(GEN6_MOVE_IDS.dragonPulse);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.dragon] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: nonContactMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: nonContactMove,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- toughclaws only activates for contact moves
    expect(resultWithAbility.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// Strong Jaw (bite moves get 1.5x boost)
// Source: Showdown data/abilities.ts -- strongjaw: onBasePowerPriority 19,
//   this.chainModify(1.5) for bite moves (6144/4096)
// ---------------------------------------------------------------------------
describe("Strong Jaw", () => {
  it("given a bite move with Strong Jaw, when calculating damage, then base power is boosted by 6144/4096 (1.5x)", () => {
    // Arrange: Strong Jaw attacker using Crunch (bite move)
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.strongJaw, types: [CORE_TYPE_IDS.dark] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const crunch = dataManager.getMove(GEN6_MOVE_IDS.crunch);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.dark] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: crunch, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: crunch,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5) = 6144/4096
    // boostedPower = pokeRound(80, 6144) = floor((80*6144 + 2047)/4096) = floor(493567/4096) = 120
    // Ratio: 120/80 = 1.5x
    const ratio = resultWithAbility.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
    expect(resultWithAbility.damage).toBeGreaterThan(resultWithout.damage);
  });

  it("given a non-bite move with Strong Jaw, when calculating damage, then no boost is applied", () => {
    // Arrange: Strong Jaw attacker using a non-bite move (Tackle)
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.strongJaw, types: [CORE_TYPE_IDS.normal] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.normal] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: tackle,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- strongjaw only activates for bite flag moves
    expect(resultWithAbility.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// Mega Launcher (pulse moves get 1.5x boost)
// Source: Showdown data/abilities.ts -- megalauncher: onBasePowerPriority 19,
//   this.chainModify(1.5) for pulse moves (6144/4096)
// ---------------------------------------------------------------------------
describe("Mega Launcher", () => {
  it("given a pulse move with Mega Launcher, when calculating damage, then base power is boosted by 6144/4096 (1.5x)", () => {
    // Arrange: Mega Launcher attacker using Aura Sphere (pulse move)
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.megaLauncher, types: [CORE_TYPE_IDS.fighting] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const auraSphere = dataManager.getMove(GEN6_MOVE_IDS.auraSphere);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.fighting] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: auraSphere, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: auraSphere,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5) = 6144/4096
    // boostedPower = pokeRound(80, 6144) = 120. Ratio = 1.5x
    const ratio = resultWithAbility.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
    expect(resultWithAbility.damage).toBeGreaterThan(resultWithout.damage);
  });

  it("given Dark Pulse (pulse move) with Mega Launcher, when calculating damage, then 1.5x boost is applied", () => {
    // Arrange: Mega Launcher attacker using Dark Pulse
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.megaLauncher, types: [CORE_TYPE_IDS.dark] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const darkPulse = dataManager.getMove(GEN6_MOVE_IDS.darkPulse);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.dark] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: darkPulse, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: darkPulse,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5) for pulse moves
    const ratio = resultWithAbility.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(1.5, 1);
  });
});

// ---------------------------------------------------------------------------
// Aerilate (Normal moves become Flying + 1.3x base power boost)
// Source: Showdown data/abilities.ts -- aerilate: onModifyTypePriority -1,
//   change Normal to Flying, then onBasePowerPriority 23: chainModify([5325, 4096])
// ---------------------------------------------------------------------------
describe("Aerilate", () => {
  it("given a Normal move with Aerilate vs a Fighting defender, when calculating damage, then type becomes Flying (super effective) and power gets 1.3x boost", () => {
    // Arrange: Aerilate attacker using a Normal-type move against Fighting defender
    // Flying is super-effective vs Fighting (2x), Normal is neutral (1x)
    // This proves the type conversion happened
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.aerilate, types: [CORE_TYPE_IDS.flying] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.fighting] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- aerilate converts Normal -> Flying
    // Flying vs Fighting = 2x super effective
    expect(resultWithAbility.effectiveness).toBe(2);

    // Verify the power boost by comparing with a baseline
    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.flying] });
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: tackle,
        seed: 100,
      }),
      typeChart,
    );

    // Without Aerilate: Normal vs Fighting = 1x (neutral)
    expect(resultWithout.effectiveness).toBe(1);

    // Source: Showdown data/abilities.ts -- aerilate: type change + 5325/4096 boost
    // With Aerilate: 1.3x power * 1.5x STAB * 2.0x SE vs 1.0x (no STAB, neutral)
    // Ratio should be approximately 1.3 * 1.5 * 2.0 = 3.9x
    const ratio = resultWithAbility.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(3.9, 0);
  });

  it("given a non-Normal move with Aerilate, when calculating damage, then no type change or boost is applied", () => {
    // Arrange: Aerilate attacker using a Fire-type move (not Normal)
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.aerilate, types: [CORE_TYPE_IDS.flying, CORE_TYPE_IDS.fire] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const flameCharge = dataManager.getMove(GEN6_MOVE_IDS.flameCharge);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.flying, CORE_TYPE_IDS.fire] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: flameCharge, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: flameCharge,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- -ate abilities only affect Normal-type moves
    expect(resultWithAbility.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// Pixilate (Normal moves become Fairy + 1.3x base power boost)
// Source: Showdown data/abilities.ts -- pixilate: same as aerilate but Normal -> Fairy
// ---------------------------------------------------------------------------
describe("Pixilate", () => {
  it("given a Normal move with Pixilate, when calculating damage, then type becomes Fairy and base power gets 1.3x boost", () => {
    // Arrange: Pixilate attacker (Fairy type) using a Normal-type move
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.pixilate, types: [CORE_TYPE_IDS.fairy] });
    // Use a Dragon defender: Fairy is super-effective vs Dragon (2x)
    // This proves the type change happened (Normal would be neutral vs Dragon)
    const defender = makeActive({ types: [CORE_TYPE_IDS.dragon] });
    const hyperVoice = dataManager.getMove(GEN6_MOVE_IDS.hyperVoice);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.fairy] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: hyperVoice, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: hyperVoice,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- pixilate: Normal -> Fairy + 5325/4096 boost
    // With Pixilate: Fairy type (2x SE vs Dragon, STAB), power 90 * 1.3 = 117 (pokeRound)
    // Without: Normal type (1x vs Dragon, no STAB), power 90
    // Ratio: (117/90) * 1.5 (STAB) * 2.0 (SE) / (1.0 * 1.0) = ~3.9x
    expect(resultWithAbility.damage).toBeGreaterThan(resultWithout.damage);
    // Type effectiveness should be 2 (Fairy vs Dragon is super effective)
    expect(resultWithAbility.effectiveness).toBe(2);
    // Without ability: Normal vs Dragon is neutral (1x)
    expect(resultWithout.effectiveness).toBe(1);
  });

  it("given a non-Normal move with Pixilate, when calculating damage, then no type change or boost is applied", () => {
    // Arrange: Pixilate attacker using a Fire-type move (not Normal)
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.pixilate, types: [CORE_TYPE_IDS.fairy, CORE_TYPE_IDS.fire] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const flamethrower = dataManager.getMove(GEN6_MOVE_IDS.flamethrower);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.fairy, CORE_TYPE_IDS.fire] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: flamethrower, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: flamethrower,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- pixilate only affects Normal-type moves
    expect(resultWithAbility.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// Refrigerate (Normal moves become Ice + 1.3x base power boost)
// Source: Showdown data/abilities.ts -- refrigerate: same as aerilate but Normal -> Ice
// ---------------------------------------------------------------------------
describe("Refrigerate", () => {
  it("given a Normal move with Refrigerate, when calculating damage, then type becomes Ice and base power gets 1.3x boost", () => {
    // Arrange: Refrigerate attacker (Ice type) using a Normal-type move
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.refrigerate, types: [CORE_TYPE_IDS.ice] });
    // Use a Dragon defender: Ice is super-effective vs Dragon (2x)
    const defender = makeActive({ types: [CORE_TYPE_IDS.dragon] });
    const tackle = dataManager.getMove(GEN6_MOVE_IDS.tackle);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.ice] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: tackle, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: tackle,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- refrigerate: Normal -> Ice + 5325/4096 boost
    // With Refrigerate: Ice type (2x SE vs Dragon, STAB), power boosted 1.3x
    // Without: Normal type (1x vs Dragon, no STAB)
    expect(resultWithAbility.damage).toBeGreaterThan(resultWithout.damage);
    expect(resultWithAbility.effectiveness).toBe(2); // Ice vs Dragon = SE
    expect(resultWithout.effectiveness).toBe(1); // Normal vs Dragon = neutral
  });

  it("given a non-Normal move with Refrigerate, when calculating damage, then no type change or boost is applied", () => {
    // Arrange: Refrigerate attacker using a Water-type move (not Normal)
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.refrigerate, types: [CORE_TYPE_IDS.ice, CORE_TYPE_IDS.water] });
    const defender = makeActive({ types: [CORE_TYPE_IDS.normal] });
    const surf = dataManager.getMove(GEN6_MOVE_IDS.surf);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.ice, CORE_TYPE_IDS.water] });

    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: surf, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: surf,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- refrigerate only affects Normal-type moves
    expect(resultWithAbility.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// Interaction: Tough Claws does not boost non-contact moves
// Interaction: -ate abilities don't change non-Normal moves
// Interaction: Mold Breaker does not suppress Tough Claws (attacker ability)
// ---------------------------------------------------------------------------
describe("Ability interactions", () => {
  it("given Tough Claws attacker vs Mold Breaker defender, when calculating damage with a contact move, then Tough Claws still boosts (attacker ability, not suppressed)", () => {
    // Mold Breaker only suppresses defender's abilities, not attacker's own
    const attacker = makeActive({ ability: GEN6_ABILITY_IDS.toughClaws, types: [CORE_TYPE_IDS.dragon] });
    const defender = makeActive({ ability: GEN6_ABILITY_IDS.moldBreaker, types: [CORE_TYPE_IDS.normal] });
    const contactMove = dataManager.getMove(GEN6_MOVE_IDS.dragonClaw);

    const baselineAttacker = makeActive({ ability: CORE_ABILITY_IDS.none, types: [CORE_TYPE_IDS.dragon] });
    const resultWithAbility = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: contactMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      makeDamageContext({
        attacker: baselineAttacker,
        defender,
        move: contactMove,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown -- Mold Breaker suppresses target ability, not user ability
    expect(resultWithAbility.damage).toBeGreaterThan(resultWithout.damage);
  });
});
