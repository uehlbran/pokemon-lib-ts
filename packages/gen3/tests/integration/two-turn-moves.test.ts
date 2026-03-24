import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  MoveInstance,
  PokemonInstance,
  PokemonType,
  StatBlock,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../../src/data";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";

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

function createActivePokemon(opts: {
  types: PokemonType[];
  nickname?: string | null;
  moves?: MoveInstance[];
  lastDamageTaken?: number;
  lastDamageCategory?: "physical" | "special" | "status" | null;
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

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: opts.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: opts.moves ?? [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
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
    lastDamageTaken: opts.lastDamageTaken ?? 0,
    lastDamageType: null,
    lastDamageCategory: opts.lastDamageCategory ?? null,
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
    const attacker = createActivePokemon({
      types: ["grass"],
      moves: [{ moveId: "solar-beam", currentPp: 10, maxPp: 10 }] as MoveInstance[],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("solar-beam");
    const context = createContext(attacker, defender, move, {
      type: "sun",
      turnsLeft: 3,
      source: "sunny-day",
    });

    const result = ruleset.executeMoveEffect(context);

    // SolarBeam in sun skips charge — no forcedMoveSet
    expect(result.forcedMoveSet).toBeUndefined();
  });

  it("given SolarBeam without sun, when executeMoveEffect is called, then returns forcedMoveSet with volatile 'charging'", () => {
    // Source: pret/pokeemerald — SolarBeam charges for one turn without sun
    const attacker = createActivePokemon({
      types: ["grass"],
      moves: [{ moveId: "solar-beam", currentPp: 10, maxPp: 10 }] as MoveInstance[],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("solar-beam");
    const context = createContext(attacker, defender, move); // no weather

    const result = ruleset.executeMoveEffect(context);

    // Source: pret/pokeemerald — SolarBeam charges with "charging" volatile
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "solar-beam",
      volatileStatus: "charging",
    });
    expect(result.messages).toContain("The Pokemon is absorbing sunlight!");
  });

  it("given Fly, when executeMoveEffect is called, then returns forcedMoveSet with volatile 'flying'", () => {
    // Source: pret/pokeemerald — Fly sets "flying" semi-invulnerable volatile
    // Source: Bulbapedia — "Fly allows the user to fly up high on the first turn,
    //   becoming semi-invulnerable, and attack on the second turn."
    const attacker = createActivePokemon({
      types: ["flying"],
      moves: [{ moveId: "fly", currentPp: 15, maxPp: 15 }] as MoveInstance[],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("fly");
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "fly",
      volatileStatus: "flying",
    });
    expect(result.messages).toContain("The Pokemon flew up high!");
  });

  it("given Dig, when executeMoveEffect is called, then returns forcedMoveSet with volatile 'underground'", () => {
    // Source: pret/pokeemerald — Dig sets "underground" semi-invulnerable volatile
    const attacker = createActivePokemon({
      types: ["ground"],
      moves: [{ moveId: "dig", currentPp: 10, maxPp: 10 }] as MoveInstance[],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("dig");
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "dig",
      volatileStatus: "underground",
    });
    expect(result.messages).toContain("The Pokemon dug underground!");
  });

  it("given Dive, when executeMoveEffect is called, then returns forcedMoveSet with volatile 'underwater'", () => {
    // Source: pret/pokeemerald — Dive sets "underwater" semi-invulnerable volatile
    const attacker = createActivePokemon({
      types: ["water"],
      moves: [{ moveId: "dive", currentPp: 10, maxPp: 10 }] as MoveInstance[],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("dive");
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "dive",
      volatileStatus: "underwater",
    });
    expect(result.messages).toContain("The Pokemon dived underwater!");
  });

  it("given Skull Bash, when executeMoveEffect is called, then returns forcedMoveSet with volatile 'charging'", () => {
    // Source: pret/pokeemerald — Skull Bash charges with generic "charging" volatile
    const attacker = createActivePokemon({
      types: ["normal"],
      moves: [{ moveId: "skull-bash", currentPp: 10, maxPp: 10 }] as MoveInstance[],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("skull-bash");
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "skull-bash",
      volatileStatus: "charging",
    });
    expect(result.messages).toContain("The Pokemon lowered its head!");
  });

  it("given SolarBeam in rain, when executeMoveEffect is called, then charges normally (not skipped)", () => {
    // Source: pret/pokeemerald — SolarBeam only skips charge in sun, not in other weather
    // Triangulation: verify rain does NOT skip the charge
    const attacker = createActivePokemon({
      types: ["grass"],
      moves: [{ moveId: "solar-beam", currentPp: 10, maxPp: 10 }] as MoveInstance[],
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("solar-beam");
    const context = createContext(attacker, defender, move, {
      type: "rain",
      turnsLeft: 3,
      source: "rain-dance",
    });

    const result = ruleset.executeMoveEffect(context);

    // Rain does NOT skip charge — should still get forcedMoveSet
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "solar-beam",
      volatileStatus: "charging",
    });
  });
});

describe("Gen 3 Focus Punch", () => {
  it("given Focus Punch and attacker.lastDamageTaken > 0, when move executes, then fails with 'lost its focus' message", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Focus Punch/Bide check
    // Source: Bulbapedia — "Focus Punch fails if the user is hit before it attacks"
    const attacker = createActivePokemon({
      types: ["fighting"],
      nickname: "Breloom",
      lastDamageTaken: 50,
      lastDamageCategory: "physical",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("focus-punch");
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
    const attacker = createActivePokemon({
      types: ["fighting"],
      nickname: "Breloom",
      lastDamageTaken: 0,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("focus-punch");
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    // No failure message — move proceeds normally
    const hasFailMessage = result.messages.some((m) => m.includes("lost its focus"));
    expect(hasFailMessage).toBe(false);
  });

  it("given Focus Punch and attacker took special damage, when move executes, then still fails", () => {
    // Source: pret/pokeemerald — Focus Punch checks ANY damage taken, not just physical
    // Triangulation: verify special damage also triggers failure
    const attacker = createActivePokemon({
      types: ["fighting"],
      nickname: "Machamp",
      lastDamageTaken: 30,
      lastDamageCategory: "special",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("focus-punch");
    const context = createContext(attacker, defender, move);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Machamp lost its focus and couldn't move!");
  });
});

describe("Gen 3 Semi-Invulnerable Targeting", () => {
  it("given Thunder vs 'flying' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Thunder can hit Fly targets
    // Source: Bulbapedia — "Thunder can hit a Pokémon during the semi-invulnerable turn of Fly"
    expect(ruleset.canHitSemiInvulnerable("thunder", "flying")).toBe(true);
  });

  it("given Twister vs 'flying' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Twister can hit Fly targets
    expect(ruleset.canHitSemiInvulnerable("twister", "flying")).toBe(true);
  });

  it("given Gust vs 'flying' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Gust can hit Fly targets
    expect(ruleset.canHitSemiInvulnerable("gust", "flying")).toBe(true);
  });

  it("given Sky Uppercut vs 'flying' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Sky Uppercut can hit Fly targets
    expect(ruleset.canHitSemiInvulnerable("sky-uppercut", "flying")).toBe(true);
  });

  it("given Earthquake vs 'underground' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Earthquake can hit Dig targets
    expect(ruleset.canHitSemiInvulnerable("earthquake", "underground")).toBe(true);
  });

  it("given Magnitude vs 'underground' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Magnitude can hit Dig targets
    expect(ruleset.canHitSemiInvulnerable("magnitude", "underground")).toBe(true);
  });

  it("given Surf vs 'underwater' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Surf can hit Dive targets
    expect(ruleset.canHitSemiInvulnerable("surf", "underwater")).toBe(true);
  });

  it("given Whirlpool vs 'underwater' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — Whirlpool can hit Dive targets
    expect(ruleset.canHitSemiInvulnerable("whirlpool", "underwater")).toBe(true);
  });

  it("given Flamethrower vs 'flying' volatile, when canHitSemiInvulnerable is called, then returns false", () => {
    // Source: pret/pokeemerald — only specific moves can hit semi-invulnerable targets
    // Flamethrower cannot hit Fly
    expect(ruleset.canHitSemiInvulnerable("flamethrower", "flying")).toBe(false);
  });

  it("given Thunderbolt vs 'underground' volatile, when canHitSemiInvulnerable is called, then returns false", () => {
    // Source: pret/pokeemerald — Thunderbolt cannot hit Dig targets
    expect(ruleset.canHitSemiInvulnerable("thunderbolt", "underground")).toBe(false);
  });

  it("given Ice Beam vs 'underwater' volatile, when canHitSemiInvulnerable is called, then returns false", () => {
    // Source: pret/pokeemerald — Ice Beam cannot hit Dive targets
    expect(ruleset.canHitSemiInvulnerable("ice-beam", "underwater")).toBe(false);
  });

  it("given any move vs 'charging' volatile, when canHitSemiInvulnerable is called, then returns true", () => {
    // Source: pret/pokeemerald — charging moves (SolarBeam, Skull Bash, Razor Wind, Sky Attack)
    // do NOT grant semi-invulnerability. Any move can hit a charging Pokemon.
    // canHitSemiInvulnerable returns true for "charging" meaning: "yes, this move can hit."
    expect(ruleset.canHitSemiInvulnerable("tackle", "charging")).toBe(true);
    expect(ruleset.canHitSemiInvulnerable("ice-beam", "charging")).toBe(true);
  });
});
