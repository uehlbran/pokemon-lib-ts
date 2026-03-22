import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveTarget } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  AURORA_VEIL_DEFAULT_TURNS,
  AURORA_VEIL_LIGHT_CLAY_TURNS,
  calculateClangorousSoulCost,
  calculateObstructPenalty,
  calculateSpikyShieldDamage,
  calculateSteelBeamRecoil,
  executeGen8Defog,
  executeGen8MoveEffect,
  getFishiousBoltBeakPower,
  getRapidSpinSpeedBoost,
  handleDrainEffect,
  handleJawLock,
  handleNoRetreat,
  handleTarShot,
  isAntiDynamaxMove,
  isBlockedByBanefulBunker,
  isBlockedByKingsShield,
  isBlockedByObstruct,
  isBlockedBySpikyShield,
  isBodyPress,
  isGen8GrassPowderBlocked,
  isSteelBeamRecoil,
  isTarShotActive,
} from "../src/Gen8MoveEffects";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  ability?: string;
  heldItem?: string | null;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  consecutiveProtects?: number;
  turnsOnField?: number;
  nickname?: string;
  maxHp?: number;
  currentHp?: number;
  moves?: Array<{ moveId: string }>;
  types?: readonly string[];
  status?: string | null;
  speciesId?: number;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      moves: overrides.moves ?? [{ moveId: "tackle" }],
      nickname: overrides.nickname ?? null,
      speciesId: overrides.speciesId ?? 25,
    },
    ability: overrides.ability ?? "blaze",
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: (overrides.types ?? ["normal"]) as readonly string[],
    consecutiveProtects: overrides.consecutiveProtects ?? 0,
    turnsOnField: overrides.turnsOnField ?? 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
  } as unknown as ActivePokemon;
}

function makeMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    displayName: id,
    type: "normal",
    category: "status",
    power: null,
    accuracy: null,
    pp: 10,
    priority: 0,
    target: "self" as MoveTarget,
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
      protect: false,
      mirror: false,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 8,
    ...overrides,
  } as MoveData;
}

function makeState(overrides?: Partial<BattleState>): BattleState {
  return {
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    weather: null,
    terrain: null,
    rng: new SeededRandom(42),
    ...overrides,
  } as unknown as BattleState;
}

function makeContext(
  moveId: string,
  options?: {
    state?: Partial<BattleState>;
    attacker?: Parameters<typeof makeActivePokemon>[0];
    defender?: Parameters<typeof makeActivePokemon>[0];
    moveOverrides?: Partial<MoveData>;
    damage?: number;
  },
): MoveEffectContext {
  return {
    attacker: makeActivePokemon(options?.attacker ?? {}),
    defender: makeActivePokemon(options?.defender ?? {}),
    move: makeMove(moveId, options?.moveOverrides),
    damage: options?.damage ?? 0,
    state: makeState(options?.state),
    rng: new SeededRandom(42),
  } as MoveEffectContext;
}

/** Always-succeed protect roll for testing guard moves */
function alwaysSucceedProtect(_consecutiveProtects: number, _rng: SeededRandom): boolean {
  return true;
}

/** Always-fail protect roll for testing guard move failure */
function alwaysFailProtect(_consecutiveProtects: number, _rng: SeededRandom): boolean {
  return false;
}

// ===========================================================================
// Spiky Shield
// ===========================================================================

describe("Gen8 isBlockedBySpikyShield", () => {
  it("given non-contact move with protect flag, when checking Spiky Shield, then blocks without contact damage", () => {
    // Source: Showdown data/moves.ts -- spikyshield: blocks all protect-flagged moves
    // Non-contact = no recoil damage to attacker
    const result = isBlockedBySpikyShield(true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactDamage).toBe(false);
  });

  it("given contact move with protect flag, when checking Spiky Shield, then blocks AND deals contact damage", () => {
    // Source: Showdown data/moves.ts -- spikyshield:
    //   if (this.checkMoveMakesContact(move, source, target))
    //     this.damage(source.baseMaxhp / 8, source, target)
    const result = isBlockedBySpikyShield(true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactDamage).toBe(true);
  });
});

describe("Gen8 calculateSpikyShieldDamage", () => {
  it("given attacker with 200 max HP, when calculating contact damage, then returns 25 (floor(200/8))", () => {
    // Source: Showdown data/moves.ts -- this.damage(source.baseMaxhp / 8, ...)
    // 200 / 8 = 25
    expect(calculateSpikyShieldDamage(200)).toBe(25);
  });

  it("given attacker with 7 max HP, when calculating contact damage, then returns 1 (minimum)", () => {
    // Source: Showdown -- damage function enforces minimum 1
    // floor(7 / 8) = 0, clamped to 1
    expect(calculateSpikyShieldDamage(7)).toBe(1);
  });

  it("given attacker with 300 max HP, when calculating contact damage, then returns 37 (floor(300/8))", () => {
    // Source: Showdown data/moves.ts -- floor(300 / 8) = 37
    expect(calculateSpikyShieldDamage(300)).toBe(37);
  });
});

// ===========================================================================
// Baneful Bunker
// ===========================================================================

describe("Gen8 isBlockedByBanefulBunker", () => {
  it("given contact move with protect flag, when checking Baneful Bunker, then blocked AND poisons attacker on contact", () => {
    // Source: Showdown data/moves.ts -- banefulbunker:
    //   if (this.checkMoveMakesContact(move, source, target))
    //     source.trySetStatus('psn', target);
    const result = isBlockedByBanefulBunker(true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPoison).toBe(true);
  });

  it("given non-contact move with protect flag, when checking Baneful Bunker, then blocked without poison", () => {
    // Source: Showdown -- blocked but no contact means no poison
    const result = isBlockedByBanefulBunker(true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactPoison).toBe(false);
  });

  it("given move without protect flag, when checking Baneful Bunker, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect']) return;
    const result = isBlockedByBanefulBunker(false, true);
    expect(result.blocked).toBe(false);
    expect(result.contactPoison).toBe(false);
  });
});

// ===========================================================================
// King's Shield
// ===========================================================================

describe("Gen8 isBlockedByKingsShield", () => {
  it("given physical contact move with protect flag, when checking, then blocked with -2 Attack penalty", () => {
    // Source: Showdown mods/gen7/moves.ts -- this.boost({ atk: -2 }, ...)
    // Gen 7+ behavior unchanged in Gen 8
    const result = isBlockedByKingsShield("physical", true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
    expect(result.attackDropStages).toBe(-2);
  });

  it("given status move with protect flag, when checking King's Shield, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect'] || move.category === 'Status') return;
    // King's Shield allows status moves through (unlike Protect/Spiky Shield)
    const result = isBlockedByKingsShield("status", true, false);
    expect(result.blocked).toBe(false);
    expect(result.contactPenalty).toBe(false);
    expect(result.attackDropStages).toBe(0);
  });
});

// ===========================================================================
// Obstruct (NEW in Gen 8)
// ===========================================================================

describe("Gen8 Obstruct -- executeGen8MoveEffect", () => {
  it("given no consecutive protect uses, when Obstruct is used, then succeeds and sets obstruct volatile", () => {
    // Source: Showdown data/moves.ts -- obstruct: volatileStatus: 'obstruct', duration: 1
    const ctx = makeContext("obstruct");
    const rng = new SeededRandom(42);
    const result = executeGen8MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("obstruct");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given stalling check fails, when Obstruct is used, then fails", () => {
    // Source: Showdown data/moves.ts -- obstruct: stallingMove: true
    const ctx = makeContext("obstruct");
    const rng = new SeededRandom(42);
    const result = executeGen8MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });
});

describe("Gen8 isBlockedByObstruct", () => {
  it("given contact move with protect flag, when checking Obstruct, then blocked with -2 Defense penalty", () => {
    // Source: Showdown data/moves.ts -- obstruct:
    //   if (this.checkMoveMakesContact(move, source, target))
    //     this.boost({ def: -2 }, source, target);
    const result = isBlockedByObstruct(true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
    expect(result.defenseDropStages).toBe(-2);
  });

  it("given non-contact move with protect flag, when checking Obstruct, then blocked without Defense penalty", () => {
    // Source: Showdown -- blocked but no contact means no def drop
    const result = isBlockedByObstruct(true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(false);
    expect(result.defenseDropStages).toBe(0);
  });

  it("given move without protect flag, when checking Obstruct, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect']) return;
    const result = isBlockedByObstruct(false, true);
    expect(result.blocked).toBe(false);
    expect(result.contactPenalty).toBe(false);
    expect(result.defenseDropStages).toBe(0);
  });
});

describe("Gen8 calculateObstructPenalty", () => {
  it("given contact was made, when calculating Obstruct penalty, then returns -2 defense stages", () => {
    // Source: Showdown data/moves.ts -- obstruct: this.boost({ def: -2 }, source, target)
    const result = calculateObstructPenalty(true);
    expect(result.defenseStages).toBe(-2);
  });

  it("given no contact was made, when calculating Obstruct penalty, then returns 0 defense stages", () => {
    // Source: Showdown -- no contact means no penalty
    const result = calculateObstructPenalty(false);
    expect(result.defenseStages).toBe(0);
  });
});

// ===========================================================================
// Rapid Spin (Gen 8 buff)
// ===========================================================================

describe("Gen8 getRapidSpinSpeedBoost", () => {
  it("given Rapid Spin hits successfully, when getting speed boost, then returns +1 Speed", () => {
    // Source: Showdown data/moves.ts -- rapidSpin Gen 8: onAfterHit: this.boost({ spe: 1 })
    // Source: Bulbapedia -- "Starting in Generation VIII, Rapid Spin also raises
    //   the user's Speed by one stage."
    const result = getRapidSpinSpeedBoost("rapid-spin", true);
    expect(result.speedStages).toBe(1);
  });

  it("given Rapid Spin misses, when getting speed boost, then returns 0 Speed", () => {
    // Source: Showdown -- onAfterHit only fires when move hits
    const result = getRapidSpinSpeedBoost("rapid-spin", false);
    expect(result.speedStages).toBe(0);
  });

  it("given a different move hits successfully, when getting speed boost, then returns 0 Speed", () => {
    // Only Rapid Spin gets the Gen 8 speed boost, not other moves
    const result = getRapidSpinSpeedBoost("tackle", true);
    expect(result.speedStages).toBe(0);
  });
});

// ===========================================================================
// Defog (Gen 8 enhancement)
// ===========================================================================

describe("Gen8 executeGen8Defog", () => {
  it("given target side has Stealth Rock and Spikes, when using Defog, then removes target-side hazards", () => {
    // Source: Showdown data/moves.ts -- defog: removes all hazards from target side
    const result = executeGen8Defog(
      [], // user side hazards
      ["stealth-rock", "spikes"], // target side hazards
      [], // user side screens
      [], // target side screens
      null, // no terrain
    );
    expect(result.clearedHazards).toContain("stealth-rock");
    expect(result.clearedHazards).toContain("spikes");
    expect(result.clearedHazards).toHaveLength(2);
  });

  it("given user side has Toxic Spikes, when using Defog, then also removes user-side hazards", () => {
    // Source: Showdown data/moves.ts -- defog Gen 6+: also clears user's side
    const result = executeGen8Defog(
      ["toxic-spikes"], // user side hazards
      [], // target side hazards
      [], // user side screens
      [], // target side screens
      null,
    );
    expect(result.clearedHazards).toContain("toxic-spikes");
    expect(result.clearedHazards).toHaveLength(1);
  });

  it("given target side has G-Max Steelsurge, when using Defog, then removes G-Max Steelsurge", () => {
    // Source: Showdown data/moves.ts -- defog Gen 8: removes gmaxsteelsurge
    // G-Max Steelsurge is a Steel-type Stealth Rock set by G-Max Copperajah
    const result = executeGen8Defog(
      [], // user side
      ["g-max-steelsurge"], // target side
      [], // user screens
      [], // target screens
      null,
    );
    expect(result.clearedHazards).toContain("g-max-steelsurge");
  });

  it("given active terrain is electric, when using Defog, then clears terrain", () => {
    // Source: Showdown data/moves.ts -- defog Gen 8: this.field.clearTerrain()
    const result = executeGen8Defog(
      [],
      [],
      [],
      [],
      "electric", // active terrain
    );
    expect(result.clearedTerrain).toBe(true);
  });

  it("given no active terrain, when using Defog, then clearedTerrain is false", () => {
    // No terrain to clear
    const result = executeGen8Defog([], [], [], [], null);
    expect(result.clearedTerrain).toBe(false);
  });

  it("given target side has Aurora Veil and user side has Safeguard and Mist, when using Defog, then removes screens from both sides", () => {
    // Source: Showdown data/moves.ts -- defog Gen 8:
    //   target.side.removeSideCondition('auroraveil');
    //   target.side.removeSideCondition('safeguard');
    //   target.side.removeSideCondition('mist');
    //   source.side.removeSideCondition('auroraveil');
    //   source.side.removeSideCondition('safeguard');
    //   source.side.removeSideCondition('mist');
    const result = executeGen8Defog(
      [], // user hazards
      [], // target hazards
      ["safeguard", "mist"], // user screens
      ["aurora-veil"], // target screens
      null,
    );
    expect(result.clearedScreens).toContain("aurora-veil");
    expect(result.clearedScreens).toContain("safeguard");
    expect(result.clearedScreens).toContain("mist");
    expect(result.clearedScreens).toHaveLength(3);
  });
});

// ===========================================================================
// Steel Beam
// ===========================================================================

describe("Gen8 Steel Beam", () => {
  it("given user with 200 max HP, when calculating Steel Beam recoil, then returns 100 (Math.round(200/2))", () => {
    // Source: Showdown sim/battle-actions.ts -- mindBlownRecoil: Math.round(pokemon.maxhp / 2)
    // Math.round(200 / 2) = 100
    expect(calculateSteelBeamRecoil(200)).toBe(100);
  });

  it("given user with 301 max HP, when calculating Steel Beam recoil, then returns 151 (Math.round(301/2))", () => {
    // Source: Showdown -- mindBlownRecoil uses Math.round
    // Math.round(301 / 2) = Math.round(150.5) = 151
    expect(calculateSteelBeamRecoil(301)).toBe(151);
  });

  it("given move is steel-beam, when checking isSteelBeamRecoil, then returns true", () => {
    // Source: Showdown data/moves.ts -- steelbeam: mindBlownRecoil: true
    expect(isSteelBeamRecoil("steel-beam")).toBe(true);
  });

  it("given move is not steel-beam, when checking isSteelBeamRecoil, then returns false", () => {
    expect(isSteelBeamRecoil("flash-cannon")).toBe(false);
  });
});

// ===========================================================================
// No Retreat
// ===========================================================================

describe("Gen8 handleNoRetreat", () => {
  it("given user does not have no-retreat volatile, when using No Retreat, then gains +1 all stats and sets volatile", () => {
    // Source: Showdown data/moves.ts -- noretreat:
    //   boosts: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }
    //   volatileStatus: 'noretreat'
    // Source: Bulbapedia -- "No Retreat raises the user's Attack, Defense,
    //   Special Attack, Special Defense, and Speed by one stage each."
    const result = handleNoRetreat(false);

    expect(result.selfVolatileInflicted).toBe("no-retreat");
    expect(result.statChanges).toHaveLength(5);
    expect(result.statChanges).toContainEqual({ target: "attacker", stat: "attack", stages: 1 });
    expect(result.statChanges).toContainEqual({ target: "attacker", stat: "defense", stages: 1 });
    expect(result.statChanges).toContainEqual({
      target: "attacker",
      stat: "spAttack",
      stages: 1,
    });
    expect(result.statChanges).toContainEqual({
      target: "attacker",
      stat: "spDefense",
      stages: 1,
    });
    expect(result.statChanges).toContainEqual({ target: "attacker", stat: "speed", stages: 1 });
  });

  it("given user already has no-retreat volatile, when using No Retreat, then fails", () => {
    // Source: Showdown -- onTry: if (source.volatiles['noretreat']) return false;
    const result = handleNoRetreat(true);
    expect(result.messages[0]).toBe("But it failed!");
    expect(result.statChanges).toHaveLength(0);
    expect(result.selfVolatileInflicted).toBeUndefined();
  });
});

describe("Gen8 No Retreat via executeGen8MoveEffect", () => {
  it("given user without no-retreat volatile, when dispatching no-retreat move, then sets volatile and boosts stats", () => {
    // Source: Showdown data/moves.ts -- noretreat boosts + trapping
    const ctx = makeContext("no-retreat");
    const rng = new SeededRandom(42);
    const result = executeGen8MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("no-retreat");
    expect(result!.statChanges).toHaveLength(5);
  });
});

// ===========================================================================
// Tar Shot
// ===========================================================================

describe("Gen8 handleTarShot", () => {
  it("given target does not have tar-shot volatile, when using Tar Shot, then lowers Speed by 1 and sets volatile", () => {
    // Source: Showdown data/moves.ts -- tarshot:
    //   boosts: { spe: -1 }, volatileStatus: 'tarshot'
    // Source: Bulbapedia -- "Tar Shot lowers the target's Speed stat by one stage.
    //   It also makes the target weak to Fire-type moves."
    const result = handleTarShot(false);

    expect(result.statChanges).toContainEqual({ target: "defender", stat: "speed", stages: -1 });
    expect(result.volatileInflicted).toBe("tar-shot");
    expect(result.messages[0]).toContain("weaker to fire");
  });

  it("given target already has tar-shot volatile, when using Tar Shot, then still drops Speed but does not re-set volatile", () => {
    // Source: Showdown -- boost always applies; volatile only sets if not already present
    const result = handleTarShot(true);

    expect(result.statChanges).toContainEqual({ target: "defender", stat: "speed", stages: -1 });
    expect(result.volatileInflicted).toBeNull(); // volatile not re-inflicted
  });
});

describe("Gen8 isTarShotActive", () => {
  it("given target has tar-shot volatile, when checking, then returns true", () => {
    // Source: Showdown -- tarshot condition.onEffectiveness checks for volatile
    const volatiles = new Map([["tar-shot", { turnsLeft: -1 }]]);
    expect(isTarShotActive(volatiles)).toBe(true);
  });

  it("given target does not have tar-shot volatile, when checking, then returns false", () => {
    const volatiles = new Map();
    expect(isTarShotActive(volatiles)).toBe(false);
  });
});

// ===========================================================================
// Clangorous Soul
// ===========================================================================

describe("Gen8 calculateClangorousSoulCost", () => {
  it("given user with 300 max HP, when calculating cost, then returns 100 (floor(300/3))", () => {
    // Source: Showdown data/moves.ts -- clangoroussoul:
    //   Math.floor(pokemon.maxhp / 3) HP cost
    // floor(300 / 3) = 100
    expect(calculateClangorousSoulCost(300)).toBe(100);
  });

  it("given user with 301 max HP, when calculating cost, then returns 100 (floor(301/3))", () => {
    // Source: Showdown -- Math.floor(301 / 3) = Math.floor(100.33) = 100
    expect(calculateClangorousSoulCost(301)).toBe(100);
  });

  it("given user with 100 max HP, when calculating cost, then returns 33 (floor(100/3))", () => {
    // Source: Showdown -- Math.floor(100 / 3) = Math.floor(33.33) = 33
    expect(calculateClangorousSoulCost(100)).toBe(33);
  });
});

describe("Gen8 Clangorous Soul via executeGen8MoveEffect", () => {
  it("given user with sufficient HP, when dispatching clangorous-soul, then costs 1/3 HP and boosts all stats", () => {
    // Source: Showdown data/moves.ts -- clangoroussoul: boosts { atk:1, def:1, spa:1, spd:1, spe:1 }
    //   cost = Math.floor(maxhp / 3)
    const ctx = makeContext("clangorous-soul", { attacker: { maxHp: 300, currentHp: 300 } });
    const rng = new SeededRandom(42);
    const result = executeGen8MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    // Cost: floor(300 / 3) = 100
    expect(result!.recoilDamage).toBe(100);
    expect(result!.statChanges).toHaveLength(5);
    expect(result!.statChanges).toContainEqual({ target: "attacker", stat: "attack", stages: 1 });
    expect(result!.statChanges).toContainEqual({ target: "attacker", stat: "speed", stages: 1 });
  });

  it("given user with HP equal to cost, when dispatching clangorous-soul, then fails (would faint)", () => {
    // Source: Showdown -- onTry: if (pokemon.hp <= Math.floor(pokemon.maxhp / 3)) return false;
    // maxHp=300, cost=100, currentHp=100 -> 100 <= 100 -> fails
    const ctx = makeContext("clangorous-soul", { attacker: { maxHp: 300, currentHp: 100 } });
    const rng = new SeededRandom(42);
    const result = executeGen8MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.messages[0]).toBe("But it failed!");
    expect(result!.statChanges).toHaveLength(0);
  });
});

// ===========================================================================
// Fishious Rend / Bolt Beak
// ===========================================================================

describe("Gen8 getFishiousBoltBeakPower", () => {
  it("given Fishious Rend and user moved first, when getting power, then returns 170 (85 * 2)", () => {
    // Source: Showdown data/moves.ts -- fishouisrend:
    //   basePowerCallback: if (target.newlySwitched || this.queue.willMove(target))
    //     return move.basePower * 2;  // 85 * 2 = 170
    // Source: Bulbapedia -- "If the user moves before the target, the power of
    //   Fishious Rend doubles from 85 to 170."
    expect(getFishiousBoltBeakPower("fishious-rend", true)).toBe(170);
  });

  it("given Fishious Rend and user moved second, when getting power, then returns 85", () => {
    // Source: Showdown -- base power 85 when moving after target
    expect(getFishiousBoltBeakPower("fishious-rend", false)).toBe(85);
  });

  it("given Bolt Beak and user moved first, when getting power, then returns 170 (85 * 2)", () => {
    // Source: Showdown data/moves.ts -- boltbeak: same basePowerCallback as Fishious Rend
    expect(getFishiousBoltBeakPower("bolt-beak", true)).toBe(170);
  });

  it("given Bolt Beak and user moved second, when getting power, then returns 85", () => {
    // Source: Showdown -- base power 85 when moving after target
    expect(getFishiousBoltBeakPower("bolt-beak", false)).toBe(85);
  });

  it("given a different move and user moved first, when getting power, then returns 85 (no doubling)", () => {
    // Only Fishious Rend and Bolt Beak get the doubling effect
    expect(getFishiousBoltBeakPower("tackle", true)).toBe(85);
  });
});

// ===========================================================================
// Jaw Lock
// ===========================================================================

describe("Gen8 handleJawLock", () => {
  it("given Jaw Lock hits, when handling effect, then traps both user and target with jaw-lock volatile", () => {
    // Source: Showdown data/moves.ts -- jawlock:
    //   onHit: source.addVolatile('jawlock', target); target.addVolatile('jawlock', source);
    // Source: Bulbapedia -- "Jaw Lock prevents the user and the target from switching
    //   out or fleeing."
    const result = handleJawLock();

    // Defender gets trapped
    expect(result.volatileInflicted).toBe("jaw-lock");
    expect(result.volatileData).toEqual({ turnsLeft: -1 });
    // Attacker also gets trapped
    expect(result.selfVolatileInflicted).toBe("jaw-lock");
    expect(result.selfVolatileData).toEqual({ turnsLeft: -1 });
    expect(result.messages[0]).toContain("Neither Pokemon can switch out");
  });

  it("given Jaw Lock hits, when handling effect, then both volatiles are permanent (turnsLeft=-1)", () => {
    // Source: Showdown -- jawlock condition traps while both on field, no duration limit
    const result = handleJawLock();
    expect(result.volatileData!.turnsLeft).toBe(-1);
    expect(result.selfVolatileData!.turnsLeft).toBe(-1);
  });
});

// ===========================================================================
// isAntiDynamaxMove
// ===========================================================================

describe("Gen8 isAntiDynamaxMove", () => {
  it("given behemoth-blade, when checking, then returns true", () => {
    // Source: Showdown data/conditions.ts:785 -- behemothblade: chainModify(2) vs Dynamax
    expect(isAntiDynamaxMove("behemoth-blade")).toBe(true);
  });

  it("given behemoth-bash, when checking, then returns true", () => {
    // Source: Showdown data/conditions.ts:785 -- behemothbash: chainModify(2) vs Dynamax
    expect(isAntiDynamaxMove("behemoth-bash")).toBe(true);
  });

  it("given dynamax-cannon, when checking, then returns true", () => {
    // Source: Showdown data/conditions.ts:785 -- dynamaxcannon: chainModify(2) vs Dynamax
    expect(isAntiDynamaxMove("dynamax-cannon")).toBe(true);
  });

  it("given iron-head (a regular Steel move), when checking, then returns false", () => {
    // Only the three anti-Dynamax moves get the 2x modifier
    expect(isAntiDynamaxMove("iron-head")).toBe(false);
  });
});

// ===========================================================================
// Body Press
// ===========================================================================

describe("Gen8 isBodyPress", () => {
  it("given body-press move, when checking, then returns true", () => {
    // Source: Showdown data/moves.ts -- bodypress: overrideOffensiveStat: 'def'
    expect(isBodyPress("body-press")).toBe(true);
  });

  it("given a different move, when checking, then returns false", () => {
    expect(isBodyPress("close-combat")).toBe(false);
  });
});

// ===========================================================================
// Drain Effects (carried forward from Gen 7)
// ===========================================================================

describe("Gen8 handleDrainEffect", () => {
  it("given Giga Drain dealing 100 damage (50% drain), when handling drain, then heals 50 HP", () => {
    // Source: Showdown data/moves.ts -- gigadrain: { drain: [1, 2] } = 50%
    // floor(100 * 0.5) = 50
    const ctx = makeContext("giga-drain", {
      damage: 100,
      moveOverrides: {
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(50);
  });

  it("given drain move dealing 0 damage, when handling drain, then returns null (no drain effect)", () => {
    // Source: Showdown sim/battle-actions.ts -- drain only triggers when damage > 0
    const ctx = makeContext("giga-drain", {
      damage: 0,
      moveOverrides: {
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// Powder Immunity (Gen 6+, Gen 8 expanded)
// ===========================================================================

describe("Gen8 isGen8GrassPowderBlocked", () => {
  it("given Grass-type target, when checking powder immunity, then returns true", () => {
    // Source: Showdown data/moves.ts -- powder moves: if (target.hasType('Grass')) return null;
    // Source: Bulbapedia -- "Grass-type Pokemon are immune to powder and spore moves."
    expect(isGen8GrassPowderBlocked(["grass"], "blaze", null)).toBe(true);
  });

  it("given Overcoat ability, when checking powder immunity, then returns true", () => {
    // Source: Showdown data/abilities.ts -- overcoat: blocks powder moves
    expect(isGen8GrassPowderBlocked(["normal"], "overcoat", null)).toBe(true);
  });

  it("given Safety Goggles held, when checking powder immunity, then returns true", () => {
    // Source: Showdown data/items.ts -- safetygoggles: blocks powder moves
    expect(isGen8GrassPowderBlocked(["normal"], "blaze", "safety-goggles")).toBe(true);
  });

  it("given non-Grass type without Overcoat or Safety Goggles, when checking, then returns false", () => {
    expect(isGen8GrassPowderBlocked(["fire"], "blaze", null)).toBe(false);
  });
});

// ===========================================================================
// Aurora Veil constants
// ===========================================================================

describe("Gen8 Aurora Veil constants", () => {
  it("AURORA_VEIL_DEFAULT_TURNS is 5", () => {
    // Source: Showdown data/moves.ts -- auroraveil: sideCondition, duration: 5
    expect(AURORA_VEIL_DEFAULT_TURNS).toBe(5);
  });

  it("AURORA_VEIL_LIGHT_CLAY_TURNS is 8", () => {
    // Source: Showdown data/items.ts -- lightclay: extends screen duration by 3 (5+3=8)
    expect(AURORA_VEIL_LIGHT_CLAY_TURNS).toBe(8);
  });
});
