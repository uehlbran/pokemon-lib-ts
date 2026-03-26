import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type {
  MoveData,
  MoveInstance,
  PokemonInstance,
  PokemonType,
  StatBlock,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager, GEN3_MOVE_IDS, GEN3_SPECIES_IDS, Gen3Ruleset } from "../../src";

/**
 * Gen 3 Two-Turn Moves, Focus Punch, and Semi-Invulnerable Targeting Tests
 *
 * Source: pret/pokeemerald src/battle_script_commands.c — two-turn move handling
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Two-turn_move
 */

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

function createMoveInstances(move: MoveData, currentPp = move.pp): MoveInstance[] {
  return [{ moveId: move.id, currentPp, maxPp: move.pp }] as MoveInstance[];
}

type SyntheticDamageCategory =
  | (typeof CORE_MOVE_CATEGORIES)[keyof typeof CORE_MOVE_CATEGORIES]
  | null;

function createOnFieldPokemon(options: {
  types: readonly [PokemonType] | readonly [PokemonType, PokemonType];
  nickname?: string | null;
  speciesId?: number;
  moves?: MoveInstance[];
  lastDamageTaken?: number;
  lastDamageCategory?: SyntheticDamageCategory;
  ability?: string;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const speciesId = options.speciesId ?? GEN3_SPECIES_IDS.breloom;
  const species = dataManager.getSpecies(speciesId);
  const defaultGender =
    species.genderRatio === -1
      ? CORE_GENDERS.genderless
      : species.genderRatio === 0
        ? CORE_GENDERS.female
        : CORE_GENDERS.male;
  const defaultAbility = options.ability ?? species.abilities.normal[0] ?? "";

  const pokemon = {
    uid: "test-mon",
    speciesId,
    nickname: options.nickname ?? null,
    level: 50,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: 200,
    moves: options.moves ?? [],
    ability: defaultAbility,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: createFriendship(species.baseFriendship),
    gender: defaultGender,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...options.types],
    ability: defaultAbility,
    lastMoveUsed: null,
    lastDamageTaken: options.lastDamageTaken ?? 0,
    lastDamageType: null,
    lastDamageCategory: options.lastDamageCategory ?? null,
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

function createBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  weather?: { type: string; turnsLeft: number; source: string } | null,
): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: weather ?? null,
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  weather?: { type: string; turnsLeft: number; source: string } | null,
): MoveEffectContext {
  return {
    attacker,
    defender,
    move,
    damage: 0,
    state: createBattleState(attacker, defender, weather),
    rng: createMockRng(0),
  } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

describe("Gen 3 Two-Turn Moves — Move Effects", () => {
  it("given SolarBeam with sunny weather, when executeMoveEffect is called, then does NOT return forcedMoveSet", () => {
    // Source: pret/pokeemerald — SolarBeam not charging in sunny weather
    // Source: Bulbapedia — "In harsh sunlight, Solar Beam can be used without a charging turn."
    const move = dataManager.getMove(GEN3_MOVE_IDS.solarBeam);
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      moves: createMoveInstances(move),
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const context = createContext(attacker, defender, move, {
      type: CORE_WEATHER_IDS.sun,
      turnsLeft: 3,
      source: GEN3_MOVE_IDS.sunnyDay,
    });

    const result = ruleset.executeMoveEffect(context);

    // SolarBeam in sun skips charge — no forcedMoveSet
    expect(result.forcedMoveSet).toBeUndefined();
    expect(result.messages).toEqual([]);
  });

  it("given SolarBeam without sun, when executeMoveEffect is called, then returns forcedMoveSet on the charge turn", () => {
    // Source: pret/pokeemerald — SolarBeam charges for one turn without sun
    const move = dataManager.getMove(GEN3_MOVE_IDS.solarBeam);
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      moves: createMoveInstances(move),
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const context = createContext(attacker, defender, move); // no weather

    const result = ruleset.executeMoveEffect(context);

    // Source: pret/pokeemerald — SolarBeam charges with "charging" volatile
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN3_MOVE_IDS.solarBeam,
      volatileStatus: CORE_VOLATILE_IDS.charging,
    });
    expect(result.messages).toContain("The Pokemon is absorbing sunlight!");
  });

  it("given Fly, when executeMoveEffect is called, then returns forcedMoveSet on the semi-invulnerable turn", () => {
    // Source: pret/pokeemerald — Fly sets "flying" semi-invulnerable volatile
    // Source: Bulbapedia — "Fly allows the user to fly up high on the first turn,
    //   becoming semi-invulnerable, and attack on the second turn."
    const move = dataManager.getMove(GEN3_MOVE_IDS.fly);
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.flying],
      moves: createMoveInstances(move),
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN3_MOVE_IDS.fly,
      volatileStatus: CORE_VOLATILE_IDS.flying,
    });
    expect(result.messages).toContain("The Pokemon flew up high!");
  });

  it("given Dig, when executeMoveEffect is called, then returns forcedMoveSet on the underground turn", () => {
    // Source: pret/pokeemerald — Dig sets "underground" semi-invulnerable volatile
    const move = dataManager.getMove(GEN3_MOVE_IDS.dig);
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.ground],
      moves: createMoveInstances(move),
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN3_MOVE_IDS.dig,
      volatileStatus: CORE_VOLATILE_IDS.underground,
    });
    expect(result.messages).toContain("The Pokemon dug underground!");
  });

  it("given Dive, when executeMoveEffect is called, then returns forcedMoveSet on the underwater turn", () => {
    // Source: pret/pokeemerald — Dive sets "underwater" semi-invulnerable volatile
    const move = dataManager.getMove(GEN3_MOVE_IDS.dive);
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.water],
      moves: createMoveInstances(move),
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN3_MOVE_IDS.dive,
      volatileStatus: CORE_VOLATILE_IDS.underwater,
    });
    expect(result.messages).toContain("The Pokemon dived underwater!");
  });

  it("given Skull Bash, when executeMoveEffect is called, then returns forcedMoveSet on the charge turn", () => {
    // Source: pret/pokeemerald — Skull Bash charges with generic "charging" volatile
    const move = dataManager.getMove(GEN3_MOVE_IDS.skullBash);
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.normal],
      moves: createMoveInstances(move),
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN3_MOVE_IDS.skullBash,
      volatileStatus: CORE_VOLATILE_IDS.charging,
    });
    expect(result.messages).toContain("The Pokemon lowered its head!");
  });

  it("given SolarBeam in rain, when executeMoveEffect is called, then charges normally (not skipped)", () => {
    // Source: pret/pokeemerald — SolarBeam only skips charge in sun, not in other weather
    // Triangulation: verify rain does NOT skip the charge
    const move = dataManager.getMove(GEN3_MOVE_IDS.solarBeam);
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass],
      moves: createMoveInstances(move),
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const context = createContext(attacker, defender, move, {
      type: CORE_WEATHER_IDS.rain,
      turnsLeft: 3,
      source: GEN3_MOVE_IDS.rainDance,
    });

    const result = ruleset.executeMoveEffect(context);

    // Rain does NOT skip charge — should still get forcedMoveSet
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN3_MOVE_IDS.solarBeam,
      volatileStatus: CORE_VOLATILE_IDS.charging,
    });
    expect(result.messages).toContain("The Pokemon is absorbing sunlight!");
  });
});

describe("Gen 3 Focus Punch", () => {
  it("given Focus Punch and attacker.lastDamageTaken > 0, when move executes, then fails with 'lost its focus' message", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Focus Punch/Bide check
    // Source: Bulbapedia — "Focus Punch fails if the user is hit before it attacks"
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.fighting],
      nickname: "Breloom",
      lastDamageTaken: 50,
      lastDamageCategory: CORE_MOVE_CATEGORIES.physical,
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(GEN3_MOVE_IDS.focusPunch);
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Breloom lost its focus and couldn't move!");
    // Move should not produce any damage-related effects
    expect(result.recoilDamage).toBe(0);
    expect(result.statusInflicted).toBeNull();
  });

  it("given Focus Punch and attacker.lastDamageTaken === 0, when move executes, then succeeds (no failure message)", () => {
    // Source: pret/pokeemerald — Focus Punch succeeds when user was not hit
    // Source: Bulbapedia — "If the user is not hit, Focus Punch will execute normally."
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.fighting],
      nickname: "Breloom",
      lastDamageTaken: 0,
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(GEN3_MOVE_IDS.focusPunch);
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toEqual([]);
  });

  it("given Focus Punch and attacker took special damage, when move executes, then still fails", () => {
    // Source: pret/pokeemerald — Focus Punch checks ANY damage taken, not just physical
    // Triangulation: verify special damage also triggers failure
    const attacker = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.fighting],
      nickname: "Machamp",
      lastDamageTaken: 30,
      lastDamageCategory: CORE_MOVE_CATEGORIES.special,
    });
    const defender = createOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = dataManager.getMove(GEN3_MOVE_IDS.focusPunch);
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Machamp lost its focus and couldn't move!");
  });
});

describe("Gen 3 Semi-Invulnerable Targeting", () => {
  it("given Thunder vs the Fly volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Thunder can hit Fly targets
    // Source: Bulbapedia — "Thunder can hit a Pokémon during the semi-invulnerable turn of Fly"
    expect(ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.thunder, CORE_VOLATILE_IDS.flying)).toBe(
      true,
    );
  });

  it("given Twister vs the Fly volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Twister can hit Fly targets
    expect(ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.twister, CORE_VOLATILE_IDS.flying)).toBe(
      true,
    );
  });

  it("given Gust vs the Fly volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Gust can hit Fly targets
    expect(ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.gust, CORE_VOLATILE_IDS.flying)).toBe(true);
  });

  it("given Sky Uppercut vs the Fly volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Sky Uppercut can hit Fly targets
    expect(
      ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.skyUppercut, CORE_VOLATILE_IDS.flying),
    ).toBe(true);
  });

  it("given Earthquake vs the Dig volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Earthquake can hit Dig targets
    expect(
      ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.earthquake, CORE_VOLATILE_IDS.underground),
    ).toBe(true);
  });

  it("given Magnitude vs the Dig volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Magnitude can hit Dig targets
    expect(
      ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.magnitude, CORE_VOLATILE_IDS.underground),
    ).toBe(true);
  });

  it("given Surf vs the Dive volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Surf can hit Dive targets
    expect(ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.surf, CORE_VOLATILE_IDS.underwater)).toBe(
      true,
    );
  });

  it("given Whirlpool vs the Dive volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Whirlpool can hit Dive targets
    expect(
      ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.whirlpool, CORE_VOLATILE_IDS.underwater),
    ).toBe(true);
  });

  it("given Flamethrower vs the Fly volatile, when canHitSemiInvulnerable is called, then returns false", () => {
    // Source: pret/pokeemerald — only specific moves can hit semi-invulnerable targets
    // Flamethrower cannot hit Fly
    expect(
      ruleset.canHitSemiInvulnerable(CORE_MOVE_IDS.flamethrower, CORE_VOLATILE_IDS.flying),
    ).toBe(false);
  });

  it("given Thunderbolt vs the Dig volatile, when canHitSemiInvulnerable is called, then returns false", () => {
    // Source: pret/pokeemerald — Thunderbolt cannot hit Dig targets
    expect(
      ruleset.canHitSemiInvulnerable(CORE_MOVE_IDS.thunderbolt, CORE_VOLATILE_IDS.underground),
    ).toBe(false);
  });

  it("given Ice Beam vs the Dive volatile, when canHitSemiInvulnerable is called, then returns false", () => {
    // Source: pret/pokeemerald — Ice Beam cannot hit Dive targets
    expect(
      ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.iceBeam, CORE_VOLATILE_IDS.underwater),
    ).toBe(false);
  });

  it("given any move vs the charge volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — charging moves (SolarBeam, Skull Bash, Razor Wind, Sky Attack)
    // do NOT grant semi-invulnerability. Any move can hit a charging Pokemon.
    // canHitSemiInvulnerable returns true for "charging" meaning: "yes, this move can hit."
    expect(ruleset.canHitSemiInvulnerable(CORE_MOVE_IDS.tackle, CORE_VOLATILE_IDS.charging)).toBe(
      true,
    );
    expect(ruleset.canHitSemiInvulnerable(GEN3_MOVE_IDS.iceBeam, CORE_VOLATILE_IDS.charging)).toBe(
      true,
    );
  });
});
