import type {
  AbilityContext,
  ActivePokemon,
  BattleState,
  DamageContext,
} from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonType,
  PrimaryStatus,
  StatBlock,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen3Ability,
  canInflictGen3Status,
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
  isGen3VolatileBlockedByAbility,
} from "../../src";
import { calculateGen3Damage } from "../../src/Gen3DamageCalc";

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

const dataManager = createGen3DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN3_ABILITY_IDS } as const;
const itemIds = { ...GEN3_ITEM_IDS } as const;
const moveIds = GEN3_MOVE_IDS;
const speciesIds = GEN3_SPECIES_IDS;
const triggerIds = CORE_ABILITY_TRIGGER_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.bulbasaur);
const defaultNature = dataManager.getNature(GEN3_NATURE_IDS.hardy).id;
const defaultMove = dataManager.getMove(moveIds.tackle);

/** A mock RNG whose int() always returns a fixed value. */
function createDeterministicRng(intReturnValue: number) {
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

/** Data-backed on-field Pokemon helper with synthetic stat overrides for calc cases. */
function createOnFieldPokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  status?: PrimaryStatus | null;
  ability?: (typeof GEN3_ABILITY_IDS)[keyof typeof GEN3_ABILITY_IDS];
  heldItem?: string | null;
  speciesId?: number;
  nickname?: string | null;
  statStages?: Partial<Record<string, number>>;
  turnsOnField?: number;
}): ActivePokemon {
  const species = dataManager.getSpecies(opts.speciesId ?? defaultSpecies.id);
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: 100,
  };

  const pokemon = createPokemonInstance(species, opts.level, new SeededRandom(3), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    heldItem: opts.heldItem ?? null,
    isShiny: false,
    friendship: species.baseFriendship,
    metLocation: "",
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });
  pokemon.nickname = opts.nickname ?? null;
  pokemon.moves = [createMoveSlot(defaultMove.id, defaultMove.pp)];
  pokemon.currentHp = 200;
  pokemon.ability = opts.ability ?? abilityIds.none;
  pokemon.heldItem = opts.heldItem ?? null;
  pokemon.status = opts.status ?? null;
  pokemon.calculatedStats = stats;

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
    volatileStatuses: new Map<VolatileStatus, { turnsLeft: number }>(),
    types: opts.types,
    ability: pokemon.ability,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: opts.turnsOnField ?? 0,
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
  } as ActivePokemon;
}

/** Explicit synthetic move builder for damage-slice probes that real Gen 3 move data does not cover directly. */
function createSyntheticMove(type: PokemonType, power: number, id = moveIds.tackle): MoveData {
  const canonicalMove = dataManager.getMove(id);
  return {
    ...canonicalMove,
    id,
    type,
    power,
    // Gen 3 damage uses type-based split; tests override type/power intentionally.
  } as MoveData;
}

/** All-neutral type chart for 17 Gen 3 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    CORE_TYPE_IDS.normal,
    CORE_TYPE_IDS.fire,
    CORE_TYPE_IDS.water,
    CORE_TYPE_IDS.electric,
    CORE_TYPE_IDS.grass,
    CORE_TYPE_IDS.ice,
    CORE_TYPE_IDS.fighting,
    CORE_TYPE_IDS.poison,
    CORE_TYPE_IDS.ground,
    CORE_TYPE_IDS.flying,
    CORE_TYPE_IDS.psychic,
    CORE_TYPE_IDS.bug,
    CORE_TYPE_IDS.rock,
    CORE_TYPE_IDS.ghost,
    CORE_TYPE_IDS.dragon,
    CORE_TYPE_IDS.dark,
    CORE_TYPE_IDS.steel,
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
function createSyntheticDamageState(
  weather?: { type: string; turnsLeft: number; source: string } | null,
) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

function createBattleStateForSwitchOut(): BattleState {
  return {} as BattleState;
}

/** Create a full DamageContext for calculateGen3Damage. */
function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createDeterministicRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createDeterministicRng(100), // max random roll = no random penalty
    state: createSyntheticDamageState(opts.weather),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests: Attacker Ability Modifiers (damage calc)
// ---------------------------------------------------------------------------

describe("Gen 3 Abilities — Damage Calc", () => {
  describe("Huge Power", () => {
    it("given Huge Power user with 100 Atk, when calculating physical damage, then Attack is doubled (effectively 200 Atk)", () => {
      // Source: pret/pokeemerald ABILITY_HUGE_POWER — doubles physical attack
      // Attacker is CORE_TYPE_IDS.water type using CORE_TYPE_IDS.ground move — no STAB
      // Formula derivation (L50, 80BP ground, Atk=100*2=200 vs Def=100, max roll):
      //   levelFactor = floor(2*50/5) + 2 = 22
      //   baseDamage = floor(floor(22 * 80 * 200 / 100) / 50) + 2 = floor(3520/50) + 2 = 72
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.hugePower,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      // Ground is physical type in Gen 3
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      // Without Huge Power (Atk=100): floor(floor(22*80*100/100)/50)+2 = 37
      // With Huge Power (Atk=200): floor(floor(22*80*200/100)/50)+2 = floor(3520/50)+2 = 72
      expect(result.damage).toBe(72);
    });

    it("given Huge Power user with 150 Atk, when calculating physical damage vs 120 Def, then Attack is doubled to 300", () => {
      // Source: pret/pokeemerald ABILITY_HUGE_POWER — doubles physical attack
      // Attacker is CORE_TYPE_IDS.water type using CORE_TYPE_IDS.ground move — no STAB
      // Formula derivation (L50, 80BP, Atk=150*2=300 vs Def=120, max roll):
      //   levelFactor = 22
      //   baseDamage = floor(floor(22 * 80 * 300 / 120) / 50) + 2 = floor(4400/50) + 2 = 90
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 150,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.hugePower,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 120,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(90);
    });

    it("given Huge Power user, when calculating special damage, then Attack is NOT doubled", () => {
      // Source: pret/pokeemerald ABILITY_HUGE_POWER — only affects physical attack
      // Attacker is CORE_TYPE_IDS.water type using CORE_TYPE_IDS.fire (special) move — no STAB
      // SpAttack = 100 (not doubled) vs SpDefense = 100
      // Formula (L50, 80BP, 100 SpAtk vs 100 SpDef, max roll):
      //   baseDamage = floor(floor(22*80*100/100)/50) + 2 = floor(1760/50) + 2 = 37
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.hugePower,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.fire, 80); // Fire = special in Gen 3
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });
  });

  describe("Pure Power", () => {
    it("given Pure Power user with 100 Atk, when calculating physical damage, then Attack is doubled", () => {
      // Source: pret/pokeemerald ABILITY_PURE_POWER — identical to Huge Power, doubles physical attack
      // Attacker is CORE_TYPE_IDS.fighting type using CORE_TYPE_IDS.ground move — no STAB
      // Formula: L50, 80BP, Atk=100*2=200 vs Def=100, max roll
      //   baseDamage = floor(floor(22*80*200/100)/50) + 2 = floor(3520/50) + 2 = 72
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.fighting],
        ability: GEN3_ABILITY_IDS.purePower,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(72);
    });

    it("given Pure Power user with 80 Atk, when calculating physical damage with 60BP move, then Attack is doubled to 160", () => {
      // Source: pret/pokeemerald ABILITY_PURE_POWER — doubles physical attack (triangulation)
      // Attacker is CORE_TYPE_IDS.fighting type using CORE_TYPE_IDS.ground 60BP move — no STAB
      // Formula (L50, 60BP, Atk=80*2=160 vs Def=100, max roll):
      //   levelFactor = 22
      //   floor(floor(22 * 60 * 160 / 100) / 50) + 2 = floor(2112/50) + 2 = 42 + 2 = 44
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 80,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.fighting],
        ability: GEN3_ABILITY_IDS.purePower,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 60);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(44);
    });
  });

  describe("Hustle", () => {
    it("given Hustle user with 100 Atk, when calculating physical damage, then Attack is boosted 1.5x", () => {
      // Source: pret/pokeemerald ABILITY_HUSTLE — boosts physical attack by 50%
      // Attacker is CORE_TYPE_IDS.water type using CORE_TYPE_IDS.ground move — no STAB
      // Effective Atk = floor(100 * 1.5) = 150
      // Formula (L50, 80BP, 150 Atk vs 100 Def, max roll):
      //   levelFactor = 22
      //   baseDamage = floor(floor(22*80*150/100)/50) + 2 = floor(2640/50) + 2 = 54
      // Without Hustle (Atk=100): floor(1760/50)+2 = 37
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.hustle,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(54);
    });

    it("given Hustle user, when calculating special damage, then SpAttack is NOT boosted", () => {
      // Source: pret/pokeemerald ABILITY_HUSTLE — only affects physical attack
      // Attacker is CORE_TYPE_IDS.water type using CORE_TYPE_IDS.fire (special) move — no STAB
      // SpAtk=100, 80BP → baseDamage = floor(floor(22*80*100/100)/50)+2 = 37
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.water],
        ability: GEN3_ABILITY_IDS.hustle,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.fire, 80); // Fire = special in Gen 3
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
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.guts,
        status: CORE_STATUS_IDS.burn,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
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
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.guts,
        status: CORE_STATUS_IDS.poison,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(54);
    });

    it("given Guts user with no status, when calculating physical damage, then attack is NOT boosted", () => {
      // Source: pret/pokeemerald ABILITY_GUTS — only activates when a primary status is present
      // Without status: normal damage (Atk=100, no modifier)
      // baseDamage = floor(floor(22*80*100/100)/50) + 2 = floor(1760/50)+2 = 37
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.guts,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });

    it("given burned user WITHOUT Guts, when calculating physical damage, then burn penalty halves attack", () => {
      // Source: pret/pokeemerald — burn halves physical attack when Guts is not active
      // Burned, no Guts: Atk = floor(100/2) = 50
      // baseDamage = floor(floor(22*80*50/100)/50)+2 = floor(880/50)+2 = 17+2 = 19
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        status: CORE_STATUS_IDS.burn,
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(19);
    });
  });

  describe("Thick Fat", () => {
    it("given Thick Fat defender, when hit by Fire move, then damage is halved", () => {
      // Source: pret/pokeemerald ABILITY_THICK_FAT / CalculateBaseDamage —
      //   Thick Fat halves the attacker's SpAtk/Atk BEFORE the damage formula runs.
      //   Fire is special in Gen 3 (SpAttack vs SpDefense), L50, SpAtk=100, SpDef=100, 80BP:
      //   Thick Fat halves SpAtk: floor(100 * 0.5) = 50
      //   levelFactor = floor(2*50/5) + 2 = 22
      //   baseDamage = floor(floor(22*80*50/100)/50) + 2 = floor(880/50) + 2 = 17 + 2 = 19
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.thickFat,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.fire, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(19);
    });

    it("given Thick Fat defender, when hit by Ice move, then damage is halved", () => {
      // Source: pret/pokeemerald ABILITY_THICK_FAT — halves damage from Fire and Ice type moves
      // Ice is special in Gen 3 — same pre-formula stat halving as Fire test above: 19
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.thickFat,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ice, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(19);
    });

    it("given Thick Fat defender, when hit by Water move, then damage is NOT halved", () => {
      // Source: pret/pokeemerald ABILITY_THICK_FAT — only affects Fire and Ice
      // Water is special in Gen 3. Normal damage: 37
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.thickFat,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.water, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      // Water is not affected by Thick Fat — normal damage
      expect(result.damage).toBe(37);
    });

    it("given Thick Fat defender, when breakdown is checked, then abilityMultiplier is 0.5 for Fire/Ice", () => {
      // Source: pret/pokeemerald ABILITY_THICK_FAT — halves SpAtk from Fire/Ice; reported as 0.5 in breakdown
      // Verify the breakdown correctly reports the ability multiplier
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.thickFat,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.fire, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.breakdown?.abilityMultiplier).toBe(0.5);
    });
  });

  describe("Wonder Guard", () => {
    it("given Wonder Guard defender, when non-super-effective move hits (1x), then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_WONDER_GUARD — only super-effective moves hit
      // Neutral type chart: everything is 1x → Wonder Guard blocks
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.bug, CORE_TYPE_IDS.ghost],
        ability: GEN3_ABILITY_IDS.wonderGuard,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
    });

    it("given Wonder Guard defender, when super-effective move hits (2x), then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_WONDER_GUARD — 2x and 4x moves land normally
      // Create chart where fire is 2x vs bug
      const typeChart = createTypeChart([[CORE_TYPE_IDS.fire, CORE_TYPE_IDS.bug, 2]]);
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.bug],
        ability: GEN3_ABILITY_IDS.wonderGuard,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.fire, 80);
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
      const typeChart = createTypeChart([[CORE_TYPE_IDS.ground, CORE_TYPE_IDS.bug, 0.5]]);
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.bug],
        ability: GEN3_ABILITY_IDS.wonderGuard,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
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
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.levitate,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.ground, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Levitate defender, when non-Ground move targets it, then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_LEVITATE — only affects Ground-type moves
      // Attacker is CORE_TYPE_IDS.water type using CORE_TYPE_IDS.rock (physical) move — no STAB
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.water],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.levitate,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.rock, 80); // Rock is physical in Gen 3, no STAB with water attacker
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      // Normal damage: floor(floor(22*80*100/100)/50)+2 = 37
      expect(result.damage).toBe(37);
    });
  });

  describe("Volt Absorb", () => {
    it("given Volt Absorb defender, when Electric move targets it, then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_VOLT_ABSORB — grants immunity to Electric-type moves
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.voltAbsorb,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.electric, 80); // Electric is special in Gen 3
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Volt Absorb defender, when non-Electric move targets it, then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_VOLT_ABSORB — only affects Electric-type moves
      // Attacker is CORE_TYPE_IDS.water type using CORE_TYPE_IDS.rock (physical) move — no STAB
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.water],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.voltAbsorb,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.rock, 80); // Rock is physical in Gen 3, no STAB with water attacker
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });
  });

  describe("Water Absorb", () => {
    it("given Water Absorb defender, when Water move targets it, then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_WATER_ABSORB — grants immunity to Water-type moves
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.waterAbsorb,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.water, 80); // Water is special in Gen 3
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Water Absorb defender, when Fire move targets it, then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_WATER_ABSORB — only affects Water-type moves
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.waterAbsorb,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.fire, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(37);
    });
  });

  describe("Flash Fire", () => {
    it("given Flash Fire defender, when Fire move targets it, then damage is 0", () => {
      // Source: pret/pokeemerald ABILITY_FLASH_FIRE — grants immunity to Fire-type moves
      // NOTE: the boost to fire moves after absorbing one is a volatile state change, skip for now
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.flashFire,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.fire, 80);
      const ctx = createDamageContext({ attacker, defender, move });
      const result = calculateGen3Damage(ctx, createNeutralTypeChart());
      expect(result.damage).toBe(0);
      expect(result.effectiveness).toBe(0);
    });

    it("given Flash Fire defender, when Water move targets it, then damage is normal", () => {
      // Source: pret/pokeemerald ABILITY_FLASH_FIRE — only affects Fire-type moves
      const attacker = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
      });
      const defender = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.flashFire,
      });
      const move = createSyntheticMove(CORE_TYPE_IDS.water, 80);
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
    pokemonNickname?: string | null;
    opponentNickname?: string | null;
    hasOpponent?: boolean;
  }): AbilityContext {
    const pokemon = createOnFieldPokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.normal],
      ability: opts.pokemonAbility,
      nickname: opts.pokemonNickname === null ? null : (opts.pokemonNickname ?? "Attacker"),
    });
    const opponent =
      opts.hasOpponent !== false
        ? createOnFieldPokemon({
            level: 50,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            types: [CORE_TYPE_IDS.normal],
            nickname: opts.opponentNickname === null ? null : (opts.opponentNickname ?? "Defender"),
          })
        : undefined;

    return {
      pokemon,
      opponent,
      state: createSyntheticDamageState(),
      rng: createDeterministicRng(100),
      trigger: triggerIds.onSwitchIn,
    } as AbilityContext;
  }

  describe("Intimidate", () => {
    it("given Intimidate user, when switching in with opponent present, then returns activated=true with attack-lowering message", () => {
      // Source: pret/pokeemerald ABILITY_INTIMIDATE — lowers opponent's Attack by 1 stage on switch-in
      // NOTE: This test verifies the data structure only.
      // The engine discards AbilityResult from on-switch-in (BattleEngine.ts ~190),
      // so the -1 Atk effect is NOT actually applied to game state.
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.intimidate,
        pokemonNickname: "Gyarados",
        opponentNickname: "Machamp",
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.effectType).toBe(BATTLE_ABILITY_EFFECT_TYPES.statChange);
      expect(result.effects[0]!.target).toBe(BATTLE_EFFECT_TARGETS.opponent);
      expect(result.messages[0]).toBe("Gyarados's Intimidate cut Machamp's Attack!");
    });

    it("given Intimidate user with no nickname, when switching in, then message uses speciesId", () => {
      // Source: pret/pokeemerald — nickname fallback to species ID
      // Covers the `?? String(speciesId)` branch in Gen3Abilities.ts lines 72-74
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.intimidate,
        pokemonNickname: null,
        opponentNickname: null,
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toBe("1's Intimidate cut 1's Attack!");
    });

    it("given Intimidate user, when switching in with no opponent, then returns activated=false", () => {
      // Edge case: no opponent present (e.g., all fainted)
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.intimidate,
        hasOpponent: false,
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(false);
      expect(result.effects.length).toBe(0);
    });
  });

  describe("Drizzle", () => {
    it("given Drizzle user, when switching in, then returns activated=true with rain message", () => {
      // Source: pret/pokeemerald ABILITY_DRIZZLE — sets permanent rain on switch-in
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.drizzle,
        pokemonNickname: "Kyogre",
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.target).toBe("field");
      expect(result.messages[0]).toBe("Kyogre's Drizzle made it rain!");
    });

    it("given Drizzle user with no nickname, when switching in, then message uses speciesId", () => {
      // Source: pret/pokeemerald — nickname fallback to species ID
      // Covers the `?? String(speciesId)` branch in Gen3Abilities.ts line 89
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.drizzle,
        pokemonNickname: null,
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toBe("1's Drizzle made it rain!");
    });
  });

  describe("Drought", () => {
    it("given Drought user, when switching in, then returns activated=true with sun message", () => {
      // Source: pret/pokeemerald ABILITY_DROUGHT — sets permanent sun on switch-in
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.drought,
        pokemonNickname: "Groudon",
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.target).toBe("field");
      expect(result.messages[0]).toBe("Groudon's Drought intensified the sun's rays!");
    });

    it("given Drought user with no nickname, when switching in, then message uses speciesId", () => {
      // Source: pret/pokeemerald — nickname fallback to species ID
      // Covers the `?? String(speciesId)` branch in Gen3Abilities.ts line 104
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.drought,
        pokemonNickname: null,
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toBe("1's Drought intensified the sun's rays!");
    });
  });

  describe("Sand Stream", () => {
    it("given Sand Stream user, when switching in, then returns activated=true with sandstorm message", () => {
      // Source: pret/pokeemerald ABILITY_SAND_STREAM — sets permanent sandstorm on switch-in
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.sandStream,
        pokemonNickname: "Tyranitar",
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.length).toBe(1);
      expect(result.effects[0]!.target).toBe("field");
      expect(result.messages[0]).toBe("Tyranitar's Sand Stream whipped up a sandstorm!");
    });

    it("given Sand Stream user with no nickname, when switching in, then message uses speciesId", () => {
      // Source: pret/pokeemerald — nickname fallback to species ID
      // Covers the `?? String(speciesId)` branch in Gen3Abilities.ts line 117
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.sandStream,
        pokemonNickname: null,
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(true);
      expect(result.messages[0]).toBe("1's Sand Stream whipped up a sandstorm!");
    });
  });

  // NOTE: Snow Warning is NOT a Gen 3 ability. It was introduced in Gen 4 (Diamond/Pearl)
  // with Abomasnow. Do not add a Snow Warning test or implementation here.

  // ---------------------------------------------------------------------------
  // Tier 2 abilities — implemented contact / turn-end / switch-out handlers
  // ---------------------------------------------------------------------------

  describe("Tier 2 abilities — implemented trigger handlers", () => {
    it("given Static holder and contact move, when on-contact fires, then attacker is paralyzed", () => {
      // Source: pret/pokeemerald ABILITY_STATIC — 30% chance to paralyze attacker on contact move
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.static,
      });

      const result = applyGen3Ability(triggerIds.onContact, ctx);

      expect(result).toEqual({
        activated: true,
        effects: [
          { effectType: "status-inflict", target: "opponent", status: CORE_STATUS_IDS.paralysis },
        ],
        messages: [],
      });
    });

    it("given Flame Body holder and contact move, when on-contact fires, then attacker is burned", () => {
      // Source: pret/pokeemerald ABILITY_FLAME_BODY — 30% chance to burn attacker on contact move
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.flameBody,
      });

      const result = applyGen3Ability(triggerIds.onContact, ctx);

      expect(result).toEqual({
        activated: true,
        effects: [
          { effectType: "status-inflict", target: "opponent", status: CORE_STATUS_IDS.burn },
        ],
        messages: [],
      });
    });

    it("given Rough Skin holder and contact move, when on-contact fires, then attacker takes 1/16 max HP chip damage", () => {
      // Source: pret/pokeemerald ABILITY_ROUGH_SKIN — inflicts floor(maxHP / 16) chip damage on attacker contact
      // With test helper HP=200: floor(200/16) = 12
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.roughSkin,
      });

      const result = applyGen3Ability(triggerIds.onContact, ctx);

      expect(result).toEqual({
        activated: true,
        effects: [{ effectType: "chip-damage", target: "opponent", value: 12 }],
        messages: [],
      });
    });

    it("given Poison Point holder and contact move, when on-contact fires, then attacker is poisoned", () => {
      // Source: pret/pokeemerald ABILITY_POISON_POINT — 30% chance to poison attacker on contact move
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.poisonPoint,
      });

      const result = applyGen3Ability(triggerIds.onContact, ctx);

      expect(result).toEqual({
        activated: true,
        effects: [
          { effectType: "status-inflict", target: "opponent", status: CORE_STATUS_IDS.poison },
        ],
        messages: [],
      });
    });

    it("given Natural Cure holder switches out, when switch-out fires, then status is cured and volatiles clear", () => {
      // Source: pret/pokeemerald ABILITY_NATURAL_CURE — cures primary status and volatile statuses on switch-out
      const pokemon = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.naturalCure,
        status: CORE_STATUS_IDS.burn,
      });
      pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.confusion, { turnsLeft: 2 });
      const ruleset = new Gen3Ruleset();

      ruleset.onSwitchOut(pokemon, createBattleStateForSwitchOut());

      expect(pokemon.pokemon.status).toBeNull();
      expect(pokemon.volatileStatuses.size).toBe(0);
    });

    it("given Shed Skin holder at turn end and a successful roll, then status is cured", () => {
      // Source: pret/pokeemerald ABILITY_SHED_SKIN — 30% chance to cure primary status at end of each turn
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.shedSkin,
      });
      ctx.pokemon.pokemon.status = CORE_STATUS_IDS.burn;

      const result = applyGen3Ability(triggerIds.onTurnEnd, ctx);

      expect(result).toEqual({
        activated: true,
        effects: [{ effectType: "status-cure", target: "self" }],
        messages: ["Attacker's Shed Skin cured its status!"],
      });
    });

    it("given Speed Boost holder at turn end after the switch-in turn, then Speed rises by 1 stage", () => {
      // Source: pret/pokeemerald ABILITY_SPEED_BOOST — raises Speed +1 stage at end of each turn after switch-in
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.speedBoost,
      });
      ctx.pokemon.turnsOnField = 1;

      const result = applyGen3Ability(triggerIds.onTurnEnd, ctx);

      expect(result).toEqual({
        activated: true,
        effects: [{ effectType: "stat-change", target: "self", stat: "speed", stages: 1 }],
        messages: ["Attacker's Speed Boost raised its Speed!"],
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tier 3 abilities — implemented immunity helpers
  // ---------------------------------------------------------------------------

  describe("Tier 3 abilities — status and volatile immunity helpers", () => {
    it("given Immunity holder, when poison is checked, then poison is blocked", () => {
      // Source: pret/pokeemerald ABILITY_IMMUNITY — prevents poison and bad poison infliction
      const target = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.immunity,
      });

      expect(canInflictGen3Status(CORE_STATUS_IDS.poison, target)).toBe(false);
    });

    it("given Limber holder, when paralysis is checked, then paralysis is blocked", () => {
      // Source: pret/pokeemerald ABILITY_LIMBER — prevents paralysis infliction
      const target = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.limber,
      });

      expect(canInflictGen3Status(CORE_STATUS_IDS.paralysis, target)).toBe(false);
    });

    it("given Insomnia holder, when sleep is checked, then sleep is blocked", () => {
      // Source: pret/pokeemerald ABILITY_INSOMNIA — prevents sleep infliction
      const target = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.insomnia,
      });

      expect(canInflictGen3Status(CORE_STATUS_IDS.sleep, target)).toBe(false);
    });

    it("given Vital Spirit holder, when sleep is checked, then sleep is blocked", () => {
      // Source: pret/pokeemerald ABILITY_VITAL_SPIRIT — prevents sleep infliction (same as Insomnia)
      const target = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.vitalSpirit,
      });

      expect(canInflictGen3Status(CORE_STATUS_IDS.sleep, target)).toBe(false);
    });

    it("given Magma Armor holder, when freeze is checked, then freeze is blocked", () => {
      // Source: pret/pokeemerald ABILITY_MAGMA_ARMOR — prevents freeze infliction
      const target = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.magmaArmor,
      });

      expect(canInflictGen3Status(CORE_STATUS_IDS.freeze, target)).toBe(false);
    });

    it("given Water Veil holder, when burn is checked, then burn is blocked", () => {
      // Source: pret/pokeemerald ABILITY_WATER_VEIL — prevents burn infliction
      const target = createOnFieldPokemon({
        level: 50,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        types: [CORE_TYPE_IDS.normal],
        ability: GEN3_ABILITY_IDS.waterVeil,
      });

      expect(canInflictGen3Status(CORE_STATUS_IDS.burn, target)).toBe(false);
    });

    it("given Own Tempo holder, when confusion is checked, then confusion is blocked", () => {
      // Source: pret/pokeemerald ABILITY_OWN_TEMPO — prevents confusion volatile infliction
      expect(
        isGen3VolatileBlockedByAbility(GEN3_ABILITY_IDS.ownTempo, CORE_VOLATILE_IDS.confusion),
      ).toBe(true);
    });

    it("given Oblivious holder, when infatuation is checked, then infatuation is blocked", () => {
      // Source: pret/pokeemerald ABILITY_OBLIVIOUS — prevents infatuation (Attract) volatile infliction
      expect(
        isGen3VolatileBlockedByAbility(GEN3_ABILITY_IDS.oblivious, CORE_VOLATILE_IDS.infatuation),
      ).toBe(true);
    });
  });

  describe("Unimplemented abilities", () => {
    it("given an ability with no switch-in effect (e.g., static), when switching in, then returns activated=false", () => {
      // Source: pret/pokeemerald ABILITY_STATIC — Static has no on-switch-in effect; only on-contact trigger
      // Static is a contact ability, not a switch-in ability
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.static,
      });
      const result = applyGen3Ability(triggerIds.onSwitchIn, ctx);
      expect(result.activated).toBe(false);
      expect(result.effects.length).toBe(0);
      expect(result.messages.length).toBe(0);
    });

    it("given an unsupported trigger (e.g., on-flinch), when dispatched, then returns activated=false", () => {
      // Source: pret/pokeemerald — Gen 3 has no on-flinch ability hook; dispatch falls through to default
      // Gen 3 ability dispatch does not define an on-flinch handler.
      const ctx = createAbilityContext({
        pokemonAbility: GEN3_ABILITY_IDS.static,
      });
      const result = applyGen3Ability(triggerIds.onFlinch, ctx);
      expect(result.activated).toBe(false);
    });
  });
});
