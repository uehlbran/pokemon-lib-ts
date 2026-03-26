/**
 * Bug fix tests for Gen 3 issues:
 *   #706 — Charge doubles Electric-type move power via "charged" volatile
 *   #705 — Mud Sport halves Electric-type move power; Water Sport halves Fire-type move power
 *
 * These tests verify the damage calc correctly reads the new volatile statuses
 * and the move effect handlers correctly set them.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_CHARGE, EFFECT_MUD_SPORT,
 *         EFFECT_WATER_SPORT
 * Source: Bulbapedia "Charge", "Mud Sport", "Water Sport"
 */

import type { ActivePokemon, DamageContext, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
  NEUTRAL_NATURES,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  GEN3_TYPES,
} from "../../src";
import { calculateGen3Damage } from "../../src/Gen3DamageCalc";
import { executeGen3MoveEffect } from "../../src/Gen3MoveEffects";

const DATA_MANAGER = createGen3DataManager();
const ABILITIES = CORE_ABILITY_IDS;
const ITEMS = GEN3_ITEM_IDS;
const MOVES = { ...CORE_MOVE_IDS, ...GEN3_MOVE_IDS };
const SPECIES = GEN3_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = {
  charged: CORE_VOLATILE_IDS.charged,
  mudSport: GEN3_MOVE_IDS.mudSport,
  waterSport: GEN3_MOVE_IDS.waterSport,
} as const;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN3_NATURE_IDS.hardy;
const THUNDERBOLT = DATA_MANAGER.getMove(MOVES.thunderbolt);
const FLAMETHROWER = DATA_MANAGER.getMove(MOVES.flamethrower);
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const CHARGE = DATA_MANAGER.getMove(MOVES.charge);
const MUD_SPORT = DATA_MANAGER.getMove(MOVES.mudSport);
const WATER_SPORT = DATA_MANAGER.getMove(MOVES.waterSport);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  types?: PokemonType[];
  ability?: PokemonInstance["ability"];
  heldItem?: PokemonInstance["heldItem"];
  status?: PrimaryStatus | null;
  statStages?: Partial<Record<string, number>>;
  volatileStatuses?: ActivePokemon["volatileStatuses"];
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: SPECIES.bulbasaur,
    nickname: "TestMon",
    level: opts.level ?? 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [createMoveSlot(THUNDERBOLT.id, THUNDERBOLT.pp)],
    ability: opts.ability ?? ABILITIES.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
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
    volatileStatuses: opts.volatileStatuses ?? new Map(),
    types: opts.types ?? [TYPES.normal],
    ability: opts.ability ?? ABILITIES.none,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMove(
  move: MoveData,
  overrides: Partial<Pick<MoveData, "power" | "effect">> = {},
): MoveData {
  return {
    ...move,
    power: overrides.power ?? move.power,
    effect: overrides.effect ?? move.effect,
    accuracy: 100,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      ...move.flags,
    },
    generation: 3,
  } as MoveData;
}

/** All-neutral type chart for 17 Gen 3 types. */
function createNeutralTypeChart(): TypeChart {
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of GEN3_TYPES) {
    chart[atk] = {};
    for (const def of GEN3_TYPES) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

/** Create a mock BattleState with optional sides (for field-check volatiles). */
function createMockState(opts?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: Array<{ active: Array<ActivePokemon | null> }>;
}) {
  return {
    weather: opts?.weather ?? null,
    sides: opts?.sides ?? undefined,
  } as DamageContext["state"];
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: Array<{ active: Array<ActivePokemon | null> }>;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100), // max random roll = no random penalty
    state: createMockState({ weather: opts.weather, sides: opts.sides }),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// #706 — Charge doubles Electric-type move power
// ---------------------------------------------------------------------------

describe("Bug #706: Charge doubles Electric-type move power", () => {
  it(`given an attacker with the "${VOLATILES.charged}" volatile, when using an Electric-type move, then power is doubled`, () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_CHARGE doubles electric power
    // Source: Bulbapedia "Charge" — "doubles the power of the next Electric-type move"
    //
    // Strategy: compare damage with charged volatile vs without.
    // Doubling power should roughly double the damage (all else equal).
    const chargedVolatiles = new Map([[VOLATILES.charged, { turnsLeft: 2 }]]);
    const attackerCharged = createActivePokemon({
      spAttack: 100,
      types: [TYPES.electric],
      volatileStatuses: chargedVolatiles,
    });
    const attackerNormal = createActivePokemon({
      spAttack: 100,
      types: [TYPES.electric],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove(THUNDERBOLT);
    const typeChart = createNeutralTypeChart();

    const chargedResult = calculateGen3Damage(
      createDamageContext({ attacker: attackerCharged, defender, move }),
      typeChart,
    );
    const normalResult = calculateGen3Damage(
      createDamageContext({ attacker: attackerNormal, defender, move }),
      typeChart,
    );

    // Thunderbolt is 95 BP in Gen 3.
    // Normal: floor(floor(22*95*100/100)/50)+2 = 43; STAB => floor(43*1.5)=64
    // Charged: power doubles to 190, giving floor(floor(22*190*100/100)/50)+2 = 85; STAB => 127
    expect(normalResult.damage).toBe(64);
    expect(chargedResult.damage).toBe(127);
    expect(attackerCharged.volatileStatuses.has(VOLATILES.charged)).toBe(false);
  });

  it(`given an attacker with the "${VOLATILES.charged}" volatile, when using a non-Electric-type move, then power is NOT doubled`, () => {
    // Source: pret/pokeemerald — Charge only affects Electric-type moves
    // Source: Bulbapedia "Charge" — "doubles the power of the next Electric-type move"
    const chargedVolatiles = new Map([[VOLATILES.charged, { turnsLeft: 2 }]]);
    const attacker = createActivePokemon({
      spAttack: 100,
      types: [TYPES.electric],
      volatileStatuses: chargedVolatiles,
    });
    const defender = createActivePokemon({ spDefense: 100 });
    // Fire type move — NOT electric, so Charge should not apply
    const move = createMove(FLAMETHROWER);
    const typeChart = createNeutralTypeChart();

    const result = calculateGen3Damage(
      createDamageContext({ attacker, defender, move }),
      typeChart,
    );

    // The charged volatile should still be present (not consumed for non-Electric moves)
    expect(attacker.volatileStatuses.has(VOLATILES.charged)).toBe(true);

    // Damage should be the same as without Charge (power=80, not doubled)
    const attackerNoCharge = createActivePokemon({
      spAttack: 100,
      types: [TYPES.electric],
    });
    const normalResult = calculateGen3Damage(
      createDamageContext({ attacker: attackerNoCharge, defender, move }),
      typeChart,
    );
    expect(result.damage).toBe(normalResult.damage);
  });

  it(`given the Charge move is used, when the move effect handler runs, then "${VOLATILES.charged}" volatile is set with turnsLeft=2`, () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_CHARGE
    // Source: Bulbapedia "Charge" — also raises SpDef by 1 stage in Gen 3
    const attacker = createActivePokemon({ types: [TYPES.electric] });
    const defender = createActivePokemon({});
    const chargeMove = createMove(CHARGE);

    const ctx = {
      attacker,
      defender,
      move: chargeMove,
      damage: 0,
      state: createMockState(),
      rng: createMockRng(100),
    } as unknown as MoveEffectContext;

    const result = executeGen3MoveEffect(ctx);

    // The handler should set the charged volatile on the attacker
    expect(result).not.toBeNull();
    if (result) {
      expect(result.selfVolatileInflicted).toBe(VOLATILES.charged);
      expect(result.selfVolatileData?.turnsLeft).toBe(2);
      // Gen 3 Charge also raises SpDef by 1
      expect(result.statChanges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ target: "attacker", stat: "spDefense", stages: 1 }),
        ]),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// #705 — Mud Sport halves Electric; Water Sport halves Fire
// ---------------------------------------------------------------------------

describe("Bug #705: Mud Sport halves Electric damage; Water Sport halves Fire damage", () => {
  describe("Mud Sport", () => {
    it("given any active Pokemon has mud-sport volatile, when an Electric move is used, then power is halved", () => {
      // Source: pret/pokeemerald src/battle_util.c — Mud Sport checks both sides
      // Source: Showdown data/moves.ts -- mudsport: volatileStatus halves Electric power
      //
      // Strategy: compare damage with mud-sport vs without. Power should be halved.
      const mudSportUser = createActivePokemon({
        types: [TYPES.ground],
        volatileStatuses: new Map([[VOLATILES.mudSport, { turnsLeft: -1 }]]),
      });
      const attacker = createActivePokemon({ spAttack: 100, types: [TYPES.electric] });
      const defender = createActivePokemon({ spDefense: 100 });
      const move = createMove(THUNDERBOLT);
      const typeChart = createNeutralTypeChart();

      // With mud-sport active on the field
      const mudSportResult = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender,
          move,
          sides: [{ active: [attacker] }, { active: [mudSportUser] }],
        }),
        typeChart,
      );

      // Without mud-sport
      const normalResult = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender,
          move,
        }),
        typeChart,
      );

      // Thunderbolt is 95 BP in Gen 3. Mud Sport halves move power with floor rounding: 95 -> 47.
      // Neutral baseline is 64 damage; halved-power result is 33.
      expect(normalResult.damage).toBe(64);
      expect(mudSportResult.damage).toBe(33);
    });

    it("given mud-sport is active, when a non-Electric move is used, then power is NOT affected", () => {
      // Source: pret/pokeemerald — Mud Sport only affects Electric-type moves
      const mudSportUser = createActivePokemon({
        types: [TYPES.ground],
        volatileStatuses: new Map([[VOLATILES.mudSport, { turnsLeft: -1 }]]),
      });
      const attacker = createActivePokemon({ attack: 100, types: [TYPES.fire] });
      const defender = createActivePokemon({ defense: 100 });
      // Normal type move — not affected by Mud Sport
      const move = createMove(TACKLE);
      const typeChart = createNeutralTypeChart();

      const withMudSport = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender,
          move,
          sides: [{ active: [attacker] }, { active: [mudSportUser] }],
        }),
        typeChart,
      );

      const withoutMudSport = calculateGen3Damage(
        createDamageContext({ attacker, defender, move }),
        typeChart,
      );

      expect(withMudSport.damage).toBe(withoutMudSport.damage);
    });

    it("given Mud Sport move is used, when the move effect handler runs, then mud-sport volatile is set", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_MUD_SPORT
      const attacker = createActivePokemon({ types: [TYPES.ground] });
      const defender = createActivePokemon({});
      const mudSportMove = createMove(MUD_SPORT);

      const ctx = {
        attacker,
        defender,
        move: mudSportMove,
        damage: 0,
        state: createMockState(),
        rng: createMockRng(100),
      } as unknown as MoveEffectContext;

      const result = executeGen3MoveEffect(ctx);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selfVolatileInflicted).toBe(VOLATILES.mudSport);
        expect(result.messages).toEqual(
          expect.arrayContaining([expect.stringContaining("Electricity's power was weakened!")]),
        );
      }
    });
  });

  describe("Water Sport", () => {
    it("given any active Pokemon has water-sport volatile, when a Fire move is used, then power is halved", () => {
      // Source: pret/pokeemerald src/battle_util.c — Water Sport checks both sides
      // Source: Showdown data/moves.ts -- watersport: volatileStatus halves Fire power
      const waterSportUser = createActivePokemon({
        types: [TYPES.water],
        volatileStatuses: new Map([[VOLATILES.waterSport, { turnsLeft: -1 }]]),
      });
      const attacker = createActivePokemon({ spAttack: 100, types: [TYPES.fire] });
      const defender = createActivePokemon({ spDefense: 100 });
      const move = createMove(FLAMETHROWER);
      const typeChart = createNeutralTypeChart();

      // With water-sport active on the field
      const waterSportResult = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender,
          move,
          sides: [{ active: [attacker] }, { active: [waterSportUser] }],
        }),
        typeChart,
      );

      // Without water-sport
      const normalResult = calculateGen3Damage(
        createDamageContext({ attacker, defender, move }),
        typeChart,
      );

      // Flamethrower is 95 BP in Gen 3. Water Sport halves move power with floor rounding: 95 -> 47.
      // Neutral baseline is 64 damage; halved-power result is 33.
      expect(normalResult.damage).toBe(64);
      expect(waterSportResult.damage).toBe(33);
    });

    it("given water-sport is active, when a non-Fire move is used, then power is NOT affected", () => {
      // Source: pret/pokeemerald — Water Sport only affects Fire-type moves
      const waterSportUser = createActivePokemon({
        types: [TYPES.water],
        volatileStatuses: new Map([[VOLATILES.waterSport, { turnsLeft: -1 }]]),
      });
      const attacker = createActivePokemon({ attack: 100, types: [TYPES.normal] });
      const defender = createActivePokemon({ defense: 100 });
      const move = createMove(TACKLE);
      const typeChart = createNeutralTypeChart();

      const withWaterSport = calculateGen3Damage(
        createDamageContext({
          attacker,
          defender,
          move,
          sides: [{ active: [attacker] }, { active: [waterSportUser] }],
        }),
        typeChart,
      );

      const withoutWaterSport = calculateGen3Damage(
        createDamageContext({ attacker, defender, move }),
        typeChart,
      );

      expect(withWaterSport.damage).toBe(withoutWaterSport.damage);
    });

    it("given Water Sport move is used, when the move effect handler runs, then water-sport volatile is set", () => {
      // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_WATER_SPORT
      const attacker = createActivePokemon({ types: [TYPES.water] });
      const defender = createActivePokemon({});
      const waterSportMove = createMove(WATER_SPORT);

      const ctx = {
        attacker,
        defender,
        move: waterSportMove,
        damage: 0,
        state: createMockState(),
        rng: createMockRng(100),
      } as unknown as MoveEffectContext;

      const result = executeGen3MoveEffect(ctx);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selfVolatileInflicted).toBe(VOLATILES.waterSport);
        expect(result.messages).toEqual(
          expect.arrayContaining([expect.stringContaining("Fire's power was weakened!")]),
        );
      }
    });
  });
});
