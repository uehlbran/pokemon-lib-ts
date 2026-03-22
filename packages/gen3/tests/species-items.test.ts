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
 * - Light Ball: doubles Pikachu's SpAtk (species ID 25) -- Gen 3 is SpAtk ONLY
 *
 * Sources:
 * - Bulbapedia: Soul Dew, Deep Sea Tooth, Deep Sea Scale, Thick Club, Light Ball articles
 * - pret/pokeemerald src/pokemon.c:3106-3372 CalculateBaseDamage:
 *   HOLD_EFFECT_SOUL_DEW, HOLD_EFFECT_DEEP_SEA_TOOTH,
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
  // =========================================================================
  // Soul Dew -- Latias/Latios SpAtk 1.5x and SpDef 1.5x (#134)
  // =========================================================================

  describe("Soul Dew (Latias/Latios SpAtk and SpDef 1.5x boost)", () => {
    // Source: Bulbapedia Soul Dew -- "Raises Latias's and Latios's Sp. Atk and Sp. Def by 50%."
    // Source: pret/pokeemerald HOLD_EFFECT_SOUL_DEW -- floor(stat * 150 / 100)

    it("given Latias (380) holding Soul Dew, when using a special move, then damage reflects 1.5x SpAtk", () => {
      // Source: Bulbapedia Soul Dew, pret/pokeemerald HOLD_EFFECT_SOUL_DEW
      //
      // Setup: L50, SpAtk=200, Def=100, Power=80, Fire type (special in Gen 3)
      // Without item: rawStat = 200
      //   levelFactor = floor(2*50/5)+2 = 22
      //   baseDamage = floor(floor((22*80*200)/100)/50)+2 = floor(3520/50)+2 = 70+2 = 72
      // With Soul Dew: rawStat = floor(200*150/100) = 300
      //   baseDamage = floor(floor((22*80*300)/100)/50)+2 = floor(5280/50)+2 = 105+2 = 107
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80); // fire is special in Gen 3

      const attackerNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 200,
        spDefense: 200,
        types: ["dragon", "psychic"],
        speciesId: 380, // Latias
        heldItem: null,
      });

      const attackerWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 200,
        spDefense: 200,
        types: ["dragon", "psychic"],
        speciesId: 380, // Latias
        heldItem: "soul-dew",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker: attackerNoItem, defender, move }),
        typeChart,
      );
      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation above
      expect(resultWithout.damage).toBe(72);
      expect(resultWith.damage).toBe(107);
    });

    it("given Latios (381) holding Soul Dew, when using a special move with different stats, then damage reflects 1.5x SpAtk", () => {
      // Source: Bulbapedia Soul Dew -- applies to both Latias and Latios
      // Source: pret/pokeemerald HOLD_EFFECT_SOUL_DEW
      //
      // Setup: L70, SpAtk=250, SpDef(defender)=120, Power=90, Water type (special)
      // Without item: rawStat = 250
      //   levelFactor = floor(2*70/5)+2 = 30
      //   baseDamage = floor(floor((30*90*250)/120)/50)+2
      //             = floor(floor(675000/120)/50)+2
      //             = floor(5625/50)+2 = 112+2 = 114
      // With Soul Dew: rawStat = floor(250*150/100) = 375
      //   baseDamage = floor(floor((30*90*375)/120)/50)+2
      //             = floor(floor(1012500/120)/50)+2
      //             = floor(8437/50)+2 = 168+2 = 170
      const typeChart = createNeutralTypeChart();
      const move = createMove("water", 90); // water is special in Gen 3

      const attackerNoItem = createActivePokemon({
        level: 70,
        attack: 100,
        defense: 100,
        spAttack: 250,
        spDefense: 200,
        types: ["dragon", "psychic"],
        speciesId: 381, // Latios
        heldItem: null,
      });

      const attackerWithItem = createActivePokemon({
        level: 70,
        attack: 100,
        defense: 100,
        spAttack: 250,
        spDefense: 200,
        types: ["dragon", "psychic"],
        speciesId: 381, // Latios
        heldItem: "soul-dew",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 120,
        types: ["normal"],
      });

      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker: attackerNoItem, defender, move }),
        typeChart,
      );
      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation above
      expect(resultWithout.damage).toBe(114);
      expect(resultWith.damage).toBe(170);
    });

    it("given Latias (380) holding Soul Dew as defender, when hit by a special move, then damage is reduced by 1.5x SpDef", () => {
      // Source: Bulbapedia Soul Dew -- SpDef boost applies when defending
      // Source: pret/pokeemerald HOLD_EFFECT_SOUL_DEW
      //
      // Setup: Attacker L50 (normal-type, no STAB), SpAtk=200, Latias SpDef=200, Power=80,
      //   Fire type (special)
      // Without Soul Dew: rawDef = 200
      //   baseDamage = floor(floor((22*80*200)/200)/50)+2 = floor(1760/50)+2 = 35+2 = 37
      // With Soul Dew: rawDef = floor(200*150/100) = 300
      //   baseDamage = floor(floor((22*80*200)/300)/50)+2
      //             = floor(floor(352000/300)/50)+2
      //             = floor(1173/50)+2 = 23+2 = 25
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80);

      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 200,
        spDefense: 100,
        types: ["normal"], // NOT fire-type -- avoids STAB
      });

      const defenderNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 200,
        spDefense: 200,
        types: ["dragon", "psychic"],
        speciesId: 380, // Latias
        heldItem: null,
      });

      const defenderWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 200,
        spDefense: 200,
        types: ["dragon", "psychic"],
        speciesId: 380, // Latias
        heldItem: "soul-dew",
      });

      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker, defender: defenderNoItem, move }),
        typeChart,
      );
      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker, defender: defenderWithItem, move }),
        typeChart,
      );

      // Source: inline formula derivation above
      expect(resultWithout.damage).toBe(37);
      expect(resultWith.damage).toBe(25);
    });

    it("given non-Lati holding Soul Dew, when using a special move, then no SpAtk boost", () => {
      // Source: Bulbapedia Soul Dew -- species-gated to Latias (380) / Latios (381)
      //
      // Setup: Bulbasaur (1) holding Soul Dew, L50, SpAtk=200, Def=100, Power=80
      // Expected: no boost, baseDamage = floor(floor((22*80*200)/100)/50)+2 = 72
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80);

      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 200,
        spDefense: 200,
        types: ["grass", "poison"],
        speciesId: 1, // Bulbasaur, NOT Latias/Latios
        heldItem: "soul-dew",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const result = calculateGen3Damage(
        createDamageContext({ attacker, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation -- no boost, same as without item
      expect(result.damage).toBe(72);
    });

    it("given Latias holding Soul Dew, when using a physical move, then no boost", () => {
      // Source: Bulbapedia Soul Dew -- boosts Sp. Atk and Sp. Def only
      //
      // Setup: Latias L50, Atk=200, Def=100, Power=80, Normal type (physical in Gen 3)
      // Expected: no boost on physical, baseDamage = 72
      const typeChart = createNeutralTypeChart();
      const move = createMove("normal", 80); // Normal is physical in Gen 3

      const attacker = createActivePokemon({
        level: 50,
        attack: 200,
        defense: 100,
        spAttack: 200,
        spDefense: 200,
        types: ["dragon", "psychic"],
        speciesId: 380, // Latias
        heldItem: "soul-dew",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const result = calculateGen3Damage(
        createDamageContext({ attacker, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation -- physical uses Atk, Soul Dew doesn't boost it
      expect(result.damage).toBe(72);
    });
  });

  // =========================================================================
  // Deep Sea Tooth -- Clamperl SpAtk 2x (#135)
  // =========================================================================

  describe("Deep Sea Tooth (Clamperl SpAtk doubling)", () => {
    // Source: Bulbapedia -- "Deep Sea Tooth: When held by Clamperl, doubles its Special Attack."
    // Source: pret/pokeemerald HOLD_EFFECT_DEEP_SEA_TOOTH -- spAttack *= 2

    it("given Clamperl (366) holding Deep Sea Tooth, when using a special move, then damage reflects 2x SpAtk", () => {
      // Source: Bulbapedia Deep Sea Tooth, pret/pokeemerald HOLD_EFFECT_DEEP_SEA_TOOTH
      //
      // Setup: L50, SpAtk=100, Def=100, Power=80, Fire type (special in Gen 3, no STAB)
      // Without item: rawStat = 100
      //   baseDamage = floor(floor((22*80*100)/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
      // With Deep Sea Tooth: rawStat = 100*2 = 200
      //   baseDamage = floor(floor((22*80*200)/100)/50)+2 = floor(3520/50)+2 = 70+2 = 72
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80); // fire is special in Gen 3, no STAB for Clamperl

      const attackerNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
        speciesId: 366, // Clamperl
        heldItem: null,
      });

      const attackerWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
        speciesId: 366, // Clamperl
        heldItem: "deep-sea-tooth",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker: attackerNoItem, defender, move }),
        typeChart,
      );
      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation above
      expect(resultWithout.damage).toBe(37);
      expect(resultWith.damage).toBe(72);
    });

    it("given Clamperl (366) holding Deep Sea Tooth with different stats, when using a special move, then 2x SpAtk applies", () => {
      // Source: Bulbapedia Deep Sea Tooth, pret/pokeemerald HOLD_EFFECT_DEEP_SEA_TOOTH
      //
      // Setup: L30, SpAtk=80, SpDef(defender)=120, Power=65, Fire type (special)
      // Without item: rawStat = 80
      //   levelFactor = floor(2*30/5)+2 = 14
      //   baseDamage = floor(floor((14*65*80)/120)/50)+2
      //             = floor(floor(72800/120)/50)+2
      //             = floor(606/50)+2 = 12+2 = 14
      // With Deep Sea Tooth: rawStat = 80*2 = 160
      //   baseDamage = floor(floor((14*65*160)/120)/50)+2
      //             = floor(floor(145600/120)/50)+2
      //             = floor(1213/50)+2 = 24+2 = 26
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 65); // fire is special in Gen 3

      const attackerNoItem = createActivePokemon({
        level: 30,
        attack: 60,
        defense: 100,
        spAttack: 80,
        spDefense: 100,
        types: ["water"],
        speciesId: 366, // Clamperl
        heldItem: null,
      });

      const attackerWithItem = createActivePokemon({
        level: 30,
        attack: 60,
        defense: 100,
        spAttack: 80,
        spDefense: 100,
        types: ["water"],
        speciesId: 366, // Clamperl
        heldItem: "deep-sea-tooth",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 120,
        types: ["normal"],
      });

      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker: attackerNoItem, defender, move }),
        typeChart,
      );
      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation above
      expect(resultWithout.damage).toBe(14);
      expect(resultWith.damage).toBe(26);
    });

    it("given non-Clamperl holding Deep Sea Tooth, when using a special move, then no SpAtk boost", () => {
      // Source: Bulbapedia Deep Sea Tooth -- species-gated to Clamperl (366)
      //
      // Setup: Bulbasaur (1) L50, SpAtk=100, Def=100, Power=80
      // Expected: baseDamage = 37 (no boost)
      const typeChart = createNeutralTypeChart();
      const move = createMove("water", 80);

      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["grass", "poison"],
        speciesId: 1, // Bulbasaur, NOT Clamperl
        heldItem: "deep-sea-tooth",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const result = calculateGen3Damage(
        createDamageContext({ attacker, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation -- no boost
      expect(result.damage).toBe(37);
    });
  });

  // =========================================================================
  // Light Ball -- Pikachu SpAtk 2x, Gen 3 SpAtk only (#137)
  // =========================================================================

  describe("Light Ball (Pikachu SpAtk doubling -- Gen 3 SpAtk only)", () => {
    // Source: Bulbapedia -- "Light Ball: When held by Pikachu, doubles its Special Attack. (Generation III)"
    // Source: pret/pokeemerald HOLD_EFFECT_LIGHT_BALL -- spAttack *= 2
    // NOTE: In Gen 3, Light Ball only boosts SpAtk. Attack boost was added in Gen 4.

    it("given Pikachu (25) holding Light Ball, when using a special move, then damage reflects 2x SpAtk", () => {
      // Source: Bulbapedia Light Ball, pret/pokeemerald HOLD_EFFECT_LIGHT_BALL
      //
      // Setup: L50, SpAtk=100, Def=100, Power=80, Fire type (special in Gen 3, no STAB)
      // Without item: rawStat = 100
      //   baseDamage = floor(floor((22*80*100)/100)/50)+2 = floor(1760/50)+2 = 35+2 = 37
      // With Light Ball: rawStat = 100*2 = 200
      //   baseDamage = floor(floor((22*80*200)/100)/50)+2 = floor(3520/50)+2 = 70+2 = 72
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80); // fire is special in Gen 3, no STAB for Pikachu

      const attackerNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["electric"],
        speciesId: 25, // Pikachu
        heldItem: null,
      });

      const attackerWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["electric"],
        speciesId: 25, // Pikachu
        heldItem: "light-ball",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker: attackerNoItem, defender, move }),
        typeChart,
      );
      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation above
      expect(resultWithout.damage).toBe(37);
      expect(resultWith.damage).toBe(72);
    });

    it("given Pikachu (25) holding Light Ball with different setup, when using a special move, then 2x SpAtk applies", () => {
      // Source: Bulbapedia Light Ball, pret/pokeemerald HOLD_EFFECT_LIGHT_BALL
      //
      // Setup: L25, SpAtk=60, SpDef(defender)=80, Power=40, Fire type (special)
      // Without item: rawStat = 60
      //   levelFactor = floor(2*25/5)+2 = 12
      //   baseDamage = floor(floor((12*40*60)/80)/50)+2
      //             = floor(floor(28800/80)/50)+2
      //             = floor(360/50)+2 = 7+2 = 9
      // With Light Ball: rawStat = 60*2 = 120
      //   baseDamage = floor(floor((12*40*120)/80)/50)+2
      //             = floor(floor(57600/80)/50)+2
      //             = floor(720/50)+2 = 14+2 = 16
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 40); // fire is special in Gen 3

      const attackerNoItem = createActivePokemon({
        level: 25,
        attack: 50,
        defense: 50,
        spAttack: 60,
        spDefense: 60,
        types: ["electric"],
        speciesId: 25, // Pikachu
        heldItem: null,
      });

      const attackerWithItem = createActivePokemon({
        level: 25,
        attack: 50,
        defense: 50,
        spAttack: 60,
        spDefense: 60,
        types: ["electric"],
        speciesId: 25, // Pikachu
        heldItem: "light-ball",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 80,
        types: ["normal"],
      });

      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker: attackerNoItem, defender, move }),
        typeChart,
      );
      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation above
      expect(resultWithout.damage).toBe(9);
      expect(resultWith.damage).toBe(16);
    });

    it("given Pikachu (25) holding Light Ball, when using a physical move, then NO boost (Gen 3 SpAtk only)", () => {
      // Source: Bulbapedia Light Ball -- "In Generation III, it doubles Special Attack only."
      // The Attack (physical) boost was added in Gen 4.
      //
      // Setup: L50, Atk=100, Def=100, Power=80, Normal type (physical in Gen 3)
      // Expected: no boost, baseDamage = 37
      const typeChart = createNeutralTypeChart();
      const move = createMove("normal", 80); // Normal is physical in Gen 3

      const attackerWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["electric"],
        speciesId: 25, // Pikachu
        heldItem: "light-ball",
      });

      const attackerNoItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["electric"],
        speciesId: 25, // Pikachu
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

      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker: attackerWithItem, defender, move }),
        typeChart,
      );
      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker: attackerNoItem, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation -- physical, no Light Ball boost in Gen 3
      expect(resultWith.damage).toBe(resultWithout.damage);
      expect(resultWith.damage).toBe(37);
    });

    it("given non-Pikachu holding Light Ball, when using a special move, then no SpAtk boost", () => {
      // Source: Bulbapedia Light Ball -- species-gated to Pikachu (25)
      //
      // Setup: Bulbasaur (1) L50, SpAtk=100, Def=100, Power=80
      // Expected: baseDamage = 37 (no boost)
      const typeChart = createNeutralTypeChart();
      const move = createMove("electric", 80);

      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["grass", "poison"],
        speciesId: 1, // Bulbasaur, NOT Pikachu
        heldItem: "light-ball",
      });

      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });

      const result = calculateGen3Damage(
        createDamageContext({ attacker, defender, move }),
        typeChart,
      );

      // Source: inline formula derivation -- no boost
      expect(result.damage).toBe(37);
    });
  });

  // =========================================================================
  // Deep Sea Scale -- Clamperl SpDef 2x
  // =========================================================================

  describe("Deep Sea Scale (Clamperl SpDef doubling)", () => {
    // Source: Bulbapedia -- "Deep Sea Scale: When held by Clamperl, doubles its Special Defense."
    // Source: pret/pokeemerald HOLD_EFFECT_DEEP_SEA_SCALE

    it("given Clamperl (366) holding Deep Sea Scale, when defending a special move, then damage is halved compared to no item", () => {
      // Source: Bulbapedia Deep Sea Scale article -- doubles SpDef for Clamperl only
      //
      // Setup: Attacker L50 (normal-type, no STAB), SpAtk=200, Clamperl SpDef=100, Power=80,
      //   Fire type (special in Gen 3)
      // Without item: rawDef = 100
      //   baseDamage = floor(floor((22*80*200)/100)/50)+2 = floor(3520/50)+2 = 70+2 = 72
      // With Deep Sea Scale: rawDef = 100*2 = 200
      //   baseDamage = floor(floor((22*80*200)/200)/50)+2 = floor(1760/50)+2 = 35+2 = 37
      const typeChart = createNeutralTypeChart();
      const move = createMove("fire", 80); // fire is special in Gen 3

      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 200,
        spDefense: 100,
        types: ["normal"], // NOT fire-type -- avoids STAB complicating the expected values
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

      // Source: inline formula derivation above
      expect(resultWithoutItem.damage).toBe(72);
      expect(resultWithItem.damage).toBe(37);
    });

    it("given Clamperl (366) holding Deep Sea Scale, when defending a physical move, then SpDef doubling does not apply", () => {
      // Source: Deep Sea Scale only boosts SpDef, not Def
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

      // Physical move uses Defense stat, not SpDef -- Deep Sea Scale should have no effect
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

      // Not Clamperl, so no SpDef doubling -- damage should be identical
      expect(resultWithItem.damage).toBe(resultWithoutItem.damage);
    });
  });

  // =========================================================================
  // Thick Club -- Cubone/Marowak Attack 2x
  // =========================================================================

  describe("Thick Club (Cubone/Marowak Attack doubling)", () => {
    // Source: Bulbapedia -- "Thick Club: When held by Cubone or Marowak, doubles the holder's Attack."
    // Source: pret/pokeemerald HOLD_EFFECT_THICK_CLUB

    it("given Cubone (104) holding Thick Club, when using a physical move, then damage is doubled compared to no item", () => {
      // Source: Bulbapedia Thick Club article -- doubles Attack for Cubone/Marowak
      //
      // Setup: L50, Atk=100, Def=100, Power=80, Ground type (physical in Gen 3), STAB
      // Without item: rawStat = 100
      //   baseDamage = floor(floor((22*80*100)/100)/50)+2 = 35+2 = 37
      //   STAB (ground-type using ground move) = floor(37*1.5) = 55
      // With Thick Club: rawStat = 100*2 = 200
      //   baseDamage = floor(floor((22*80*200)/100)/50)+2 = 70+2 = 72
      //   STAB = floor(72*1.5) = 108
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

      // Source: inline formula derivation above
      expect(resultWithoutItem.damage).toBe(55);
      expect(resultWithItem.damage).toBe(108);
    });

    it("given Marowak (105) holding Thick Club, when using a physical move, then damage is doubled compared to no item", () => {
      // Source: Bulbapedia Thick Club article -- doubles Attack for Cubone/Marowak
      //
      // Setup: L50, Atk=100, Def=100, Power=80, Normal type (physical), no STAB
      // Without item: baseDamage = 37, no STAB => 37
      // With Thick Club: baseDamage = 72, no STAB => 72
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

      // Source: inline formula derivation above
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

      // Special move uses SpAtk, not Atk -- Thick Club should have no effect
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

      // Not Cubone/Marowak, so no Attack doubling -- damage should be identical
      expect(resultWithItem.damage).toBe(resultWithoutItem.damage);
    });
  });

  // =========================================================================
  // Metal Powder -- Ditto (species 132) physical Defense ×2 (BUG-7)
  // =========================================================================

  describe("Metal Powder (Ditto species 132 physical Defense ×2)", () => {
    // Source: pret/pokeemerald src/pokemon.c:3197 —
    //   if (defenderHoldEffect == HOLD_EFFECT_METAL_POWDER && defender->species == SPECIES_DITTO)
    //     defense *= 2;
    // Note: only physical Defense is doubled; SpDef is unaffected.
    // BUG-7: Metal Powder was not implemented in Gen3DamageCalc.getDefenseStat.

    it("given Ditto (132) holding Metal Powder when taking a physical hit, then Defense is doubled (damage reduced)", () => {
      // Formula derivation (physical normal move, neutral type chart, fire-type attacker — no STAB):
      //   levelFactor = floor(2*50/5) + 2 = 22
      //   "normal" type move is physical in Gen 3; fire-type attacker has no STAB on normal move.
      //   Without Metal Powder (def=100):
      //     step2 = floor(22 * 80 * 100 / 100) = 1760; step3 = floor(1760/50) = 35; base = 37
      //     random roll = 100/100 = 1.0x → damage = 37
      //   With Metal Powder (def=200):
      //     step2 = floor(22 * 80 * 100 / 200) = 880; step3 = floor(880/50) = 17; base = 19
      //     random roll = 1.0x → damage = 19
      // Source: pret/pokeemerald src/pokemon.c:3197 — defense *= 2 for SPECIES_DITTO
      const typeChart = createNeutralTypeChart();
      const move = createMove("normal", 80); // Normal is physical in Gen 3

      const dittoWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        speciesId: 132, // Ditto
        heldItem: "metal-powder",
      });
      const dittoWithoutItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        speciesId: 132,
        heldItem: null,
      });
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fire"], // fire-type attacker → no STAB on normal move
      });

      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker, defender: dittoWithItem, move }),
        typeChart,
      );
      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker, defender: dittoWithoutItem, move }),
        typeChart,
      );

      expect(resultWith.damage).toBe(19);
      expect(resultWithout.damage).toBe(37);
    });

    it("given a non-Ditto (species 1) holding Metal Powder when taking a physical hit, then Defense is NOT boosted", () => {
      // Triangulates: Metal Powder is species-gated to Ditto (132).
      // Non-Ditto holding Metal Powder gets no Defense boost.
      // Source: pret/pokeemerald src/pokemon.c:3197 — species check is strictly SPECIES_DITTO
      // Fire-type attacker → no STAB on normal move → damage = 37 regardless of item.
      const typeChart = createNeutralTypeChart();
      const move = createMove("normal", 80);

      const nonDittoWithItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        speciesId: 1, // Bulbasaur — not Ditto
        heldItem: "metal-powder",
      });
      const nonDittoWithoutItem = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        speciesId: 1,
        heldItem: null,
      });
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fire"], // no STAB on normal move
      });

      const resultWith = calculateGen3Damage(
        createDamageContext({ attacker, defender: nonDittoWithItem, move }),
        typeChart,
      );
      const resultWithout = calculateGen3Damage(
        createDamageContext({ attacker, defender: nonDittoWithoutItem, move }),
        typeChart,
      );

      // No boost for non-Ditto species
      expect(resultWith.damage).toBe(resultWithout.damage);
      expect(resultWith.damage).toBe(37);
    });
  });
});
