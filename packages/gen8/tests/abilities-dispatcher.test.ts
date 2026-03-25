/**
 * Gen 8 ability dispatcher tests -- Wave 9.
 *
 * Covers:
 *   - handleGen8SwitchInAbility: routing based on trigger type
 *   - handleGen8ContactAbility: routing based on trigger type
 *   - handleGen8FieldAbility: routing based on trigger type, with Mirror Armor special case
 *   - Gen8Ruleset.recalculatesFutureAttackDamage: returns true (Gen 5+)
 *   - Gen8Ruleset.canHitSemiInvulnerable: volatile-specific move bypass checks
 *
 * Source: Gen8Abilities.ts -- dispatcher routing
 * Source: Showdown sim/battle-actions.ts -- canHitSemiInvulnerable (semi-invulnerable bypass)
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
 * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
 *   Future Sight or Doom Desire hits, not when it is used."
 */
import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "@pokemon-lib-ts/gen8";
import {
  handleGen8ContactAbility,
  handleGen8FieldAbility,
  handleGen8SwitchInAbility,
} from "../src/Gen8Abilities";
import { Gen8Ruleset } from "../src/Gen8Ruleset";

// ---------------------------------------------------------------------------
// Helper factories (mirrors abilities-switch.test.ts pattern)
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function makeTestUid() {
  return `test-${nextTestUid++}`;
}

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: makeTestUid(),
    speciesId: overrides.speciesId ?? S.corviknight,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: N.hardy,
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: (overrides.status as PokemonInstance["status"]) ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: GEN8_ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: string | null;
  heldItem?: string | null;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      status: overrides.status,
      heldItem: overrides.heldItem,
    }),
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
    types: overrides.types ?? [T.normal],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
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
    forcedMove: null,
  } as ActivePokemon;
}

function makeSide(index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as BattleSide;
}

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 8,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  nickname?: string | null;
  speciesId?: number;
  currentHp?: number;
  maxHp?: number;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname,
    speciesId: opts.speciesId,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    rng: state.rng as any,
    trigger: opts.trigger as any,
    statChange: opts.statChange as any,
  };
}

// ===========================================================================
// handleGen8SwitchInAbility -- dispatcher routing
// ===========================================================================

describe("Gen 8 Abilities Dispatcher -- handleGen8SwitchInAbility", () => {
  // Source: Gen8Abilities.ts -- returns NO_ACTIVATION when trigger !== "on-switch-in"
  it("given handleGen8SwitchInAbility with wrong trigger (on-contact), when called, then returns not activated", () => {
    const ctx = makeContext({ ability: A.intimidate, trigger: "on-contact" });
    const result = handleGen8SwitchInAbility(A.intimidate, "on-contact", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("given handleGen8SwitchInAbility with wrong trigger (on-turn-end), when called, then returns not activated", () => {
    const ctx = makeContext({ ability: A.drizzle, trigger: "on-turn-end" });
    const result = handleGen8SwitchInAbility(A.drizzle, "on-turn-end", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  // Source: Gen8Abilities.ts -- delegates to handleGen8SwitchAbility when trigger === "on-switch-in"
  it("given handleGen8SwitchInAbility with correct trigger (on-switch-in) and screen-cleaner ability, when called, then delegates and activates", () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner removes screens on switch-in
    const state = makeBattleState();
    state.sides[0].screens = [{ type: "reflect", turnsLeft: 5 }] as any;
    state.sides[1].screens = [{ type: "light-screen", turnsLeft: 3 }] as any;
    const pokemon = makeActivePokemon({ ability: A.screenCleaner });
    const ctx: AbilityContext = {
      pokemon,
      state,
      rng: state.rng as any,
      trigger: "on-switch-in",
    };
    const result = handleGen8SwitchInAbility(A.screenCleaner, "on-switch-in", ctx);
    expect(result.activated).toBe(true);
  });

  it("given handleGen8SwitchInAbility with correct trigger (on-switch-in) and intrepid-sword ability, when called, then delegates and activates", () => {
    // Source: Showdown data/abilities.ts -- Intrepid Sword raises Attack on switch-in
    // Source: Bulbapedia -- "Intrepid Sword raises the user's Attack by one stage upon entering battle"
    const ctx = makeContext({ ability: A.intrepidSword, trigger: "on-switch-in" });
    const result = handleGen8SwitchInAbility(A.intrepidSword, "on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// handleGen8ContactAbility -- dispatcher routing
// ===========================================================================

describe("Gen 8 Abilities Dispatcher -- handleGen8ContactAbility", () => {
  // Source: Gen8Abilities.ts -- returns NO_ACTIVATION when trigger !== "on-contact"
  it("given handleGen8ContactAbility with wrong trigger (on-switch-in), when called, then returns not activated", () => {
    const ctx = makeContext({ ability: A.static, trigger: "on-switch-in" });
    const result = handleGen8ContactAbility(A.static, "on-switch-in", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("given handleGen8ContactAbility with wrong trigger (on-stat-change), when called, then returns not activated", () => {
    const ctx = makeContext({ ability: A.flameBody, trigger: "on-stat-change" });
    const result = handleGen8ContactAbility(A.flameBody, "on-stat-change", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  // Source: Gen8Abilities.ts -- delegates to handleGen8SwitchAbility when trigger === "on-contact"
  it("given handleGen8ContactAbility with correct trigger (on-contact) and wandering-spirit ability, when called, then delegates", () => {
    // Source: Showdown data/abilities.ts -- Wandering Spirit swaps abilities on contact
    // Source: Bulbapedia -- "Wandering Spirit swaps abilities when hit by a contact move"
    const attacker = makeActivePokemon({ ability: A.toughClaws });
    const ctx = makeContext({
      ability: A.wanderingSpirit,
      trigger: "on-contact",
      opponent: attacker,
    });
    const result = handleGen8ContactAbility(A.wanderingSpirit, "on-contact", ctx);
    // Wandering Spirit activates when opponent is provided and ability is swappable
    expect(result.activated).toBe(true);
  });

  it("given handleGen8ContactAbility with correct trigger (on-contact) and perish-body ability, when called, then delegates", () => {
    // Source: Showdown data/abilities.ts -- Perish Body triggers Perish Song on contact
    // Source: Bulbapedia -- "Perish Body gives both the user and the attacker a perish count of 3"
    const attacker = makeActivePokemon({ ability: A.moldBreaker });
    const ctx = makeContext({
      ability: A.perishBody,
      trigger: "on-contact",
      opponent: attacker,
    });
    const result = handleGen8ContactAbility(A.perishBody, "on-contact", ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// handleGen8FieldAbility -- dispatcher routing + Mirror Armor
// ===========================================================================

describe("Gen 8 Abilities Dispatcher -- handleGen8FieldAbility", () => {
  // Source: Gen8Abilities.ts -- routes non-mirror-armor/non-stat-change triggers through the switch handler
  it("given handleGen8FieldAbility with on-switch-out trigger and regenerator at 100/300 HP, when called, then heals 1/3 max HP and activates", () => {
    // Source: Showdown data/abilities.ts -- Regenerator heals 1/3 max HP on switch-out
    // With currentHp=100 and maxHp=300, heal = floor(300/3)=100, new HP = min(200, 300)=200
    const ctx = makeContext({
      ability: A.regenerator,
      trigger: "on-switch-out",
      currentHp: 100,
      maxHp: 300,
    });
    const result = handleGen8FieldAbility(A.regenerator, "on-switch-out", ctx);
    expect(result.activated).toBe(true);
    // Heal effect should provide 100 HP (floor(300/3) = 100)
    // Source: Gen8AbilitiesSwitch.ts -- effectType:"heal", target:"self", value: healAmount
    const healEffect = result.effects.find((e: any) => e.effectType === "heal");
    expect(healEffect).toBeDefined();
    expect((healEffect as any).value).toBe(100);
  });

  it("given handleGen8FieldAbility with on-before-move trigger and libero, when called, then delegates to switch handler", () => {
    // Source: Showdown data/abilities.ts -- Libero changes type on before-move
    // Source: Bulbapedia -- "Libero changes the Pokemon's type to the type of the move it is about to use"
    const ctx: AbilityContext = {
      pokemon: makeActivePokemon({ ability: A.libero, types: [T.fire] }),
      state: makeBattleState(),
      rng: makeBattleState().rng as any,
      trigger: "on-before-move",
      move: {
        id: M.thunderbolt,
        type: T.electric,
        category: "special",
        power: 90,
      } as any,
    };
    const result = handleGen8FieldAbility(A.libero, "on-before-move", ctx);
    expect(result.activated).toBe(true);
  });

  // --- Mirror Armor special routing ---
  // Source: Gen8Abilities.ts -- on-stat-change + mirror-armor routes to handleMirrorArmorStatChange
  // Source: Showdown data/abilities.ts -- Mirror Armor onTryBoost
  // Source: Bulbapedia "Mirror Armor" -- "Bounces back stat-lowering effects"

  it("given handleGen8FieldAbility with on-stat-change trigger and mirror-armor ability with opponent stat drop, when called, then reflects the drop", () => {
    const ctx = makeContext({
      ability: A.mirrorArmor,
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen8FieldAbility(A.mirrorArmor, "on-stat-change", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "stat-change", target: "opponent", stat: "attack", stages: -1 },
    ]);
    expect(result.messages[0]).toContain("Mirror Armor");
  });

  it("given handleGen8FieldAbility with on-stat-change trigger and mirror-armor ability with opponent defense drop, when called, then reflects the drop", () => {
    const ctx = makeContext({
      ability: A.mirrorArmor,
      trigger: "on-stat-change",
      nickname: "Corviknight",
      statChange: { stat: "defense", stages: -2, source: "opponent" },
    });
    const result = handleGen8FieldAbility(A.mirrorArmor, "on-stat-change", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "stat-change", target: "opponent", stat: "defense", stages: -2 },
    ]);
    expect(result.messages[0]).toContain("Corviknight");
    expect(result.messages[0]).toContain("Mirror Armor");
  });

  it("given handleGen8FieldAbility with on-stat-change and mirror-armor but self-caused drop, when called, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor only reflects opponent-caused drops
    const ctx = makeContext({
      ability: A.mirrorArmor,
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: -1, source: "self" },
    });
    const result = handleGen8FieldAbility(A.mirrorArmor, "on-stat-change", ctx);
    expect(result.activated).toBe(false);
  });

  it("given handleGen8FieldAbility with on-stat-change and mirror-armor but positive stages (boost), when called, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor only reflects drops (negative stages)
    const ctx = makeContext({
      ability: A.mirrorArmor,
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: 1, source: "opponent" },
    });
    const result = handleGen8FieldAbility(A.mirrorArmor, "on-stat-change", ctx);
    expect(result.activated).toBe(false);
  });

  it("given handleGen8FieldAbility with on-stat-change and mirror-armor but hp stat, when called, then does not activate", () => {
    // Source: Gen8Abilities.ts -- HP cannot be stage-changed; Mirror Armor only reflects non-HP stats
    const ctx = makeContext({
      ability: A.mirrorArmor,
      trigger: "on-stat-change",
      statChange: { stat: "hp", stages: -1, source: "opponent" },
    });
    const result = handleGen8FieldAbility(A.mirrorArmor, "on-stat-change", ctx);
    expect(result.activated).toBe(false);
  });

  it("given handleGen8FieldAbility with on-stat-change and mirror-armor but no statChange property, when called, then does not activate", () => {
    // Source: Gen8Abilities.ts -- returns NO_ACTIVATION if ctx.statChange is absent
    const ctx = makeContext({
      ability: A.mirrorArmor,
      trigger: "on-stat-change",
    });
    // No statChange on the context
    const result = handleGen8FieldAbility(A.mirrorArmor, "on-stat-change", ctx);
    expect(result.activated).toBe(false);
  });

  it("given handleGen8FieldAbility with on-stat-change and non-mirror-armor ability (defiant), when called, then routes to switch handler and returns a valid AbilityResult", () => {
    // Source: Gen8Abilities.ts -- non-mirror-armor on-stat-change goes through the switch handler
    // Defiant is not implemented in the switch handler but the dispatcher must still return
    // a well-formed AbilityResult (not throw). This tests the routing path itself.
    const ctx = makeContext({
      ability: A.defiant,
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen8FieldAbility(A.defiant, "on-stat-change", ctx);
    // The routing must produce a valid AbilityResult regardless of whether defiant activates
    expect(typeof result.activated).toBe("boolean");
    expect(Array.isArray(result.effects)).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
  });
});

// ===========================================================================
// Gen8Ruleset.recalculatesFutureAttackDamage
// ===========================================================================

const dataManager = createGen8DataManager();
const A = GEN8_ABILITY_IDS;
const M = GEN8_MOVE_IDS;
const T = CORE_TYPE_IDS;
const V = CORE_VOLATILE_IDS;
const N = GEN8_NATURE_IDS;
const S = GEN8_SPECIES_IDS;

function makeMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    ...dataManager.getMove(id),
    ...overrides,
  } as MoveData;
}

const ruleset = new Gen8Ruleset(dataManager);

describe("Gen8Ruleset -- recalculatesFutureAttackDamage", () => {
  // Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
  //   Future Sight or Doom Desire hits, not when it is used."
  it("given Gen8Ruleset, when recalculatesFutureAttackDamage(), then returns true (Gen 5+ behavior)", () => {
    expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
  });

  it("given Gen8Ruleset (generation 8 which is >= 5), when recalculatesFutureAttackDamage(), then is consistent with Gen 5+ rule", () => {
    // Source: Showdown sim/battle.ts -- Gen 5+ recalculates future attack damage at hit time
    // Triangulation: verifying both the return value AND the generation context
    expect(ruleset.generation).toBeGreaterThanOrEqual(5);
    expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
  });
});

// ===========================================================================
// Gen8Ruleset.canHitSemiInvulnerable
// ===========================================================================

describe("Gen8Ruleset -- canHitSemiInvulnerable", () => {
  // --- Flying volatile ---
  // Source: Showdown data/moves.ts -- Fly/Bounce semi-invulnerable, bypassed by specific moves
  // Source: Bulbapedia -- "Gust, Thunder, Twister, Sky Uppercut, Hurricane, Smack Down,
  //   and Thousand Arrows can hit a Pokemon during Fly."

  it("given flying volatile and gust move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.gust, V.flying)).toBe(true);
  });

  it("given flying volatile and twister move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.twister, V.flying)).toBe(true);
  });

  it("given flying volatile and thunder move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.thunder, V.flying)).toBe(true);
  });

  it("given flying volatile and sky-uppercut move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(CORE_MOVE_IDS.skyUppercut, V.flying)).toBe(true);
  });

  it("given flying volatile and hurricane move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.hurricane, V.flying)).toBe(true);
  });

  it("given flying volatile and smack-down move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.smackDown, V.flying)).toBe(true);
  });

  it("given flying volatile and thousand-arrows move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.thousandArrows, V.flying)).toBe(true);
  });

  it("given flying volatile and tackle move, when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(M.tackle, V.flying)).toBe(false);
  });

  it("given flying volatile and earthquake move, when canHitSemiInvulnerable, then returns false", () => {
    // Source: Showdown -- earthquake does not hit flying targets
    expect(ruleset.canHitSemiInvulnerable(M.earthquake, V.flying)).toBe(false);
  });

  // --- Underground volatile ---
  // Source: Showdown data/moves.ts -- Dig semi-invulnerable, bypassed by Earthquake/Magnitude/Fissure
  // Source: Bulbapedia -- "Earthquake, Magnitude, and Fissure can hit a Pokemon during Dig."

  it("given underground volatile and earthquake move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.earthquake, V.underground)).toBe(true);
  });

  it("given underground volatile and fissure move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.fissure, V.underground)).toBe(true);
  });

  it("given underground volatile and tackle move, when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(M.tackle, V.underground)).toBe(false);
  });

  it("given underground volatile and surf move, when canHitSemiInvulnerable, then returns false", () => {
    // Source: Showdown -- Surf does not hit underground targets (only underwater)
    expect(ruleset.canHitSemiInvulnerable(M.surf, V.underground)).toBe(false);
  });

  // --- Underwater volatile ---
  // Source: Showdown data/moves.ts -- Dive semi-invulnerable, bypassed by Surf/Whirlpool
  // Source: Bulbapedia -- "Surf and Whirlpool can hit a Pokemon during Dive."

  it("given underwater volatile and surf move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.surf, "underwater")).toBe(true);
  });

  it("given underwater volatile and whirlpool move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.whirlpool, "underwater")).toBe(true);
  });

  it("given underwater volatile and tackle move, when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(M.tackle, "underwater")).toBe(false);
  });

  it("given underwater volatile and earthquake move, when canHitSemiInvulnerable, then returns false", () => {
    // Source: Showdown -- Earthquake does not hit underwater targets
    expect(ruleset.canHitSemiInvulnerable(M.earthquake, "underwater")).toBe(false);
  });

  // --- Shadow Force charging volatile ---
  // Source: Showdown data/moves.ts -- Shadow Force / Phantom Force: nothing bypasses
  // Source: Bulbapedia -- "No move can hit a Pokemon during the charging turn of Shadow Force"

  it("given shadow-force-charging volatile and any move (tackle), when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(M.tackle, V.shadowForceCharging)).toBe(false);
  });

  it("given shadow-force-charging volatile and any move (earthquake), when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(M.earthquake, V.shadowForceCharging)).toBe(false);
  });

  // --- Charging volatile (generic, NOT semi-invulnerable) ---
  // Source: Showdown data/moves.ts -- generic charging (SolarBeam etc.) is NOT semi-invulnerable
  // Source: Bulbapedia -- SolarBeam charge turn does not grant semi-invulnerability

  it("given charging volatile and tackle move, when canHitSemiInvulnerable, then returns true (charging is not semi-invulnerable)", () => {
    expect(ruleset.canHitSemiInvulnerable(M.tackle, V.charging)).toBe(true);
  });

  it("given charging volatile and any move (thunderbolt), when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(M.thunderbolt, V.charging)).toBe(true);
  });

  // --- Default / unknown volatile ---
  // Source: Gen8Ruleset.ts -- default case returns false

  it("given unknown volatile (confusion) and any move, when canHitSemiInvulnerable, then returns false", () => {
    // confusion is not a semi-invulnerable state
    expect(ruleset.canHitSemiInvulnerable(M.tackle, V.confusion as any)).toBe(false);
  });

  it("given unknown volatile (substitute) and any move, when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(M.earthquake, V.substitute as any)).toBe(false);
  });
});
