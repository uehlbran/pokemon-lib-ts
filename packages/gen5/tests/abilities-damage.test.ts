import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveEffect, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
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
  status?: string | null;
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
      speciesId: overrides.speciesId ?? 1,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: "male" as any,
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeMove(overrides: {
  id?: string;
  type?: PokemonType;
  category?: "physical" | "special" | "status";
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
}): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.id ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: true,
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
      ...overrides.flags,
    },
    effect: overrides.effect ?? null,
    description: "",
    generation: 5,
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
}): AbilityContext {
  return {
    pokemon: overrides.pokemon ?? makeActive({}),
    opponent: overrides.opponent ?? makeActive({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(42),
    trigger: "on-damage-calc",
    move: overrides.move ?? makeMove({}),
    damage: overrides.damage,
  };
}

// ===========================================================================
// hasSheerForceEligibleEffect (pure helper)
// ===========================================================================

describe("hasSheerForceEligibleEffect", () => {
  it("given a status-chance effect, when checking, then returns true", () => {
    // Source: Showdown -- Flamethrower has a 10% burn secondary; Sheer Force applies
    const effect: MoveEffect = { type: "status-chance", status: "burn", chance: 10 };
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a null effect, when checking, then returns false", () => {
    // Source: Showdown -- moves without secondaries are not boosted by Sheer Force
    expect(hasSheerForceEligibleEffect(null)).toBe(false);
  });

  it("given a stat-change targeting foe with chance < 100, when checking, then returns true", () => {
    // Source: Showdown -- Psychic has 10% SpDef drop on foe; counts as secondary
    const effect: MoveEffect = {
      type: "stat-change",
      changes: [{ stat: "spDefense", stages: -1 }],
      target: "foe",
      chance: 10,
    };
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a stat-change targeting self, when checking, then returns false", () => {
    // Source: Showdown -- Close Combat lowering own stats is NOT a secondary effect
    const effect: MoveEffect = {
      type: "stat-change",
      changes: [{ stat: "defense", stages: -1 }],
      target: "self",
      chance: 100,
    };
    expect(hasSheerForceEligibleEffect(effect)).toBe(false);
  });

  it("given a volatile-status with chance < 100, when checking, then returns true", () => {
    // Source: Showdown -- Air Slash has 30% flinch; counts as secondary
    const effect: MoveEffect = {
      type: "volatile-status",
      status: "flinch",
      chance: 30,
    };
    expect(hasSheerForceEligibleEffect(effect)).toBe(true);
  });

  it("given a recoil effect, when checking, then returns false", () => {
    // Source: Showdown -- recoil is not a secondary effect for Sheer Force
    const effect: MoveEffect = { type: "recoil", amount: 0.33 };
    expect(hasSheerForceEligibleEffect(effect)).toBe(false);
  });

  it("given a multi effect containing a status-chance, when checking, then returns true", () => {
    // Source: Showdown -- Scald (damage + 30% burn) has secondaries; Sheer Force applies
    const effect: MoveEffect = {
      type: "multi",
      effects: [{ type: "damage" }, { type: "status-chance", status: "burn", chance: 30 }],
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
    const pokemon = makeActive({ ability: "sheer-force" });
    const move = makeMove({
      type: "fire",
      category: "special",
      power: 90,
      effect: { type: "status-chance", status: "burn", chance: 10 },
    });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sheer Force attacker using Earthquake (no secondary), when checking damage calc, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Sheer Force only activates with secondaries
    const pokemon = makeActive({ ability: "sheer-force" });
    const move = makeMove({ type: "ground", power: 100, effect: null });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getSheerForceMultiplier", () => {
  it("given sheer-force ability and a move with status-chance, when calculating multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sheerforce onBasePower: chainModify([5325, 4096])
    // 5325/4096 = 1.300048828125
    const effect: MoveEffect = { type: "status-chance", status: "burn", chance: 10 };
    expect(getSheerForceMultiplier("sheer-force", effect)).toBe(5325 / 4096);
  });

  it("given sheer-force ability and a move without secondaries, when calculating multiplier, then returns 1", () => {
    // Source: Showdown -- no secondaries means no Sheer Force boost
    expect(getSheerForceMultiplier("sheer-force", null)).toBe(1);
  });

  it("given non-sheer-force ability, when calculating multiplier, then returns 1", () => {
    // Source: Only Sheer Force triggers this multiplier
    const effect: MoveEffect = { type: "status-chance", status: "burn", chance: 10 };
    expect(getSheerForceMultiplier("blaze", effect)).toBe(1);
  });
});

describe("sheerForceSuppressesLifeOrb", () => {
  it("given Sheer Force and a move with secondaries, when checking Life Orb suppression, then returns true", () => {
    // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
    const effect: MoveEffect = { type: "status-chance", status: "burn", chance: 10 };
    expect(sheerForceSuppressesLifeOrb("sheer-force", effect)).toBe(true);
  });

  it("given Sheer Force and a move without secondaries, when checking Life Orb suppression, then returns false", () => {
    // Source: Showdown -- Life Orb recoil is NOT suppressed for moves without secondaries
    expect(sheerForceSuppressesLifeOrb("sheer-force", null)).toBe(false);
  });
});

// ===========================================================================
// Analytic
// ===========================================================================

describe("Analytic", () => {
  it("given Analytic attacker and opponent already moved, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Analytic boosts if user moves last
    const pokemon = makeActive({ ability: "analytic" });
    const opponent = makeActive({ movedThisTurn: true });
    const ctx = makeAbilityContext({ pokemon, opponent });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Analytic attacker and opponent has not moved yet, when checking damage calc, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Analytic only boosts when moving last
    const pokemon = makeActive({ ability: "analytic" });
    const opponent = makeActive({ movedThisTurn: false });
    const ctx = makeAbilityContext({ pokemon, opponent });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getAnalyticMultiplier", () => {
  it("given analytic ability and opponent already moved, when calculating multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- analytic: chainModify([5325, 4096])
    expect(getAnalyticMultiplier("analytic", true)).toBe(5325 / 4096);
  });

  it("given analytic ability and opponent has not moved, when calculating multiplier, then returns 1", () => {
    // Source: Showdown -- Analytic does not boost if user moves first
    expect(getAnalyticMultiplier("analytic", false)).toBe(1);
  });
});

// ===========================================================================
// Sand Force
// ===========================================================================

describe("Sand Force", () => {
  it("given Sand Force attacker using Rock Slide in sandstorm, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Sand Force boosts Rock/Ground/Steel in sandstorm
    const pokemon = makeActive({ ability: "sand-force" });
    const move = makeMove({ type: "rock", power: 75 });
    const state = makeState({ weather: { type: "sand", turnsLeft: 5, source: "sand-stream" } });
    const ctx = makeAbilityContext({ pokemon, move, state });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sand Force attacker using Fire Blast in sandstorm, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Sand Force only boosts Rock/Ground/Steel types
    const pokemon = makeActive({ ability: "sand-force" });
    const move = makeMove({ type: "fire", power: 110, category: "special" });
    const state = makeState({ weather: { type: "sand", turnsLeft: 5, source: "sand-stream" } });
    const ctx = makeAbilityContext({ pokemon, move, state });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sand Force attacker using Earthquake with no weather, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Sand Force requires sandstorm to be active
    const pokemon = makeActive({ ability: "sand-force" });
    const move = makeMove({ type: "ground", power: 100 });
    const state = makeState({ weather: null });
    const ctx = makeAbilityContext({ pokemon, move, state });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getSandForceMultiplier", () => {
  it("given sand-force with Steel move in sandstorm, when calculating multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sandforce: chainModify([5325, 4096])
    expect(getSandForceMultiplier("sand-force", "steel", "sand")).toBe(5325 / 4096);
  });

  it("given sand-force with Ground move in sandstorm, when calculating multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sandforce: Ground is one of the 3 boosted types
    expect(getSandForceMultiplier("sand-force", "ground", "sand")).toBe(5325 / 4096);
  });

  it("given sand-force with Water move in sandstorm, when calculating multiplier, then returns 1", () => {
    // Source: Showdown -- Water is not boosted by Sand Force
    expect(getSandForceMultiplier("sand-force", "water", "sand")).toBe(1);
  });
});

// ===========================================================================
// Multiscale
// ===========================================================================

describe("Multiscale", () => {
  it("given Multiscale defender at full HP, when checking damage calc, then activates with damage-reduction effect", () => {
    // Source: Showdown data/abilities.ts -- Multiscale: chainModify(0.5) at full HP
    const pokemon = makeActive({ ability: "multiscale", hp: 300, currentHp: 300 });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });

  it("given Multiscale defender not at full HP, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Multiscale only works at full HP
    const pokemon = makeActive({ ability: "multiscale", hp: 300, currentHp: 299 });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getMultiscaleMultiplier", () => {
  it("given multiscale at full HP (200/200), when calculating multiplier, then returns 0.5", () => {
    // Source: Showdown data/abilities.ts -- multiscale: chainModify(0.5) at full HP
    expect(getMultiscaleMultiplier("multiscale", 200, 200)).toBe(0.5);
  });

  it("given multiscale at 199/200 HP, when calculating multiplier, then returns 1", () => {
    // Source: Showdown -- Multiscale requires hp >= maxhp (full HP)
    expect(getMultiscaleMultiplier("multiscale", 199, 200)).toBe(1);
  });
});

// ===========================================================================
// Sturdy (Gen 5 rework)
// ===========================================================================

describe("Sturdy (Gen 5 rework)", () => {
  it("given Sturdy defender at full HP receiving lethal damage, when checking immunity, then activates with survival message", () => {
    // Source: Showdown data/abilities.ts -- sturdy onDamage: at full HP, damage >= HP => HP - 1
    const pokemon = makeActive({ ability: "sturdy", hp: 200, currentHp: 200, nickname: "Golem" });
    const ctx = makeAbilityContext({ pokemon, damage: 300 });
    const result = handleGen5DamageImmunityAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toBe("Golem hung on thanks to Sturdy!");
  });

  it("given Sturdy defender not at full HP receiving lethal damage, when checking immunity, then does not activate", () => {
    // Source: Showdown -- Sturdy Focus Sash effect only works at full HP
    const pokemon = makeActive({ ability: "sturdy", hp: 200, currentHp: 150 });
    const ctx = makeAbilityContext({ pokemon, damage: 200 });
    const result = handleGen5DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sturdy defender hit by OHKO move, when checking immunity, then blocks the move entirely", () => {
    // Source: Showdown data/abilities.ts -- sturdy onTryHit: if move.ohko, return null
    const pokemon = makeActive({ ability: "sturdy", hp: 200, currentHp: 200, nickname: "Golem" });
    const move = makeMove({ effect: { type: "ohko" } });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageImmunityAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toBe("Golem held on thanks to Sturdy!");
  });

  it("given Sturdy defender at full HP receiving non-lethal damage, when checking immunity, then does not activate", () => {
    // Source: Showdown -- Sturdy only activates when damage >= HP at full HP
    const pokemon = makeActive({ ability: "sturdy", hp: 200, currentHp: 200 });
    const ctx = makeAbilityContext({ pokemon, damage: 100 });
    const result = handleGen5DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("getSturdyDamageCap", () => {
  it("given sturdy at full HP (200/200) and damage 300, when capping, then returns 199", () => {
    // Source: Showdown data/abilities.ts -- sturdy: return target.hp - 1
    expect(getSturdyDamageCap("sturdy", 300, 200, 200)).toBe(199);
  });

  it("given sturdy at 150/200 HP and damage 300, when capping, then returns original 300 (not at full HP)", () => {
    // Source: Showdown -- Sturdy requires full HP
    expect(getSturdyDamageCap("sturdy", 300, 150, 200)).toBe(300);
  });

  it("given sturdy at full HP (100/100) and damage 50, when capping, then returns original 50 (not lethal)", () => {
    // Source: Showdown -- Sturdy only caps when damage >= HP
    expect(getSturdyDamageCap("sturdy", 50, 100, 100)).toBe(50);
  });

  it("given sturdy at full HP (1/1) and damage 1, when capping, then returns 0 (leaves 1 HP)", () => {
    // Source: Showdown -- Edge case: maxHp - 1 = 0 when maxHp is 1 (Shedinja)
    expect(getSturdyDamageCap("sturdy", 1, 1, 1)).toBe(0);
  });
});

describe("sturdyBlocksOHKO", () => {
  it("given sturdy and OHKO effect, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts -- sturdy onTryHit: if move.ohko, return null
    expect(sturdyBlocksOHKO("sturdy", { type: "ohko" })).toBe(true);
  });

  it("given sturdy and non-OHKO effect, when checking, then returns false", () => {
    // Source: Showdown -- Sturdy OHKO block only applies to OHKO moves
    expect(sturdyBlocksOHKO("sturdy", { type: "damage" })).toBe(false);
  });

  it("given non-sturdy ability and OHKO effect, when checking, then returns false", () => {
    // Source: Only Sturdy blocks OHKO moves via this check
    expect(sturdyBlocksOHKO("blaze", { type: "ohko" })).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Tinted Lens
// ===========================================================================

describe("Tinted Lens", () => {
  it("given Tinted Lens attacker, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- tintedlens: if typeMod < 0, chainModify(2)
    // Tinted Lens always activates in the dispatch; the damage calc checks effectiveness
    const pokemon = makeActive({ ability: "tinted-lens" });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given non-Tinted-Lens attacker, when checking damage calc, then does not activate for tinted-lens", () => {
    // Source: Only Tinted Lens triggers this effect
    const pokemon = makeActive({ ability: "blaze" });
    const move = makeMove({ type: "fire", power: 90 });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    // Blaze only activates at low HP with matching type
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Solid Rock / Filter
// ===========================================================================

describe("Solid Rock / Filter", () => {
  it("given Solid Rock defender, when checking damage calc, then activates with damage-reduction", () => {
    // Source: Showdown data/abilities.ts -- solidrock: chainModify(0.75) when SE
    const pokemon = makeActive({ ability: "solid-rock" });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });

  it("given Filter defender, when checking damage calc, then activates with damage-reduction", () => {
    // Source: Showdown data/abilities.ts -- filter is identical to solidrock
    const pokemon = makeActive({ ability: "filter" });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });
});

// ===========================================================================
// Gen 4 carry-over abilities: Sniper
// ===========================================================================

describe("Sniper", () => {
  it("given Sniper attacker, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- sniper: if crit, chainModify(1.5) on top of 2x
    const pokemon = makeActive({ ability: "sniper" });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given non-Sniper attacker, when checking for sniper, then does not activate as sniper", () => {
    // Source: Only Sniper triggers the 3x crit multiplier
    const pokemon = makeActive({ ability: "none" });
    const ctx = makeAbilityContext({ pokemon });
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
    const pokemon = makeActive({ ability: "technician" });
    const move = makeMove({ power: 60 });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Technician attacker using a 80 BP move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Technician only boosts moves with BP <= 60
    const pokemon = makeActive({ ability: "technician" });
    const move = makeMove({ power: 80 });
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
    const pokemon = makeActive({ ability: "iron-fist" });
    const move = makeMove({ flags: { punch: true }, power: 75 });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Iron Fist attacker using a non-punching move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Iron Fist only boosts moves with the punch flag
    const pokemon = makeActive({ ability: "iron-fist" });
    const move = makeMove({ flags: { punch: false }, power: 75 });
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
    const pokemon = makeActive({ ability: "reckless" });
    const move = makeMove({ power: 120, effect: { type: "recoil", amount: 0.33 } });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Reckless attacker using a non-recoil move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Reckless only boosts moves with recoil
    const pokemon = makeActive({ ability: "reckless" });
    const move = makeMove({ power: 90, effect: null });
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
    const pokemon = makeActive({ ability: "adaptability", types: ["water"] });
    const move = makeMove({ type: "water", power: 80, category: "special" });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Adaptability attacker using a non-STAB move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Adaptability only modifies STAB
    const pokemon = makeActive({ ability: "adaptability", types: ["water"] });
    const move = makeMove({ type: "fire", power: 80 });
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
    const pokemon = makeActive({ ability: "hustle" });
    const move = makeMove({ category: "physical", power: 80 });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Hustle attacker using a special move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Hustle only applies to physical moves
    const pokemon = makeActive({ ability: "hustle" });
    const move = makeMove({ category: "special", power: 80 });
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
    const pokemon = makeActive({ ability: "huge-power" });
    const move = makeMove({ category: "physical", power: 80 });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Pure Power attacker using a physical move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- purepower: identical to hugepower
    const pokemon = makeActive({ ability: "pure-power" });
    const move = makeMove({ category: "physical", power: 80 });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Huge Power attacker using a special move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Huge Power only applies to physical Attack stat
    const pokemon = makeActive({ ability: "huge-power" });
    const move = makeMove({ category: "special", power: 80 });
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
    const pokemon = makeActive({ ability: "thick-fat" });
    const move = makeMove({ type: "fire", power: 90, category: "special" });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });

  it("given Thick Fat defender hit by Ice move, when checking damage calc, then activates", () => {
    // Source: Showdown -- Thick Fat applies to both Fire AND Ice
    const pokemon = makeActive({ ability: "thick-fat" });
    const move = makeMove({ type: "ice", power: 90, category: "special" });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Thick Fat defender hit by Water move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Thick Fat only applies to Fire and Ice
    const pokemon = makeActive({ ability: "thick-fat" });
    const move = makeMove({ type: "water", power: 90, category: "special" });
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
    const pokemon = makeActive({ ability: "guts", status: "burn" });
    const move = makeMove({ category: "physical", power: 80 });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Guts attacker with no status using a physical move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Guts requires a primary status condition
    const pokemon = makeActive({ ability: "guts", status: null });
    const move = makeMove({ category: "physical", power: 80 });
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
    const pokemon = makeActive({ ability: "marvel-scale", status: "poison" });
    const ctx = makeAbilityContext({ pokemon });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });

  it("given Marvel Scale defender with no status, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Marvel Scale requires a primary status condition
    const pokemon = makeActive({ ability: "marvel-scale", status: null });
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
    const pokemon = makeActive({ ability: "blaze", hp: 300, currentHp: 100, types: ["fire"] });
    const move = makeMove({ type: "fire", power: 80, category: "special" });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Overgrow attacker at full HP using Grass move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Overgrow only activates at HP <= maxHP/3
    const pokemon = makeActive({ ability: "overgrow", hp: 300, currentHp: 300, types: ["grass"] });
    const move = makeMove({ type: "grass", power: 80, category: "special" });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Torrent attacker at 1/3 HP using non-Water move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- Torrent only boosts Water-type moves
    const pokemon = makeActive({ ability: "torrent", hp: 300, currentHp: 100, types: ["water"] });
    const move = makeMove({ type: "normal", power: 80 });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Swarm attacker at exactly 1/3 HP using Bug move, when checking damage calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- swarm: if Bug and HP <= maxHP/3
    // HP=300, threshold=floor(300/3)=100, currentHP=100 <= 100 => activates
    const pokemon = makeActive({ ability: "swarm", hp: 300, currentHp: 100, types: ["bug"] });
    const move = makeMove({ type: "bug", power: 80, category: "special" });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Blaze attacker at 101/300 HP using Fire move, when checking damage calc, then does not activate", () => {
    // Source: Showdown -- threshold is floor(maxHP/3)=100, 101 > 100 so does not activate
    const pokemon = makeActive({ ability: "blaze", hp: 300, currentHp: 101, types: ["fire"] });
    const move = makeMove({ type: "fire", power: 80, category: "special" });
    const ctx = makeAbilityContext({ pokemon, move });
    const result = handleGen5DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
