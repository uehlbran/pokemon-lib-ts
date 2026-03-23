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
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen3Damage } from "../src/Gen3DamageCalc";
import { executeGen3MoveEffect } from "../src/Gen3MoveEffects";

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
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | null;
  statStages?: Partial<Record<string, number>>;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
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
    speciesId: 1,
    nickname: "TestMon",
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [{ moveId: "thunderbolt", currentPp: 15, maxPp: 15 }],
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
    volatileStatuses: opts.volatileStatuses ?? new Map(),
    types: opts.types ?? ["normal"],
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMove(
  type: PokemonType,
  power: number,
  id = "test-move",
  effect: MoveData["effect"] = null,
): MoveData {
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
    effect,
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
  it('given an attacker with the "charged" volatile, when using an Electric-type move, then power is doubled', () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_CHARGE doubles electric power
    // Source: Bulbapedia "Charge" — "doubles the power of the next Electric-type move"
    //
    // Strategy: compare damage with "charged" volatile vs without.
    // Doubling power should roughly double the damage (all else equal).
    const chargedVolatiles = new Map([["charged", { turnsLeft: 2 }]]);
    const attackerCharged = createActivePokemon({
      spAttack: 100,
      types: ["electric"],
      volatileStatuses: chargedVolatiles,
    });
    const attackerNormal = createActivePokemon({
      spAttack: 100,
      types: ["electric"],
    });
    const defender = createActivePokemon({ spDefense: 100 });
    const move = createMove("electric", 80, "thunderbolt");
    const typeChart = createNeutralTypeChart();

    const chargedResult = calculateGen3Damage(
      createDamageContext({ attacker: attackerCharged, defender, move }),
      typeChart,
    );
    const normalResult = calculateGen3Damage(
      createDamageContext({ attacker: attackerNormal, defender, move }),
      typeChart,
    );

    // The chargedResult should use power=160 and normalResult uses power=80.
    // With STAB (electric type attacker), both get 1.5x.
    // The damage ratio should be close to 2x (exact match depends on rounding).
    // Gen 3 formula: baseDamage = floor(floor((2*50/5+2) * power * SpAtk / SpDef) / 50) + 2
    //   Normal:  floor(floor(22 * 80 * 100 / 100) / 50) + 2 = floor(176000/100/50)+2 = floor(35.2)+2 = 35+2 = 37
    //   Charged: floor(floor(22 * 160 * 100 / 100) / 50) + 2 = floor(352000/100/50)+2 = floor(70.4)+2 = 70+2 = 72
    //   With rng=100 (no penalty): stays same. Then STAB 1.5x:
    //   Normal: floor(37*1.5) = 55; Charged: floor(72*1.5) = 108
    //   Type effectiveness 1x: stays same.
    // Actually let me just verify the ratio: charged should be roughly 2x normal.
    expect(chargedResult.damage).toBeGreaterThan(normalResult.damage);
    // More precisely, the charged damage should be about double
    expect(chargedResult.damage).toBeGreaterThanOrEqual(Math.floor(normalResult.damage * 1.8));
  });

  it('given an attacker with the "charged" volatile, when using a non-Electric-type move, then power is NOT doubled', () => {
    // Source: pret/pokeemerald — Charge only affects Electric-type moves
    // Source: Bulbapedia "Charge" — "doubles the power of the next Electric-type move"
    const chargedVolatiles = new Map([["charged", { turnsLeft: 2 }]]);
    const attacker = createActivePokemon({
      spAttack: 100,
      types: ["electric"],
      volatileStatuses: chargedVolatiles,
    });
    const defender = createActivePokemon({ spDefense: 100 });
    // Fire type move — NOT electric, so Charge should not apply
    const move = createMove("fire", 80, "flamethrower");
    const typeChart = createNeutralTypeChart();

    const result = calculateGen3Damage(
      createDamageContext({ attacker, defender, move }),
      typeChart,
    );

    // The "charged" volatile should still be present (not consumed for non-Electric moves)
    expect(attacker.volatileStatuses.has("charged")).toBe(true);

    // Damage should be the same as without Charge (power=80, not doubled)
    const attackerNoCharge = createActivePokemon({
      spAttack: 100,
      types: ["electric"],
    });
    const normalResult = calculateGen3Damage(
      createDamageContext({ attacker: attackerNoCharge, defender, move }),
      typeChart,
    );
    expect(result.damage).toBe(normalResult.damage);
  });

  it('given the Charge move is used, when the move effect handler runs, then "charged" volatile is set with turnsLeft=2', () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_CHARGE
    // Source: Bulbapedia "Charge" — also raises SpDef by 1 stage in Gen 3
    const attacker = createActivePokemon({ types: ["electric"] });
    const defender = createActivePokemon({});
    const chargeMove = createMove("electric", 0, "charge", {
      type: "charge",
    } as MoveData["effect"]);

    const ctx = {
      attacker,
      defender,
      move: chargeMove,
      damage: 0,
      state: createMockState(),
      rng: createMockRng(100),
    } as unknown as MoveEffectContext;

    const result = executeGen3MoveEffect(ctx);

    // The handler should set the "charged" volatile on the attacker
    expect(result).not.toBeNull();
    if (result) {
      expect(result.selfVolatileInflicted).toBe("charged");
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
        types: ["ground"],
        volatileStatuses: new Map([["mud-sport", { turnsLeft: -1 }]]),
      });
      const attacker = createActivePokemon({ spAttack: 100, types: ["electric"] });
      const defender = createActivePokemon({ spDefense: 100 });
      const move = createMove("electric", 80, "thunderbolt");
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

      // Mud Sport halves the electric power: 80 -> 40
      // The damage with Mud Sport should be roughly half
      expect(mudSportResult.damage).toBeLessThan(normalResult.damage);
      // More precisely, approximately half (floor rounding may cause slight differences)
      expect(mudSportResult.damage).toBeLessThanOrEqual(Math.ceil(normalResult.damage / 2) + 1);
    });

    it("given mud-sport is active, when a non-Electric move is used, then power is NOT affected", () => {
      // Source: pret/pokeemerald — Mud Sport only affects Electric-type moves
      const mudSportUser = createActivePokemon({
        types: ["ground"],
        volatileStatuses: new Map([["mud-sport", { turnsLeft: -1 }]]),
      });
      const attacker = createActivePokemon({ attack: 100, types: ["fire"] });
      const defender = createActivePokemon({ defense: 100 });
      // Normal type move — not affected by Mud Sport
      const move = createMove("normal", 80, "tackle");
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
      const attacker = createActivePokemon({ types: ["ground"] });
      const defender = createActivePokemon({});
      const mudSportMove = createMove("ground", 0, "mud-sport", {
        type: "mud-sport",
      } as MoveData["effect"]);

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
        expect(result.selfVolatileInflicted).toBe("mud-sport");
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
        types: ["water"],
        volatileStatuses: new Map([["water-sport", { turnsLeft: -1 }]]),
      });
      const attacker = createActivePokemon({ spAttack: 100, types: ["fire"] });
      const defender = createActivePokemon({ spDefense: 100 });
      const move = createMove("fire", 80, "flamethrower");
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

      // Water Sport halves fire power: 80 -> 40
      expect(waterSportResult.damage).toBeLessThan(normalResult.damage);
      expect(waterSportResult.damage).toBeLessThanOrEqual(Math.ceil(normalResult.damage / 2) + 1);
    });

    it("given water-sport is active, when a non-Fire move is used, then power is NOT affected", () => {
      // Source: pret/pokeemerald — Water Sport only affects Fire-type moves
      const waterSportUser = createActivePokemon({
        types: ["water"],
        volatileStatuses: new Map([["water-sport", { turnsLeft: -1 }]]),
      });
      const attacker = createActivePokemon({ attack: 100, types: ["normal"] });
      const defender = createActivePokemon({ defense: 100 });
      const move = createMove("normal", 80, "tackle");
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
      const attacker = createActivePokemon({ types: ["water"] });
      const defender = createActivePokemon({});
      const waterSportMove = createMove("water", 0, "water-sport", {
        type: "water-sport",
      } as MoveData["effect"]);

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
        expect(result.selfVolatileInflicted).toBe("water-sport");
        expect(result.messages).toEqual(
          expect.arrayContaining([expect.stringContaining("Fire's power was weakened!")]),
        );
      }
    });
  });
});
