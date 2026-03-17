import type { AbilityContext, ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen3Ability } from "../src/Gen3Abilities";
import { calculateGen3Damage } from "../src/Gen3DamageCalc";

/**
 * Gen 3 Abilities Tests
 *
 * Tests ability modifiers in the damage calculation and switch-in triggers.
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
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

/** Minimal ActivePokemon mock. */
function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  status?: "burn" | "poison" | "paralysis" | null;
  ability?: string;
  heldItem?: string | null;
  speciesId?: number;
  nickname?: string | null;
  statStages?: Partial<Record<string, number>>;
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
    nickname: opts.nickname ?? null,
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
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
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
function createMove(type: PokemonType, power: number, id = "test-move"): MoveData {
  return {
    id,
    displayName: "Test Move",
    type,
    category: "physical", // ignored in Gen 3 (type-based split)
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
function createNeutralTypeChart(): TypeChart {
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
  return chart as TypeChart;
}

/** Create a type chart with specific overrides from neutral. */
function createTypeChart(overrides: [PokemonType, PokemonType, number][]): TypeChart {
  const chart = createNeutralTypeChart();
  for (const [atk, def, mult] of overrides) {
    (chart as Record<string, Record<string, number>>)[atk]![def] = mult;
  }
  return chart;
}

/** Create a BattleState mock with optional weather. */
function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

/** Create a full DamageContext for calculateGen3Damage. */
function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100), // max random roll = no random penalty
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests: Attacker Ability Modifiers (damage calc)
// ---------------------------------------------------------------------------

describe("Gen 3 Abilities — Damage Calc", () => {
  describe("Huge Power", () => {
    it("given Huge Power user with 100 Atk, when calculating physical damage, then Attack is doubled (effectively 200 Atk)", () => {
      // Source: pret/pokeemerald ABILITY_HUGE_POWER — doubles physical attack
      // Attacker is "water" type using "ground" move — no STAB
      // Formula derivation (L50, 80BP ground, Atk=100*2=200 vs Def=100, max roll):
      //   levelFactor = floor(2*50/5) + 2 = 22
      //   baseDamage = floor(floor(22 * 80 * 200 / 100) / 50) + 2 = floor(3520/50) + 2 = 72
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
        ability: "huge-power",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      // Ground is physical type in Gen 3
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      // Without Huge Power (Atk=100): floor(floor(22*80*100/100)/50)+2 = 37
      // With Huge Power (Atk=200): floor(floor(22*80*200/100)/50)+2 = floor(3520/50)+2 = 72
      expect(result.damage).toBe(72);
    });

    it("given Huge Power user with 150 Atk, when calculating physical damage vs 120 Def, then Attack is doubled to 300", () => {
      // Source: pret/pokeemerald ABILITY_HUGE_POWER — doubles physical attack
      // Attacker is "water" type using "ground" move — no STAB
      // Formula derivation (L50, 80BP, Atk=150*2=300 vs Def=120, max roll):
      //   levelFactor = 22
      //   baseDamage = floor(floor(22 * 80 * 300 / 120) / 50) + 2 = floor(4400/50) + 2 = 90
      const attacker = createActivePokemon({
        level: 50,
        attack: 150,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
        ability: "huge-power",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 120,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(90);
    });

    it("given Huge Power user, when calculating special damage, then Attack is NOT doubled", () => {
      // Source: pret/pokeemerald ABILITY_HUGE_POWER — only affects physical attack
      // Attacker is "water" type using "fire" (special) move — no STAB
      // SpAttack = 100 (not doubled) vs SpDefense = 100
      // Formula (L50, 80BP, 100 SpAtk vs 100 SpDef, max roll):
      //   baseDamage = floor(floor(22*80*100/100)/50) + 2 = floor(1760/50) + 2 = 37
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
        ability: "huge-power",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("fire", 80); // Fire = special in Gen 3
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });
  });

  describe("Pure Power", () => {
    it("given Pure Power user with 100 Atk, when calculating physical damage, then Attack is doubled", () => {
      // Source: pret/pokeemerald ABILITY_PURE_POWER — identical to Huge Power, doubles physical attack
      // Attacker is "fighting" type using "ground" move — no STAB
      // Formula: L50, 80BP, Atk=100*2=200 vs Def=100, max roll
      //   baseDamage = floor(floor(22*80*200/100)/50) + 2 = floor(3520/50) + 2 = 72
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fighting"],
        ability: "pure-power",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(72);
    });

    it("given Pure Power user with 80 Atk, when calculating physical damage with 60BP move, then Attack is doubled to 160", () => {
      // Source: pret/pokeemerald ABILITY_PURE_POWER — doubles physical attack (triangulation)
      // Attacker is "fighting" type using "ground" 60BP move — no STAB
      // Formula (L50, 60BP, Atk=80*2=160 vs Def=100, max roll):
      //   levelFactor = 22
      //   floor(floor(22 * 60 * 160 / 100) / 50) + 2 = floor(2112/50) + 2 = 42 + 2 = 44
      const attacker = createActivePokemon({
        level: 50,
        attack: 80,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["fighting"],
        ability: "pure-power",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("ground", 60);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(44);
    });
  });

  describe("Hustle", () => {
    it("given Hustle user with 100 Atk, when calculating physical damage, then Attack is boosted 1.5x", () => {
      // Source: pret/pokeemerald ABILITY_HUSTLE — boosts physical attack by 50%
      // Attacker is "water" type using "ground" move — no STAB
      // Effective Atk = floor(100 * 1.5) = 150
      // Formula (L50, 80BP, 150 Atk vs 100 Def, max roll):
      //   levelFactor = 22
      //   baseDamage = floor(floor(22*80*150/100)/50) + 2 = floor(2640/50) + 2 = 54
      // Without Hustle (Atk=100): floor(1760/50)+2 = 37
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
        ability: "hustle",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(54);
    });

    it("given Hustle user, when calculating special damage, then SpAttack is NOT boosted", () => {
      // Source: pret/pokeemerald ABILITY_HUSTLE — only affects physical attack
      // Attacker is "water" type using "fire" (special) move — no STAB
      // SpAtk=100, 80BP → baseDamage = floor(floor(22*80*100/100)/50)+2 = 37
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
        ability: "hustle",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("fire", 80); // Fire = special in Gen 3
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      // No boost applied to special moves — same as base: 37
      expect(result.damage).toBe(37);
    });
  });

  describe("Guts", () => {
    it("given Guts user with burn status, when calculating physical damage, then burn penalty is cancelled and attack boosted 1.5x", () => {
      // Source: pret/pokeemerald ABILITY_GUTS — boosts attack 1.5x when statused, negates burn penalty
      // Without Guts + burn: Atk = floor(100/2) = 50 → floor(floor(22*80*50/100)/50)+2 = floor(880/50)+2 = 19
      // With Guts + burn: Atk = floor(100*1.5) = 150 (no burn halving) → 54
      // The key difference: burn normally halves attack, but Guts prevents that AND adds 1.5x
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "guts",
        status: "burn",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());

      // Guts with burn: Atk = floor(100 * 1.5) = 150 (burn halving skipped)
      // baseDamage = floor(floor(22*80*150/100)/50) + 2 = floor(2640/50) + 2 = 54
      expect(result.damage).toBe(54);
    });

    it("given Guts user with poison status, when calculating physical damage, then attack is boosted 1.5x", () => {
      // Source: pret/pokeemerald ABILITY_GUTS — activates on any primary status, not just burn
      // With poison + Guts: Atk = floor(100 * 1.5) = 150 (no burn penalty since not burned)
      // baseDamage = floor(floor(22*80*150/100)/50) + 2 = 54
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "guts",
        status: "poison",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(54);
    });

    it("given Guts user with no status, when calculating physical damage, then attack is NOT boosted", () => {
      // Source: pret/pokeemerald ABILITY_GUTS — only activates when a primary status is present
      // Without status: normal damage (Atk=100, no modifier)
      // baseDamage = floor(floor(22*80*100/100)/50) + 2 = floor(1760/50)+2 = 37
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "guts",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });

    it("given burned user WITHOUT Guts, when calculating physical damage, then burn penalty halves attack", () => {
      // Source: pret/pokeemerald — burn halves physical attack when Guts is not active
      // Burned, no Guts: Atk = floor(100/2) = 50
      // baseDamage = floor(floor(22*80*50/100)/50)+2 = floor(880/50)+2 = 17+2 = 19
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        status: "burn",
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(19);
    });
  });

  describe("Thick Fat", () => {
    it("given Thick Fat defender, when hit by Fire move, then damage is halved", () => {
      // Source: pret/pokeemerald ABILITY_THICK_FAT — halves damage from Fire and Ice type moves
      // Fire is special in Gen 3 (SpAttack vs SpDefense)
      // Without Thick Fat: floor(floor(22*80*100/100)/50)+2 = 72 (see baseline tests)
      //   Wait: for special: SpAtk=100 vs SpDef=100
      //   baseDamage = floor(floor(22*80*100/100)/50) + 2 = floor(1760/50) + 2 = 37
      //   Then type effectiveness 1x → 37
      //   Then Thick Fat halves: floor(37 * 0.5) = 18
      //   Min 1, final = 18
      // Actually without Thick Fat the base test returns 37 for 80BP L50 100/100:
      //   The answer there had to be 37 because floor(1760/50)=35, +2=37
      // With Thick Fat: floor(37 * 0.5) = 18
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "thick-fat",
      });
      const move = createMove("fire", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(18);
    });

    it("given Thick Fat defender, when hit by Ice move, then damage is halved", () => {
      // Source: pret/pokeemerald ABILITY_THICK_FAT — halves damage from Fire and Ice type moves
      // Ice is special in Gen 3
      // Same calc as Fire test above: 37 base → floor(37 * 0.5) = 18
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "thick-fat",
      });
      const move = createMove("ice", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(18);
    });

    it("given Thick Fat defender, when hit by Water move, then damage is NOT halved", () => {
      // Source: pret/pokeemerald ABILITY_THICK_FAT — only affects Fire and Ice
      // Water is special in Gen 3. Normal damage: 37
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "thick-fat",
      });
      const move = createMove("water", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      // Water is not affected by Thick Fat — normal damage
      expect(result.damage).toBe(37);
    });

    it("given Thick Fat defender, when breakdown is checked, then abilityMultiplier is 0.5 for Fire/Ice", () => {
      // Verify the breakdown correctly reports the ability multiplier
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "thick-fat",
      });
      const move = createMove("fire", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.breakdown?.abilityMultiplier).toBe(0.5);
    });
  });

  describe("Wonder Guard", () => {
    it("given Wonder Guard defender, when non-super-effective move hits (1x), then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_WONDER_GUARD — only super-effective moves hit
      // Neutral type chart: everything is 1x → Wonder Guard blocks
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["bug", "ghost"],
        ability: "wonder-guard",
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
    });

    it("given Wonder Guard defender, when super-effective move hits (2x), then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_WONDER_GUARD — 2x and 4x moves land normally
      // Create chart where fire is 2x vs bug
      const typeChart = createTypeChart([["fire", "bug", 2]]);
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["bug"],
        ability: "wonder-guard",
      });
      const move = createMove("fire", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, typeChart);
      // Fire is special in Gen 3, SpAtk=100 vs SpDef=100
      // baseDamage = floor(floor(22*80*100/100)/50) + 2 = 37
      // type effectiveness = 2x → floor(37 * 2) = 74
      // Wonder Guard does NOT block because effectiveness >= 2
      expect(result.damage).toBe(74);
      expect(result.effectiveness).toBe(2);
    });

    it("given Wonder Guard defender, when NVE move hits (0.5x), then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_WONDER_GUARD — blocks 0.5x moves too
      const typeChart = createTypeChart([["ground", "bug", 0.5]]);
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["bug"],
        ability: "wonder-guard",
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, typeChart);
      expect(result.damage).toBe(0);
      // Effectiveness is 0.5 but Wonder Guard blocked it
      expect(result.effectiveness).toBe(0.5);
    });
  });

  describe("Levitate", () => {
    it("given Levitate defender, when Ground move targets it, then damage is 0 with effectiveness 0", () => {
      // Source: pret/pokeemerald ABILITY_LEVITATE — grants immunity to Ground-type moves
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "levitate",
      });
      const move = createMove("ground", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Levitate defender, when non-Ground move targets it, then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_LEVITATE — only affects Ground-type moves
      // Attacker is "water" type using "rock" (physical) move — no STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "levitate",
      });
      const move = createMove("rock", 80); // Rock is physical in Gen 3, no STAB with water attacker
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      // Normal damage: floor(floor(22*80*100/100)/50)+2 = 37
      expect(result.damage).toBe(37);
    });
  });

  describe("Volt Absorb", () => {
    it("given Volt Absorb defender, when Electric move targets it, then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_VOLT_ABSORB — grants immunity to Electric-type moves
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "volt-absorb",
      });
      const move = createMove("electric", 80); // Electric is special in Gen 3
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Volt Absorb defender, when non-Electric move targets it, then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_VOLT_ABSORB — only affects Electric-type moves
      // Attacker is "water" type using "rock" (physical) move — no STAB
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["water"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "volt-absorb",
      });
      const move = createMove("rock", 80); // Rock is physical in Gen 3, no STAB with water attacker
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });
  });

  describe("Water Absorb", () => {
    it("given Water Absorb defender, when Water move targets it, then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_WATER_ABSORB — grants immunity to Water-type moves
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "water-absorb",
      });
      const move = createMove("water", 80); // Water is special in Gen 3
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Water Absorb defender, when Fire move targets it, then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_WATER_ABSORB — only affects Water-type moves
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "water-absorb",
      });
      const move = createMove("fire", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });
  });

  describe("Flash Fire", () => {
    it("given Flash Fire defender, when Fire move targets it, then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_FLASH_FIRE — grants immunity to Fire-type moves
      // NOTE: the boost to fire moves after absorbing one is a volatile state change, skip for now
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "flash-fire",
      });
      const move = createMove("fire", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Flash Fire defender, when Water move targets it, then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_FLASH_FIRE — only affects Fire-type moves
      const attacker = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
      });
      const defender = createActivePokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: ["normal"],
        ability: "flash-fire",
      });
      const move = createMove("water", 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Switch-in Abilities
// ---------------------------------------------------------------------------

describe("Gen 3 Abilities — Switch-in Triggers", () => {
  /** Create a minimal AbilityContext for testing switch-in abilities. */
  function createAbilityContext(opts: {
    pokemonAbility: string;
    pokemonNickname?: string;
    opponentNickname?: string;
    hasOpponent?: boolean;
  }): AbilityContext {
    const pokemon = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
      ability: opts.pokemonAbility,
      nickname: opts.pokemonNickname ?? "Attacker",
    });
    const opponent =
      opts.hasOpponent !== false
        ? createActivePokemon({
            level: 50,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            types: ["normal"],
            nickname: opts.opponentNickname ?? "Defender",
          })
        : undefined;

    return {
      pokemon,
      opponent,
      state: createMockState(),
      rng: createMockRng(100),
      trigger: "on-switch-in",
    } as AbilityContext;
  }

  describe("Intimidate", () => {
    it("given Intimidate user, when switching in with opponent present, then returns activated=true with attack-lowering message", () => {
      // Source: pret/pokeemerald ABILITY_INTIMIDATE — lowers opponent's Attack by 1 stage on switch-in
      const ctx = createAbilityContext({
        pokemonAbility: "intimidate",
        pokemonNickname: "Gyarados",
        opponentNickname: "Machamp",
      });
      const result = applyGen3Ability("on-switch-in", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.effectType).toBe("stat-change");
      expect(result.effects[0]!.target).toBe("opponent");
      expect(result.messages[0]).toBe("Gyarados's Intimidate cut Machamp's Attack!");
    });

    it("given Intimidate user, when switching in with no opponent, then returns activated=false", () => {
      // Edge case: no opponent present (e.g., all fainted)
      const ctx = createAbilityContext({
        pokemonAbility: "intimidate",
        hasOpponent: false,
      });
      const result = applyGen3Ability("on-switch-in", ctx);
      expect(result.activated).toBe(false);
      expect(result.effects.length).toBe(0);
    });
  });

  describe("Drizzle", () => {
    it("given Drizzle user, when switching in, then returns activated=true with rain message", () => {
      // Source: pret/pokeemerald ABILITY_DRIZZLE — sets permanent rain on switch-in
      const ctx = createAbilityContext({
        pokemonAbility: "drizzle",
        pokemonNickname: "Kyogre",
      });
      const result = applyGen3Ability("on-switch-in", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.target).toBe("field");
      expect(result.messages[0]).toBe("Kyogre's Drizzle made it rain!");
    });
  });

  describe("Drought", () => {
    it("given Drought user, when switching in, then returns activated=true with sun message", () => {
      // Source: pret/pokeemerald ABILITY_DROUGHT — sets permanent sun on switch-in
      const ctx = createAbilityContext({
        pokemonAbility: "drought",
        pokemonNickname: "Groudon",
      });
      const result = applyGen3Ability("on-switch-in", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.target).toBe("field");
      expect(result.messages[0]).toBe("Groudon's Drought intensified the sun's rays!");
    });
  });

  describe("Sand Stream", () => {
    it("given Sand Stream user, when switching in, then returns activated=true with sandstorm message", () => {
      // Source: pret/pokeemerald ABILITY_SAND_STREAM — sets permanent sandstorm on switch-in
      const ctx = createAbilityContext({
        pokemonAbility: "sand-stream",
        pokemonNickname: "Tyranitar",
      });
      const result = applyGen3Ability("on-switch-in", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.target).toBe("field");
      expect(result.messages[0]).toBe("Tyranitar's Sand Stream whipped up a sandstorm!");
    });
  });

  describe("Snow Warning", () => {
    it("given Snow Warning user, when switching in, then returns activated=true with hail message", () => {
      // Source: pret/pokeemerald ABILITY_SNOW_WARNING — sets permanent hail on switch-in
      const ctx = createAbilityContext({
        pokemonAbility: "snow-warning",
        pokemonNickname: "Abomasnow",
      });
      const result = applyGen3Ability("on-switch-in", ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.target).toBe("field");
      expect(result.messages[0]).toBe("Abomasnow's Snow Warning: Hail started!");
    });
  });

  // ---------------------------------------------------------------------------
  // Tier 2 abilities — require engine hooks not yet implemented
  // These will be enabled once BattleEngine calls the appropriate triggers.
  // Engine limitation: BattleEngine only calls applyAbility("on-switch-in") and
  // discards the return value. It does NOT call on-contact, on-turn-end, or
  // on-switch-out. See packages/battle/src/engine/BattleEngine.ts.
  // ---------------------------------------------------------------------------

  describe("Tier 2 abilities — engine-limited stubs (on-contact / on-turn-end / on-switch-out)", () => {
    // Source: pret/pokeemerald — all of these abilities exist in Gen 3 but require
    // engine hooks that BattleEngine does not yet call.

    it.todo(
      "given Static holder and physical contact move, when on-contact fires, then 30% chance to paralyze attacker (requires engine on-contact hook)",
    );
    it.todo(
      "given Flame Body holder and physical contact move, when on-contact fires, then 30% chance to burn attacker (requires engine on-contact hook)",
    );
    it.todo(
      "given Rough Skin holder and contact move, when on-contact fires, then attacker takes 1/16 max HP damage (requires engine on-contact hook)",
    );
    it.todo(
      "given Poison Point holder and contact move, when on-contact fires, then 30% chance to poison attacker (requires engine on-contact hook)",
    );
    it.todo(
      "given Natural Cure holder switches out, when on-switch-out fires, then status is cured (requires engine on-switch-out hook consuming AbilityResult)",
    );
    it.todo(
      "given Shed Skin holder at turn end, when on-turn-end fires, then 1/3 chance to cure status (requires engine on-turn-end hook)",
    );
    it.todo(
      "given Speed Boost holder at turn end, when on-turn-end fires, then Speed +1 stage (requires engine on-turn-end hook)",
    );
  });

  // ---------------------------------------------------------------------------
  // Tier 3 abilities — status immunity, require passive-immunity engine hook
  // These abilities passively block status conditions being inflicted.
  // Engine limitation: BattleEngine does not call applyAbility("passive-immunity")
  // or applyAbility("on-status-inflicted"). Until it does, these cannot activate.
  // Source: pret/pokeemerald — each of these abilities exists in Gen 3.
  // ---------------------------------------------------------------------------

  describe("Tier 3 abilities — status immunity stubs (passive-immunity / on-status-inflicted)", () => {
    it.todo(
      "given Immunity holder, when poison is inflicted, then poison is blocked (requires engine passive-immunity hook)",
    );
    it.todo(
      "given Limber holder, when paralysis is inflicted, then paralysis is blocked (requires engine passive-immunity hook)",
    );
    it.todo(
      "given Insomnia holder, when sleep is inflicted, then sleep is blocked (requires engine passive-immunity hook)",
    );
    it.todo(
      "given Vital Spirit holder, when sleep is inflicted, then sleep is blocked (requires engine passive-immunity hook)",
    );
    it.todo(
      "given Magma Armor holder, when freeze is inflicted, then freeze is blocked (requires engine passive-immunity hook)",
    );
    it.todo(
      "given Water Veil holder, when burn is inflicted, then burn is blocked (requires engine passive-immunity hook)",
    );
    it.todo(
      "given Own Tempo holder, when confusion is inflicted, then confusion is blocked (requires engine passive-immunity hook)",
    );
    it.todo(
      "given Oblivious holder, when infatuation or taunt is inflicted, then it is blocked (requires engine passive-immunity hook)",
    );
  });

  describe("Unimplemented abilities", () => {
    it("given an ability with no switch-in effect (e.g., static), when switching in, then returns activated=false", () => {
      // Static is a contact ability, not a switch-in ability
      const ctx = createAbilityContext({
        pokemonAbility: "static",
      });
      const result = applyGen3Ability("on-switch-in", ctx);
      expect(result.activated).toBe(false);
      expect(result.effects.length).toBe(0);
      expect(result.messages.length).toBe(0);
    });

    it("given an unsupported trigger (e.g., on-contact), when dispatched, then returns activated=false", () => {
      // Engine doesn't call on-contact triggers yet
      const ctx = createAbilityContext({
        pokemonAbility: "static",
      });
      const result = applyGen3Ability("on-contact" as "on-switch-in", ctx);
      expect(result.activated).toBe(false);
    });
  });
});
