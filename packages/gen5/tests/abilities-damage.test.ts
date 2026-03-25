import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveEffect, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import {
  getAnalyticMultiplier,
  getMultiscaleMultiplier,
  getSandForceMultiplier,
  getSheerForceMultiplier,
  getSturdyDamageCap,
  handleGen5DamageCalcAbility,
  handleGen5DamageImmunityAbility,
  hasSheerForceEligibleEffect,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "../src/Gen5AbilitiesDamage";

const dataManager = createGen5DataManager();
const ABILITY_IDS = GEN5_ABILITY_IDS;
const MOVE_IDS = GEN5_MOVE_IDS;
const M = MOVE_IDS;
const NATURE_IDS = GEN5_NATURE_IDS;
const SPECIES_IDS = GEN5_SPECIES_IDS;
const TYPE_IDS = CORE_TYPE_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const WEATHER_IDS = CORE_WEATHER_IDS;
const NONE_ABILITY = CORE_ABILITY_IDS.none;

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

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
  status?: PrimaryStatus | null;
  speciesId?: number;
  nickname?: string | null;
  movedThisTurn?: boolean;
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
      speciesId: overrides.speciesId ?? SPECIES_IDS.charizard,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURE_IDS.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? NONE_ABILITY,
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: overrides.status ?? null,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
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
    types: overrides.types ?? [TYPE_IDS.normal],
    ability: overrides.ability ?? NONE_ABILITY,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: overrides.movedThisTurn ?? false,
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

function makeMove(
  moveId: string,
  overrides: {
    displayName?: string;
    type?: PokemonType;
    category?: MoveData["category"];
    power?: number | null;
    flags?: Partial<MoveData["flags"]>;
    effect?: MoveData["effect"];
  } = {},
): MoveData {
  const baseMove = dataManager.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    id: moveId,
    flags: { ...baseMove.flags, ...(overrides.flags ?? {}) },
    effect: overrides.effect ?? baseMove.effect,
    generation: baseMove.generation,
  } as MoveData;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 5,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function makeAbilityContext(overrides: {
  pokemon?: ActivePokemon;
  opponent?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  damage?: number;
  isCrit?: boolean;
  typeEffectiveness?: number;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon ?? makeActive({}),
    opponent: overrides.opponent ?? makeActive({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(42),
    trigger: "on-damage-calc",
    move: overrides.move ?? makeMove(M.tackle),
    damage: overrides.damage,
    isCrit: overrides.isCrit,
    typeEffectiveness: overrides.typeEffectiveness,
  };
}

// ===========================================================================
// hasSheerForceEligibleEffect (pure helper)
// ===========================================================================

describe("hasSheerForceEligibleEffect", () => {
  it("given a status-chance effect, when checking, then returns true", () => {
    // Source: Showdown -- Flamethrower has a 10% burn secondary; Sheer Force applies
    const effect = dataManager.getMove(M.flamethrower).effect;
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a null effect, when checking, then returns false", () => {
    // Source: Showdown -- moves without secondaries are not boosted by Sheer Force
    expect(hasSheerForceEligibleEffect(dataManager.getMove(M.earthquake).effect)).toBe(false);
  });

  it("given a stat-change targeting foe with chance < 100, when checking, then returns true", () => {
    // Source: Showdown -- Psychic has 10% SpDef drop on foe; counts as secondary
    const effect = dataManager.getMove(M.acidSpray).effect;
    // Source: Showdown data/abilities.ts -- sheerforce suppresses all secondary effects targeting foe
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a stat-change targeting foe with chance 100 (e.g., Acid Spray), when checking, then returns true", () => {
    // Source: Showdown data/moves.ts -- Acid Spray: secondary: { chance: 100, boosts: { spd: -2 } }
    const effect = dataManager.getMove(M.acidSpray).effect;
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a stat-change targeting self (e.g., Close Combat), when checking, then returns false", () => {
    // Source: Showdown data/moves.ts -- Close Combat uses `self`, not `secondary`
    const effect = dataManager.getMove(M.closeCombat).effect;
    expect(hasSheerForceEligibleEffect(effect)).toBe(false);
  });

  it("given a stat-change targeting self with fromSecondary true (e.g., Flame Charge), when checking, then returns true", () => {
    // Source: Showdown data/moves.ts -- Flame Charge Speed boost comes from secondary.self
    const effect = dataManager.getMove(M.flameCharge).effect;
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a stat-change targeting self without fromSecondary (e.g., Draco Meteor), when checking, then returns false", () => {
    // Source: Showdown data/moves.ts -- Draco Meteor uses `self`, not `secondary.self`
    const effect = dataManager.getMove(M.dracoMeteor).effect;
    expect(hasSheerForceEligibleEffect(effect)).toBe(false);
  });

  it("given a volatile-status with chance < 100 (e.g., Air Slash flinch), when checking, then returns true", () => {
    // Source: Showdown -- Air Slash has 30% flinch; counts as secondary
    const effect = dataManager.getMove(M.airSlash).effect;
    // Source: Showdown data/abilities.ts -- Air Slash 30% flinch secondary is suppressed by Sheer Force
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a volatile-status with chance 100 (e.g., Fake Out flinch), when checking, then returns true", () => {
    // Source: Showdown data/moves.ts -- fakeout: secondary: { chance: 100, volatileStatus: 'flinch' }
    const effect = dataManager.getMove(M.fakeOut).effect;
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a volatile-status with chance 100 (e.g., Dynamic Punch confusion), when checking, then returns true", () => {
    // Source: Showdown data/moves.ts -- dynamicpunch: secondary: { chance: 100, volatileStatus: 'confusion' }
    const effect = dataManager.getMove(M.dynamicPunch).effect;
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a recoil effect, when checking, then returns false", () => {
    // Source: Showdown -- recoil is not a secondary effect for Sheer Force
    const effect = dataManager.getMove(M.doubleEdge).effect;
    expect(hasSheerForceEligibleEffect(effect)).toBe(false);
  });

  it("given a multi effect containing a status-chance, when checking, then returns true", () => {
    // Source: Showdown -- Scald (damage + 30% burn) has secondaries; Sheer Force applies
    const effect: MoveEffect = {
      type: "multi",
      effects: [{ type: "damage" }, dataManager.getMove(M.scald).effect as MoveEffect],
    };
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });
});

// ===========================================================================
// Sheer Force
// ===========================================================================

describe("Sheer Force", () => {
  it("given Sheer Force attacker using Flamethrower (10% burn), when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force activates on moves with secondaries
    // Flamethrower has status-chance burn at 10%
    const pokemon = makeActive({ ability: ABILITY_IDS.sheerForce });
    const move = makeMove(M.flamethrower);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sheer Force attacker using Earthquake (no secondary), when checking damage calc, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force only activates with secondaries
    const pokemon = makeActive({ ability: ABILITY_IDS.sheerForce });
    const move = makeMove(M.earthquake);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getSheerForceMultiplier", () => {
  it("given sheer-force ability and a move with status-chance, when calculating multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sheerforce onBasePower: chainModify([5325, 4096])
    // 5325/4096 = 1.300048828125
    const effect = dataManager.getMove(M.flamethrower).effect;
    expect(getSheerForceMultiplier(ABILITY_IDS.sheerForce, effect)).toBe(5325 / 4096);
  });

  it("given sheer-force ability and a move without secondaries, when calculating multiplier, then returns 1", () => {
    // Source: Showdown -- no secondaries means no Sheer Force boost
    expect(getSheerForceMultiplier(ABILITY_IDS.sheerForce, dataManager.getMove(M.earthquake).effect)).toBe(1);
  });

  it("given non-sheer-force ability, when calculating multiplier, then returns 1", () => {
    // Source: Only Sheer Force triggers this multiplier
    const effect = dataManager.getMove(M.flamethrower).effect;
    expect(getSheerForceMultiplier(ABILITY_IDS.blaze, effect)).toBe(1);
  });
});

describe("sheerForceSuppressesLifeOrb", () => {
  it("given Sheer Force and a move with secondaries, when checking Life Orb suppression, then returns true", () => {
    // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
    const effect = dataManager.getMove(M.flamethrower).effect;
    expect(sheerForceSuppressesLifeOrb(ABILITY_IDS.sheerForce, effect)).toBe(true);
  });

  it("given Sheer Force and a move without secondaries, when checking Life Orb suppression, then returns false", () => {
    // Source: Showdown -- Life Orb recoil is NOT suppressed for moves without secondaries
    expect(sheerForceSuppressesLifeOrb(ABILITY_IDS.sheerForce, dataManager.getMove(M.earthquake).effect)).toBe(
      false,
    );
  });
});

// ===========================================================================
// Analytic
// ===========================================================================

describe("Analytic", () => {
  it("given Analytic attacker and opponent already moved, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Analytic boosts if user moves last
    const pokemon = makeActive({ ability: ABILITY_IDS.analytic });
    const opponent = makeActive({ movedThisTurn: true });
    const ctx = makeAbilityContext({ pokemon, opponent });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Analytic attacker and opponent has not moved yet, when checking damage calc, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Analytic only boosts when moving last
    const pokemon = makeActive({ ability: ABILITY_IDS.analytic });
    const opponent = makeActive({ movedThisTurn: false });
    const ctx = makeAbilityContext({ pokemon, opponent });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getAnalyticMultiplier", () => {
  it("given analytic ability and opponent already moved, when calculating multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- analytic: chainModify([5325, 4096])
    expect(getAnalyticMultiplier(ABILITY_IDS.analytic, true)).toBe(5325 / 4096);
  });

  it("given analytic ability and opponent has not moved, when calculating multiplier, then returns 1", () => {
    // Source: Showdown -- Analytic does not boost if user moves first
    expect(getAnalyticMultiplier(ABILITY_IDS.analytic, false)).toBe(1);
  });
});

// ===========================================================================
// Sand Force
// ===========================================================================

describe("Sand Force", () => {
  it("given Sand Force attacker using Rock Slide in sandstorm, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Sand Force boosts Rock/Ground/Steel in sandstorm
    const pokemon = makeActive({ ability: ABILITY_IDS.sandForce });
    const move = makeMove(M.rockSlide);
    const state = makeState({
      weather: { type: WEATHER_IDS.sand, turnsLeft: 5, source: ABILITY_IDS.sandStream },
    });
    const ctx = makeAbilityContext({ pokemon, move, state });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sand Force attacker using Fire Blast in sandstorm, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Sand Force only boosts Rock/Ground/Steel types
    const pokemon = makeActive({ ability: ABILITY_IDS.sandForce });
    const move = makeMove(M.fireBlast);
    const state = makeState({
      weather: { type: WEATHER_IDS.sand, turnsLeft: 5, source: ABILITY_IDS.sandStream },
    });
    const ctx = makeAbilityContext({ pokemon, move, state });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sand Force attacker using Earthquake with no weather, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Sand Force requires sandstorm to be active
    const pokemon = makeActive({ ability: ABILITY_IDS.sandForce });
    const move = makeMove(M.earthquake);
    const state = makeState({ weather: null });
    const ctx = makeAbilityContext({ pokemon, move, state });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getSandForceMultiplier", () => {
  it("given sand-force with Steel move in sandstorm, when calculating multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sandforce: chainModify([5325, 4096])
    expect(getSandForceMultiplier(ABILITY_IDS.sandForce, TYPE_IDS.steel, WEATHER_IDS.sand)).toBe(5325 / 4096);
  });

  it("given sand-force with Ground move in sandstorm, when calculating multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sandforce: Ground is one of the 3 boosted types
    expect(getSandForceMultiplier(ABILITY_IDS.sandForce, TYPE_IDS.ground, WEATHER_IDS.sand)).toBe(5325 / 4096);
  });

  it("given sand-force with Water move in sandstorm, when calculating multiplier, then returns 1", () => {
    // Source: Showdown -- Water is not boosted by Sand Force
    expect(getSandForceMultiplier(ABILITY_IDS.sandForce, TYPE_IDS.water, WEATHER_IDS.sand)).toBe(1);
  });
});

// ===========================================================================
// Multiscale
// ===========================================================================

describe("Multiscale", () => {
  it("given Multiscale defender at full HP, when checking damage calc, then activates with damage-reduction effect", () => {
    // Source: Showdown data/abilities.ts -- Multiscale: chainModify(0.5) at full HP
    const pokemon = makeActive({ ability: ABILITY_IDS.multiscale, hp: 300, currentHp: 300 });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ effectType: "damage-reduction", target: "self" }]);
  });

  it("given Multiscale defender not at full HP, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Multiscale only works at full HP
    const pokemon = makeActive({ ability: ABILITY_IDS.multiscale, hp: 300, currentHp: 299 });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getMultiscaleMultiplier", () => {
  it("given multiscale at full HP (200/200), when calculating multiplier, then returns 0.5", () => {
    // Source: Showdown data/abilities.ts -- multiscale: chainModify(0.5) at full HP
    expect(getMultiscaleMultiplier(ABILITY_IDS.multiscale, 200, 200)).toBe(0.5);
  });

  it("given multiscale at 199/200 HP, when calculating multiplier, then returns 1", () => {
    // Source: Showdown -- Multiscale requires hp >= maxhp (full HP)
    expect(getMultiscaleMultiplier(ABILITY_IDS.multiscale, 199, 200)).toBe(1);
  });
});

// ===========================================================================
// Sturdy (Gen 5 rework)
// ===========================================================================

describe("Sturdy (Gen 5 rework)", () => {
  it("given Sturdy defender at full HP receiving lethal damage, when checking immunity, then does not activate (engine timing stub)", () => {
    // Sturdy's Focus Sash effect (survive at 1 HP from full HP) is a STUB.
    // The "on-damage-taken" trigger fires AFTER HP is set to 0 and is gated on currentHp > 0,
    // so this handler can never activate for lethal hits via the current engine lifecycle.
    // See Gen5AbilitiesDamage.ts JSDoc for the full explanation and tracking issue.
    // Source: Showdown data/abilities.ts -- sturdy onDamage (priority -30) — not yet wirable
    const pokemon = makeActive({
      ability: ABILITY_IDS.sturdy,
      hp: 200,
      currentHp: 200,
      nickname: "Golem",
      speciesId: SPECIES_IDS.golem,
    });
    const ctx = makeAbilityContext({ pokemon, damage: 300 });
    const result = handleGen5DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sturdy defender not at full HP receiving lethal damage, when checking immunity, then does not activate", () => {
    // Source: Showdown -- Sturdy Focus Sash effect only works at full HP
    const pokemon = makeActive({ ability: ABILITY_IDS.sturdy, hp: 200, currentHp: 150 });
    const ctx = makeAbilityContext({ pokemon, damage: 200 });
    const result = handleGen5DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sturdy defender hit by OHKO move, when checking immunity, then blocks the move entirely", () => {
    // Source: Showdown data/abilities.ts -- sturdy onTryHit: if move.ohko, return null
    const pokemon = makeActive({
      ability: ABILITY_IDS.sturdy,
      hp: 200,
      currentHp: 200,
      nickname: "Golem",
      speciesId: SPECIES_IDS.golem,
    });
    const move = makeMove(M.fissure);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageImmunityAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    // Source: Showdown data/abilities.ts -- sturdy onTryHit OHKO message format: "[pokemon] held on thanks to Sturdy!"
    expect(result.messages[0]).toBe("Golem held on thanks to Sturdy!");
  });

  it("given Sturdy defender at full HP receiving non-lethal damage, when checking immunity, then does not activate", () => {
    // Source: Showdown -- Sturdy only activates when damage >= HP at full HP
    const pokemon = makeActive({ ability: ABILITY_IDS.sturdy, hp: 200, currentHp: 200 });
    const ctx = makeAbilityContext({ pokemon, damage: 100 });
    const result = handleGen5DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getSturdyDamageCap", () => {
  it("given sturdy at full HP (200/200) and damage 300, when capping, then returns 199", () => {
    // Source: Showdown data/abilities.ts -- sturdy: return target.hp - 1
    expect(getSturdyDamageCap(ABILITY_IDS.sturdy, 300, 200, 200)).toBe(199);
  });

  it("given sturdy at 150/200 HP and damage 300, when capping, then returns original 300 (not at full HP)", () => {
    // Source: Showdown -- Sturdy requires full HP
    expect(getSturdyDamageCap(ABILITY_IDS.sturdy, 300, 150, 200)).toBe(300);
  });

  it("given sturdy at full HP (100/100) and damage 50, when capping, then returns original 50 (not lethal)", () => {
    // Source: Showdown -- Sturdy only caps when damage >= HP
    expect(getSturdyDamageCap(ABILITY_IDS.sturdy, 50, 100, 100)).toBe(50);
  });

  it("given sturdy at full HP (1/1) and damage 1, when capping, then returns 0 (leaves 1 HP)", () => {
    // Source: Showdown -- Edge case: maxHp - 1 = 0 when maxHp is 1 (Shedinja)
    expect(getSturdyDamageCap(ABILITY_IDS.sturdy, 1, 1, 1)).toBe(0);
  });
});

describe("sturdyBlocksOHKO", () => {
  it("given sturdy and OHKO effect, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts -- sturdy onTryHit: if move.ohko, return null
    expect(sturdyBlocksOHKO(ABILITY_IDS.sturdy, dataManager.getMove(M.fissure).effect)).toBe(true);
  });

  it("given sturdy and non-OHKO effect, when checking, then returns false", () => {
    // Source: Showdown -- Sturdy OHKO block only applies to OHKO moves
    expect(sturdyBlocksOHKO(ABILITY_IDS.sturdy, dataManager.getMove(M.earthquake).effect)).toBe(false);
  });

  it("given non-sturdy ability and OHKO effect, when checking, then returns false", () => {
    // Source: Only Sturdy blocks OHKO moves via this check
    expect(sturdyBlocksOHKO(ABILITY_IDS.blaze, dataManager.getMove(M.fissure).effect)).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Tinted Lens
// ===========================================================================

describe("Tinted Lens", () => {
  it("given Tinted Lens attacker with NVE move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- tintedlens: if typeMod < 0 (NVE), chainModify(2)
    const pokemon = makeActive({ ability: ABILITY_IDS.tintedLens });
    const ctx = makeAbilityContext({ pokemon, typeEffectiveness: 0.5 });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Tinted Lens attacker with double-resisted move, when checking damage calc, then activates", () => {
    // Source: Showdown -- typeMod < 0 includes 0.25x (double NVE)
    const pokemon = makeActive({ ability: ABILITY_IDS.tintedLens });
    const ctx = makeAbilityContext({ pokemon, typeEffectiveness: 0.25 });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Tinted Lens attacker with neutral move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Tinted Lens only activates when NVE (typeMod < 0)
    const pokemon = makeActive({ ability: ABILITY_IDS.tintedLens });
    const ctx = makeAbilityContext({ pokemon, typeEffectiveness: 1 });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Tinted Lens attacker with SE move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- SE moves don't trigger Tinted Lens
    const pokemon = makeActive({ ability: ABILITY_IDS.tintedLens });
    const ctx = makeAbilityContext({ pokemon, typeEffectiveness: 2 });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given non-Tinted-Lens attacker, when checking damage calc, then does not activate for tinted-lens", () => {
    // Source: Only Tinted Lens triggers this effect
    const pokemon = makeActive({ ability: ABILITY_IDS.blaze });
    const move = makeMove(M.flamethrower);
    const ctx = makeAbilityContext({ pokemon, move, typeEffectiveness: 0.5 });
    const result = handleGen5DamageCalcAbility(ctx);
    // Blaze only activates at low HP with matching type
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Solid Rock / Filter
// ===========================================================================

describe("Solid Rock / Filter", () => {
  it("given Solid Rock defender with SE move, when checking damage calc, then activates with damage-reduction", () => {
    // Source: Showdown data/abilities.ts -- solidrock: chainModify(0.75) when SE (typeMod > 0)
    const pokemon = makeActive({ ability: ABILITY_IDS.solidRock });
    const ctx = makeAbilityContext({ pokemon, typeEffectiveness: 2 });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ effectType: "damage-reduction", target: "self" }]);
  });

  it("given Filter defender with 4x SE move, when checking damage calc, then activates with damage-reduction", () => {
    // Source: Showdown data/abilities.ts -- filter is identical to solidrock; 4x SE qualifies
    const pokemon = makeActive({ ability: ABILITY_IDS.filter });
    const ctx = makeAbilityContext({ pokemon, typeEffectiveness: 4 });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ effectType: "damage-reduction", target: "self" }]);
  });

  it("given Solid Rock defender with neutral move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Solid Rock only activates for SE (typeMod > 0, i.e. effectiveness > 1)
    const pokemon = makeActive({ ability: ABILITY_IDS.solidRock });
    const ctx = makeAbilityContext({ pokemon, typeEffectiveness: 1 });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Filter defender with NVE move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Filter only activates for SE
    const pokemon = makeActive({ ability: ABILITY_IDS.filter });
    const ctx = makeAbilityContext({ pokemon, typeEffectiveness: 0.5 });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Sniper
// ===========================================================================

describe("Sniper", () => {
  it("given Sniper attacker on a crit, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- sniper: if crit, chainModify(1.5) on top of 2x
    const pokemon = makeActive({ ability: ABILITY_IDS.sniper });
    const ctx = makeAbilityContext({ pokemon, isCrit: true });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sniper attacker on a non-crit, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Sniper only triggers when the hit is a crit
    const pokemon = makeActive({ ability: ABILITY_IDS.sniper });
    const ctx = makeAbilityContext({ pokemon, isCrit: false });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sniper attacker with no isCrit context, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- isCrit defaults to falsy; Sniper should not activate
    const pokemon = makeActive({ ability: ABILITY_IDS.sniper });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given non-Sniper attacker, when checking for sniper, then does not activate as sniper", () => {
    // Source: Only Sniper triggers the 3x crit multiplier
    const pokemon = makeActive({ ability: NONE_ABILITY });
    const ctx = makeAbilityContext({ pokemon, isCrit: true });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Technician
// ===========================================================================

describe("Technician", () => {
  it("given Technician attacker using a 60 BP move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- technician: if basePower <= 60, chainModify(1.5)
    const pokemon = makeActive({ ability: ABILITY_IDS.technician });
    const move = makeMove(M.bugBite);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Technician attacker using a 75 BP move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Technician only boosts moves with BP <= 60
    const pokemon = makeActive({ ability: ABILITY_IDS.technician });
    const move = makeMove(M.rockSlide);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Iron Fist
// ===========================================================================

describe("Iron Fist", () => {
  it("given Iron Fist attacker using a punching move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- ironfist: if flags['punch'], chainModify([4915, 4096])
    const pokemon = makeActive({ ability: ABILITY_IDS.ironFist });
    const move = makeMove(M.firePunch);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Iron Fist attacker using a non-punching move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Iron Fist only boosts moves with the punch flag
    const pokemon = makeActive({ ability: ABILITY_IDS.ironFist });
    const move = makeMove(M.rockSlide);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Reckless
// ===========================================================================

describe("Reckless", () => {
  it("given Reckless attacker using a recoil move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- reckless: if recoil, chainModify([4915, 4096])
    const pokemon = makeActive({ ability: ABILITY_IDS.reckless });
    const move = makeMove(M.braveBird);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Reckless attacker using a non-recoil move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Reckless only boosts moves with recoil
    const pokemon = makeActive({ ability: ABILITY_IDS.reckless });
    const move = makeMove(M.flamethrower);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Adaptability
// ===========================================================================

describe("Adaptability", () => {
  it("given Adaptability attacker using a STAB move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- adaptability: STAB becomes 2x instead of 1.5x
    const pokemon = makeActive({ ability: ABILITY_IDS.adaptability, types: [TYPE_IDS.water] });
    const move = makeMove(M.waterPulse);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Adaptability attacker using a non-STAB move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Adaptability only modifies STAB
    const pokemon = makeActive({ ability: ABILITY_IDS.adaptability, types: [TYPE_IDS.water] });
    const move = makeMove(M.flamethrower);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Hustle
// ===========================================================================

describe("Hustle", () => {
  it("given Hustle attacker using a physical move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- hustle: 1.5x Atk for physical moves
    const pokemon = makeActive({ ability: ABILITY_IDS.hustle });
    const move = makeMove(M.rockSlide);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Hustle attacker using a special move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Hustle only applies to physical moves
    const pokemon = makeActive({ ability: ABILITY_IDS.hustle });
    const move = makeMove(M.waterPulse);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Huge Power / Pure Power
// ===========================================================================

describe("Huge Power / Pure Power", () => {
  it("given Huge Power attacker using a physical move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- hugepower: chainModify(2) for physical
    const pokemon = makeActive({ ability: ABILITY_IDS.hugePower });
    const move = makeMove(M.rockSlide);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Pure Power attacker using a physical move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- purepower: identical to hugepower
    const pokemon = makeActive({ ability: ABILITY_IDS.purePower });
    const move = makeMove(M.rockSlide);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Huge Power attacker using a special move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Huge Power only applies to physical Attack stat
    const pokemon = makeActive({ ability: ABILITY_IDS.hugePower });
    const move = makeMove(M.waterPulse);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Thick Fat
// ===========================================================================

describe("Thick Fat", () => {
  it("given Thick Fat defender hit by Fire move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- thickfat: chainModify(0.5) for Fire/Ice
    const pokemon = makeActive({ ability: ABILITY_IDS.thickFat });
    const move = makeMove(M.flamethrower);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    // Source: Showdown data/abilities.ts -- thickfat returns a damage-reduction effect for Fire/Ice moves
    expect(result.effects).toEqual([{ effectType: "damage-reduction", target: "self" }]);
  });

  it("given Thick Fat defender hit by Ice move, when checking damage calc, then activates", () => {
    // Source: Showdown -- Thick Fat applies to both Fire AND Ice
    const pokemon = makeActive({ ability: ABILITY_IDS.thickFat });
    const move = makeMove(M.iceBeam);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Thick Fat defender hit by Water move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Thick Fat only applies to Fire and Ice
    const pokemon = makeActive({ ability: ABILITY_IDS.thickFat });
    const move = makeMove(M.waterPulse);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Guts
// ===========================================================================

describe("Guts", () => {
  it("given Guts attacker with burn using a physical move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- guts: if pokemon.status, chainModify(1.5) for physical
    const pokemon = makeActive({ ability: ABILITY_IDS.guts, status: STATUS_IDS.burn });
    const move = makeMove(M.rockSlide);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Guts attacker with no status using a physical move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Guts requires a primary status condition
    const pokemon = makeActive({ ability: ABILITY_IDS.guts, status: null });
    const move = makeMove(M.rockSlide);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Marvel Scale
// ===========================================================================

describe("Marvel Scale", () => {
  it("given Marvel Scale defender with poison, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- marvelscale: if pokemon.status, chainModify(1.5) for Def
    const pokemon = makeActive({ ability: ABILITY_IDS.marvelScale, status: STATUS_IDS.poison });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ effectType: "damage-reduction", target: "self" }]);
  });

  it("given Marvel Scale defender with no status, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Marvel Scale requires a primary status condition
    const pokemon = makeActive({ ability: ABILITY_IDS.marvelScale, status: null });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Blaze/Overgrow/Torrent/Swarm (pinch)
// ===========================================================================

describe("Blaze/Overgrow/Torrent/Swarm (pinch abilities)", () => {
  it("given Blaze attacker at 1/3 HP using Fire move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- blaze: if Fire move and HP <= maxHP/3, chainModify(1.5)
    // HP=300, threshold=floor(300/3)=100, currentHP=100 <= 100 => activates
    const pokemon = makeActive({
      ability: ABILITY_IDS.blaze,
      hp: 300,
      currentHp: 100,
      types: [TYPE_IDS.fire],
    });
    const move = makeMove(M.flamethrower);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Overgrow attacker at full HP using Grass move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Overgrow only activates at HP <= maxHP/3
    const pokemon = makeActive({
      ability: ABILITY_IDS.overgrow,
      hp: 300,
      currentHp: 300,
      types: [TYPE_IDS.grass],
    });
    const move = makeMove(M.energyBall);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Torrent attacker at 1/3 HP using non-Water move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Torrent only boosts Water-type moves
    const pokemon = makeActive({
      ability: ABILITY_IDS.torrent,
      hp: 300,
      currentHp: 100,
      types: [TYPE_IDS.water],
    });
    const move = makeMove(M.rockSlide);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Swarm attacker at exactly 1/3 HP using Bug move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- swarm: if Bug and HP <= maxHP/3
    // HP=300, threshold=floor(300/3)=100, currentHP=100 <= 100 => activates
    const pokemon = makeActive({
      ability: ABILITY_IDS.swarm,
      hp: 300,
      currentHp: 100,
      types: [TYPE_IDS.bug],
    });
    const move = makeMove(M.bugBite);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Blaze attacker at 101/300 HP using Fire move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- threshold is floor(maxHP/3)=100, 101 > 100 so does not activate
    const pokemon = makeActive({
      ability: ABILITY_IDS.blaze,
      hp: 300,
      currentHp: 101,
      types: [TYPE_IDS.fire],
    });
    const move = makeMove(M.flamethrower);
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
