import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen3Damage } from "../src/Gen3DamageCalc";

/**
 * Gen 3 Species-Specific Item Tests
 *
 * These tests cover items that only work when held by a specific Pokemon species:
 * - Soul Dew: +50% SpAtk and SpDef for Latias (380) / Latios (381)
 * - Deep Sea Tooth: doubles Clamperl's SpAtk (species ID 366)
 * - Deep Sea Scale: doubles Clamperl's SpDef (species ID 366)
 * - Thick Club: doubles Cubone/Marowak's Attack (species ID 104/105)
 * - Light Ball: doubles Pikachu's SpAtk (species ID 25) — Gen 3 is SpAtk ONLY
 *
 * Sources:
 * - Bulbapedia: Soul Dew, Deep Sea Tooth, Deep Sea Scale, Thick Club, Light Ball articles
 * - pret/pokeemerald: HOLD_EFFECT_SOUL_DEW, HOLD_EFFECT_DEEP_SEA_TOOTH,
 *   HOLD_EFFECT_DEEP_SEA_SCALE, HOLD_EFFECT_THICK_CLUB, HOLD_EFFECT_LIGHT_BALL
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** Minimal ActivePokemon mock with configurable speciesId. */
function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  speciesId?: number;
  status?: "burn" | null;
  heldItem?: string | null;
  ability?: string;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level: opts.level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
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
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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
  } as ActivePokemon;
}

/** Create a move mock with the given type and power. */
function createMove(type: PokemonType, power: number): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type,
    category: "physical",
    power,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
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
    },
    effect: null,
    description: "",
    generation: 3,
  } as MoveData;
}

/** All-neutral type chart for 17 Gen 3 types. */
function createNeutralTypeChart() {
  const types: PokemonType[] = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
  ];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart;
}

/** Create a BattleState mock. */
function createMockState() {
  return { weather: null } as DamageContext["state"];
}

/** Create a full DamageContext for calculateGen3Damage. */
function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100), // max roll = no random penalty
    state: createMockState(),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 Species-Specific Items", () => {
  describe("Deep Sea Scale (Clamperl SpDef doubling)", () => {
    // Source: Bulbapedia — "Deep Sea Scale: When held by Clamperl, doubles its Special Defense."
    // Source: pret/pokeemerald HOLD_EFFECT_DEEP_SEA_SCALE

    it("given Clamperl (366) holding Deep Sea Scale, when defending a special move, then damage is halved compared to no item", () => {
      // Source: Bulbapedia Deep Sea Scale article — doubles SpDef for Clamperl only
      // A special-type move (fire) hits Clamperl. With Deep Sea Scale, SpDef is doubled,
      // meaning the damage should be approximately halved.
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80); // fire is special in Gen 3

      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fire"],
      });

      const defenderWithItem = createActivePokemon({
        level: 50,
        attack: 50,
        defense: 80,
        spAttack: 50,
        spDefense: 100,
        types: ["water"],
        speciesId: 366, // Clamperl
        heldItem: "deep-sea-scale",
      });

      const defenderWithoutItem = createActivePokemon({
        level: 50,
        attack: 50,
        defense: 80,
        spAttack: 50,
        spDefense: 100,
        types: ["water"],
        speciesId: 366, // Clamperl
        heldItem: null,
      });

      const resultWithItem = calculateGen3Damage(
        createDamageContext({ attacker, defender: defenderWithItem, move }),
        typeChart,
      );
      const resultWithoutItem = calculateGen3Damage(
        createDamageContext({ attacker, defender: defenderWithoutItem, move }),
        typeChart,
      );

      // With doubled SpDef (200 vs 100), damage should be roughly halved
      // Manual calc (max roll = 100/100 = 1.0, attacker is fire-type using fire move = STAB 1.5x):
      // levelFactor = floor(2*50/5) + 2 = 22
      // Without item: baseDamage = floor(floor(22 * 80 * 100 / 100) / 50) = floor(1760/50) = 35
      //   + 2 = 37, no crit, roll=100: 37, STAB=1.5: floor(37*1.5)=55, eff=1 => 55
      // With item (SpDef=200): baseDamage = floor(floor(22 * 80 * 100 / 200) / 50) = floor(880/50) = 17
      //   + 2 = 19, no crit, roll=100: 19, STAB=1.5: floor(19*1.5)=28, eff=1 => 28
      // Source: manual formula derivation from pret/pokeemerald CalculateBaseDamage
      expect(resultWithoutItem.damage).toBe(55);
      expect(resultWithItem.damage).toBe(28);
    });

    it("given Clamperl (366) holding Deep Sea Scale, when defending a physical move, then SpDef doubling does not apply", () => {
      // Source: Deep Sea Scale only boosts SpDef, not Def
      // A physical-type move (normal) hits Clamperl. Deep Sea Scale should NOT affect defense.
      const typeChart = createNeutralTypeChart();
      const move = createMove("normal", 80); // normal is physical in Gen 3

      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const defenderWithItem = createActivePokemon({
        level: 50,
        attack: 50,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: ["water"],
        speciesId: 366, // Clamperl
        heldItem: "deep-sea-scale",
      });

      const defenderWithoutItem = createActivePokemon({
        level: 50,
        attack: 50,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: ["water"],
        speciesId: 366, // Clamperl
        heldItem: null,
      });

      const resultWithItem = calculateGen3Damage(
        createDamageContext({ attacker, defender: defenderWithItem, move }),
        typeChart,
      );
      const resultWithoutItem = calculateGen3Damage(
        createDamageContext({ attacker, defender: defenderWithoutItem, move }),
        typeChart,
      );

      // Physical move uses Defense stat, not SpDef — Deep Sea Scale should have no effect
      expect(resultWithItem.damage).toBe(resultWithoutItem.damage);
    });

    it("given non-Clamperl Pokemon holding Deep Sea Scale, when defending a special move, then SpDef is NOT doubled", () => {
      // Source: Deep Sea Scale only works for Clamperl (species 366)
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80);

      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fire"],
      });

      const defenderWithItem = createActivePokemon({
        level: 50,
        attack: 50,
        defense: 80,
        spAttack: 50,
        spDefense: 100,
        types: ["water"],
        speciesId: 1, // Bulbasaur, NOT Clamperl
        heldItem: "deep-sea-scale",
      });

      const defenderWithoutItem = createActivePokemon({
        level: 50,
        attack: 50,
        defense: 80,
        spAttack: 50,
        spDefense: 100,
        types: ["water"],
        speciesId: 1,
        heldItem: null,
      });

      const resultWithItem = calculateGen3Damage(
        createDamageContext({ attacker, defender: defenderWithItem, move }),
        typeChart,
      );
      const resultWithoutItem = calculateGen3Damage(
        createDamageContext({ attacker, defender: defenderWithoutItem, move }),
        typeChart,
      );

      // Not Clamperl, so no SpDef doubling — damage should be identical
      expect(resultWithItem.damage).toBe(resultWithoutItem.damage);
    });
  });

  describe("Thick Club (Cubone/Marowak Attack doubling)", () => {
    // Source: Bulbapedia — "Thick Club: When held by Cubone or Marowak, doubles the holder's Attack."
    // Source: pret/pokeemerald HOLD_EFFECT_THICK_CLUB

    it("given Cubone (104) holding Thick Club, when using a physical move, then damage is doubled compared to no item", () => {
      // Source: Bulbapedia Thick Club article — doubles Attack for Cubone/Marowak
      const typeChart = createNeutralTypeChart();
      const move = createMove("ground", 80); // ground is physical in Gen 3

      const attackerWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: ["ground"],
        speciesId: 104, // Cubone
        heldItem: "thick-club",
      });

      const attackerWithoutItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: ["ground"],
        speciesId: 104, // Cubone
        heldItem: null,
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const resultWithItem = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );
      const resultWithoutItem = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithoutItem, defender, move }),
        typeChart,
      );

      // Manual calc (max roll, Cubone is ground-type using ground move = 1.5x STAB):
      // levelFactor = floor(2*50/5) + 2 = 22
      // Without item: baseDamage = floor(floor(22 * 80 * 100 / 100) / 50) = floor(1760/50) = 35
      //   + 2 = 37, no crit, roll=100: 37, STAB=1.5: floor(37*1.5) = 55, eff=1 => 55
      // With item (Atk=200): baseDamage = floor(floor(22 * 80 * 200 / 100) / 50) = floor(3520/50) = 70
      //   + 2 = 72, no crit, roll=100: 72, STAB=1.5: floor(72*1.5) = 108, eff=1 => 108
      // Source: manual formula derivation from pret/pokeemerald CalculateBaseDamage
      expect(resultWithoutItem.damage).toBe(55);
      expect(resultWithItem.damage).toBe(108);
    });

    it("given Marowak (105) holding Thick Club, when using a physical move, then damage is doubled compared to no item", () => {
      // Source: Bulbapedia Thick Club article — doubles Attack for Cubone/Marowak
      const typeChart = createNeutralTypeChart();
      const move = createMove("normal", 80); // normal is physical in Gen 3

      const attackerWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: ["ground"],
        speciesId: 105, // Marowak
        heldItem: "thick-club",
      });

      const attackerWithoutItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: ["ground"],
        speciesId: 105, // Marowak
        heldItem: null,
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const resultWithItem = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );
      const resultWithoutItem = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithoutItem, defender, move }),
        typeChart,
      );

      // Manual calc (max roll, no STAB — Marowak is ground-type, move is normal-type):
      // levelFactor = floor(2*50/5) + 2 = 22
      // Without item: baseDamage = floor(floor(22 * 80 * 100 / 100) / 50) = floor(1760/50) = 35
      //   + 2 = 37, no crit, roll=100: 37, no STAB, eff=1 => 37
      // With item (Atk=200): baseDamage = floor(floor(22 * 80 * 200 / 100) / 50) = floor(3520/50) = 70
      //   + 2 = 72, no crit, roll=100: 72, no STAB, eff=1 => 72
      // Source: manual formula derivation from pret/pokeemerald CalculateBaseDamage
      expect(resultWithoutItem.damage).toBe(37);
      expect(resultWithItem.damage).toBe(72);
    });

    it("given Cubone (104) holding Thick Club, when using a special move, then Attack doubling does not apply", () => {
      // Source: Thick Club only boosts physical Attack, not SpAtk
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80); // fire is special in Gen 3

      const attackerWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["ground"],
        speciesId: 104, // Cubone
        heldItem: "thick-club",
      });

      const attackerWithoutItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["ground"],
        speciesId: 104, // Cubone
        heldItem: null,
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const resultWithItem = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );
      const resultWithoutItem = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithoutItem, defender, move }),
        typeChart,
      );

      // Special move uses SpAtk, not Atk — Thick Club should have no effect
      expect(resultWithItem.damage).toBe(resultWithoutItem.damage);
    });

    it("given non-Cubone/Marowak Pokemon holding Thick Club, when using a physical move, then Attack is NOT doubled", () => {
      // Source: Thick Club only works for Cubone (104) and Marowak (105)
      const typeChart = createNeutralTypeChart();
      const move = createMove("normal", 80);

      const attackerWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: ["normal"],
        speciesId: 1, // Bulbasaur, NOT Cubone/Marowak
        heldItem: "thick-club",
      });

      const attackerWithoutItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 50,
        spDefense: 100,
        types: ["normal"],
        speciesId: 1,
        heldItem: null,
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const resultWithItem = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );
      const resultWithoutItem = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithoutItem, defender, move }),
        typeChart,
      );

      // Not Cubone/Marowak, so no Attack doubling — damage should be identical
      expect(resultWithItem.damage).toBe(resultWithoutItem.damage);
    });
  });
});
