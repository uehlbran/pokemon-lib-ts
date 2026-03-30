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
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  PrimaryStatus,
  TwoTurnMoveVolatile,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_POKEMON_DEFAULTS,
  CORE_SCREEN_IDS,
  CORE_STAT_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src/data";
import {
  handleGen8ContactAbility,
  handleGen8FieldAbility,
  handleGen8SwitchInAbility,
} from "../src/Gen8Abilities";
import { Gen8Ruleset } from "../src/Gen8Ruleset";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function createTestUid() {
  return `test-${nextTestUid++}`;
}

const DEFAULT_SYNTHETIC_STATS = {
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
} as const;

const dataManager = createGen8DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN8_ABILITY_IDS } as const;
const moveIds = { ...CORE_MOVE_IDS, ...GEN8_MOVE_IDS } as const;
const triggerIds = CORE_ABILITY_TRIGGER_IDS;
const typeIds = CORE_TYPE_IDS;
const volatileIds = CORE_VOLATILE_IDS;
const natureIds = { ...CORE_NATURE_IDS, ...GEN8_NATURE_IDS } as const;
const speciesIds = GEN8_SPECIES_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.corviknight);
const defaultNature = dataManager.getNature(natureIds.hardy).id;
const defaultMove = dataManager.getMove(moveIds.tackle);

function createTestRng() {
  return new SeededRandom(7);
}

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  primaryStatus?: PrimaryStatus | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, createTestRng(), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: CORE_POKEMON_DEFAULTS.metLocation,
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: GEN8_ITEM_IDS.pokeBall,
    moves: [defaultMove.id],
  });
  pokemon.uid = createTestUid();
  pokemon.nickname = overrides.nickname ?? pokemon.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.ability = overrides.ability ?? CORE_ABILITY_IDS.none;
  pokemon.abilitySlot = CORE_ABILITY_SLOTS.normal1;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.primaryStatus ?? null;
  pokemon.calculatedStats = {
    hp: maxHp,
    ...DEFAULT_SYNTHETIC_STATS,
  };
  return pokemon;
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  primaryStatus?: PrimaryStatus | null;
  heldItem?: string | null;
}): ActivePokemon {
  const pokemon = createSyntheticPokemonInstance({
    ability: overrides.ability,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    speciesId: overrides.speciesId,
    primaryStatus: overrides.primaryStatus,
    heldItem: overrides.heldItem,
  });
  const species = dataManager.getSpecies(pokemon.speciesId);
  const active = createBattleOnFieldPokemon(pokemon, 0, overrides.types ?? species.types);
  return {
    ...active,
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
  };
}

function createBattleSide(index: 0 | 1, active: ActivePokemon[] = []): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active,
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

function createBattleState(overrides?: { sides?: [BattleSide, BattleSide] }): BattleState {
  return {
    phase: "turn-end",
    generation: 8,
    format: "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [createBattleSide(0), createBattleSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: createTestRng(),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createCanonicalMove(moveId: (typeof moveIds)[keyof typeof moveIds]): MoveData {
  return dataManager.getMove(moveId) as MoveData;
}

function createAbilityContext(opts: {
  ability: string;
  trigger: (typeof triggerIds)[keyof typeof triggerIds];
  types?: PokemonType[];
  opponent?: ActivePokemon;
  nickname?: string | null;
  speciesId?: number;
  currentHp?: number;
  maxHp?: number;
  statChange?: {
    stat: string;
    stages: number;
    source: typeof BATTLE_EFFECT_TARGETS.self | typeof BATTLE_EFFECT_TARGETS.opponent;
  };
  move?: MoveData;
  state?: BattleState;
}): AbilityContext {
  const state = opts.state ?? createBattleState();
  const pokemon = createOnFieldPokemon({
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
    rng: state.rng,
    trigger: opts.trigger,
    statChange: opts.statChange as unknown as AbilityContext["statChange"],
    move: opts.move,
  };
}

// ===========================================================================
// handleGen8SwitchInAbility -- dispatcher routing
// ===========================================================================

describe("Gen 8 Abilities Dispatcher -- handleGen8SwitchInAbility", () => {
  // Source: Gen8Abilities.ts -- returns NO_ACTIVATION when trigger !== "on-switch-in"
  it("given handleGen8SwitchInAbility with wrong trigger (on-contact), when called, then returns not activated", () => {
    const ctx = createAbilityContext({
      ability: abilityIds.intimidate,
      trigger: triggerIds.onContact,
    });
    const result = handleGen8SwitchInAbility(abilityIds.intimidate, triggerIds.onContact, ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("given handleGen8SwitchInAbility with wrong trigger (on-turn-end), when called, then returns not activated", () => {
    const ctx = createAbilityContext({
      ability: abilityIds.drizzle,
      trigger: triggerIds.onTurnEnd,
    });
    const result = handleGen8SwitchInAbility(abilityIds.drizzle, triggerIds.onTurnEnd, ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  // Source: Gen8Abilities.ts -- delegates to handleGen8SwitchAbility when trigger === "on-switch-in"
  it("given handleGen8SwitchInAbility with correct trigger (on-switch-in) and screen-cleaner ability, when called, then delegates and activates", () => {
    // Source: Showdown data/abilities.ts -- Screen Cleaner removes screens on switch-in
    const state = createBattleState();
    state.sides[0].screens = [{ type: CORE_SCREEN_IDS.reflect, turnsLeft: 5 }];
    state.sides[1].screens = [{ type: CORE_SCREEN_IDS.lightScreen, turnsLeft: 3 }];
    const pokemon = createOnFieldPokemon({ ability: abilityIds.screenCleaner });
    const ctx: AbilityContext = {
      pokemon,
      state,
      rng: state.rng,
      trigger: triggerIds.onSwitchIn,
    };
    const result = handleGen8SwitchInAbility(abilityIds.screenCleaner, triggerIds.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ effectType: "none", target: "field" }]);
    expect(result.messages).toEqual([
      `${String(defaultSpecies.id)}'s Screen Cleaner removed all screens!`,
    ]);
  });

  it("given handleGen8SwitchInAbility with correct trigger (on-switch-in) and intrepid-sword ability, when called, then delegates and activates", () => {
    // Source: Showdown data/abilities.ts -- Intrepid Sword raises Attack on switch-in
    // Source: Bulbapedia -- "Intrepid Sword raises the user's Attack by one stage upon entering battle"
    const ctx = createAbilityContext({
      ability: abilityIds.intrepidSword,
      trigger: triggerIds.onSwitchIn,
    });
    const result = handleGen8SwitchInAbility(abilityIds.intrepidSword, triggerIds.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      {
        effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
        target: BATTLE_EFFECT_TARGETS.self,
        stat: CORE_STAT_IDS.attack,
        stages: 1,
      },
    ]);
    expect(result.messages).toEqual([
      `${String(defaultSpecies.id)}'s Intrepid Sword raised its Attack!`,
    ]);
  });
});

// ===========================================================================
// handleGen8ContactAbility -- dispatcher routing
// ===========================================================================

describe("Gen 8 Abilities Dispatcher -- handleGen8ContactAbility", () => {
  // Source: Gen8Abilities.ts -- returns NO_ACTIVATION when trigger !== "on-contact"
  it("given handleGen8ContactAbility with wrong trigger (on-switch-in), when called, then returns not activated", () => {
    const ctx = createAbilityContext({
      ability: abilityIds.static,
      trigger: triggerIds.onSwitchIn,
    });
    const result = handleGen8ContactAbility(abilityIds.static, triggerIds.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("given handleGen8ContactAbility with wrong trigger (on-stat-change), when called, then returns not activated", () => {
    const ctx = createAbilityContext({
      ability: abilityIds.flameBody,
      trigger: triggerIds.onStatChange,
    });
    const result = handleGen8ContactAbility(abilityIds.flameBody, triggerIds.onStatChange, ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  // Source: Gen8Abilities.ts -- delegates to handleGen8SwitchAbility when trigger === "on-contact"
  it("given handleGen8ContactAbility with correct trigger (on-contact) and wandering-spirit ability, when called, then delegates", () => {
    // Source: Showdown data/abilities.ts -- Wandering Spirit swaps abilities on contact
    // Source: Bulbapedia -- "Wandering Spirit swaps abilities when hit by a contact move"
    const attacker = createOnFieldPokemon({ ability: abilityIds.toughClaws });
    const ctx = createAbilityContext({
      ability: abilityIds.wanderingSpirit,
      trigger: triggerIds.onContact,
      opponent: attacker,
    });
    const result = handleGen8ContactAbility(abilityIds.wanderingSpirit, triggerIds.onContact, ctx);
    // Wandering Spirit activates when opponent is provided and ability is swappable
    expect(result.activated).toBe(true);
  });

  it("given handleGen8ContactAbility with correct trigger (on-contact) and perish-body ability, when called, then delegates", () => {
    // Source: Showdown data/abilities.ts -- Perish Body triggers Perish Song on contact
    // Source: Bulbapedia -- "Perish Body gives both the user and the attacker a perish count of 3"
    const attacker = createOnFieldPokemon({ ability: abilityIds.moldBreaker });
    const ctx = createAbilityContext({
      ability: abilityIds.perishBody,
      trigger: triggerIds.onContact,
      opponent: attacker,
    });
    const result = handleGen8ContactAbility(abilityIds.perishBody, triggerIds.onContact, ctx);
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
    const ctx = createAbilityContext({
      ability: abilityIds.regenerator,
      trigger: triggerIds.onSwitchOut,
      currentHp: 100,
      maxHp: 300,
    });
    const result = handleGen8FieldAbility(abilityIds.regenerator, triggerIds.onSwitchOut, ctx);
    expect(result.activated).toBe(true);
    // Heal effect should provide 100 HP (floor(300/3) = 100)
    // Source: Gen8AbilitiesSwitch.ts -- effectType:"heal", target:"self", value: healAmount
    const healEffect = result.effects.find(
      (e: any) => e.effectType === BATTLE_ABILITY_EFFECT_TYPES.heal,
    );
    expect((healEffect as { value?: number })?.value).toBe(100);
  });

  it("given handleGen8FieldAbility with on-before-move trigger and libero, when called, then delegates to switch handler", () => {
    // Source: Showdown data/abilities.ts -- Libero changes type on before-move
    // Source: Bulbapedia -- "Libero changes the Pokemon's type to the type of the move it is about to use"
    const ctx: AbilityContext = {
      pokemon: createOnFieldPokemon({ ability: abilityIds.libero, types: [typeIds.fire] }),
      state: createBattleState(),
      rng: createBattleState().rng,
      trigger: triggerIds.onBeforeMove,
      move: createCanonicalMove(moveIds.thunderbolt),
    };
    const result = handleGen8FieldAbility(abilityIds.libero, triggerIds.onBeforeMove, ctx);
    expect(result.activated).toBe(true);
  });

  // --- Mirror Armor special routing ---
  // Source: Gen8Abilities.ts -- on-stat-change + mirror-armor routes to handleMirrorArmorStatChange
  // Source: Showdown data/abilities.ts -- Mirror Armor onTryBoost
  // Source: Bulbapedia "Mirror Armor" -- "Bounces back stat-lowering effects"

  it("given handleGen8FieldAbility with on-stat-change trigger and mirror-armor ability with opponent stat drop, when called, then reflects the drop", () => {
    const ctx = createAbilityContext({
      ability: abilityIds.mirrorArmor,
      trigger: triggerIds.onStatChange,
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen8FieldAbility(abilityIds.mirrorArmor, triggerIds.onStatChange, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "stat-change", target: "opponent", stat: "attack", stages: -1 },
    ]);
    expect(result.messages[0]).toContain("Mirror Armor");
  });

  it("given handleGen8FieldAbility with on-stat-change trigger and mirror-armor ability with opponent defense drop, when called, then reflects the drop", () => {
    const ctx = createAbilityContext({
      ability: abilityIds.mirrorArmor,
      trigger: triggerIds.onStatChange,
      nickname: "Corviknight",
      statChange: { stat: "defense", stages: -2, source: "opponent" },
    });
    const result = handleGen8FieldAbility(abilityIds.mirrorArmor, triggerIds.onStatChange, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "stat-change", target: "opponent", stat: "defense", stages: -2 },
    ]);
    expect(result.messages[0]).toContain("Corviknight");
    expect(result.messages[0]).toContain("Mirror Armor");
  });

  it("given handleGen8FieldAbility with on-stat-change and mirror-armor but self-caused drop, when called, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor only reflects opponent-caused drops
    const ctx = createAbilityContext({
      ability: abilityIds.mirrorArmor,
      trigger: triggerIds.onStatChange,
      statChange: { stat: "attack", stages: -1, source: "self" },
    });
    const result = handleGen8FieldAbility(abilityIds.mirrorArmor, triggerIds.onStatChange, ctx);
    expect(result.activated).toBe(false);
  });

  it("given handleGen8FieldAbility with on-stat-change and mirror-armor but positive stages (boost), when called, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Mirror Armor only reflects drops (negative stages)
    const ctx = createAbilityContext({
      ability: abilityIds.mirrorArmor,
      trigger: triggerIds.onStatChange,
      statChange: { stat: "attack", stages: 1, source: "opponent" },
    });
    const result = handleGen8FieldAbility(abilityIds.mirrorArmor, triggerIds.onStatChange, ctx);
    expect(result.activated).toBe(false);
  });

  it("given handleGen8FieldAbility with on-stat-change and mirror-armor but hp stat, when called, then does not activate", () => {
    // Source: Gen8Abilities.ts -- HP cannot be stage-changed; Mirror Armor only reflects non-HP stats
    const ctx = createAbilityContext({
      ability: abilityIds.mirrorArmor,
      trigger: triggerIds.onStatChange,
      statChange: { stat: "hp", stages: -1, source: "opponent" },
    });
    const result = handleGen8FieldAbility(abilityIds.mirrorArmor, triggerIds.onStatChange, ctx);
    expect(result.activated).toBe(false);
  });

  it("given handleGen8FieldAbility with on-stat-change and mirror-armor but no statChange property, when called, then does not activate", () => {
    // Source: Gen8Abilities.ts -- returns NO_ACTIVATION if ctx.statChange is absent
    const ctx = createAbilityContext({
      ability: abilityIds.mirrorArmor,
      trigger: triggerIds.onStatChange,
    });
    // No statChange on the context
    const result = handleGen8FieldAbility(abilityIds.mirrorArmor, triggerIds.onStatChange, ctx);
    expect(result.activated).toBe(false);
  });

  it("given handleGen8FieldAbility with on-stat-change and non-mirror-armor ability (defiant), when called, then routes to switch handler and returns a valid AbilityResult", () => {
    // Source: Gen8Abilities.ts -- non-mirror-armor on-stat-change goes through the switch handler
    // Defiant is not implemented in the switch handler but the dispatcher must still return
    // a well-formed AbilityResult (not throw). This tests the routing path itself.
    const ctx = createAbilityContext({
      ability: abilityIds.defiant,
      trigger: triggerIds.onStatChange,
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen8FieldAbility(abilityIds.defiant, triggerIds.onStatChange, ctx);
    // The routing must produce a valid AbilityResult regardless of whether defiant activates
    expect(typeof result.activated).toBe("boolean");
    expect(Array.isArray(result.effects)).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
  });
});

// ===========================================================================
// Gen8Ruleset.recalculatesFutureAttackDamage
// ===========================================================================

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
    expect(ruleset.canHitSemiInvulnerable(moveIds.gust, volatileIds.flying)).toBe(true);
  });

  it("given flying volatile and twister move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.twister, volatileIds.flying)).toBe(true);
  });

  it("given flying volatile and thunder move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.thunder, volatileIds.flying)).toBe(true);
  });

  it("given flying volatile and sky-uppercut move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(CORE_MOVE_IDS.skyUppercut, volatileIds.flying)).toBe(
      true,
    );
  });

  it("given flying volatile and hurricane move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.hurricane, volatileIds.flying)).toBe(true);
  });

  it("given flying volatile and smack-down move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.smackDown, volatileIds.flying)).toBe(true);
  });

  it("given flying volatile and thousand-arrows move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.thousandArrows, volatileIds.flying)).toBe(true);
  });

  it("given flying volatile and tackle move, when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.tackle, volatileIds.flying)).toBe(false);
  });

  it("given flying volatile and earthquake move, when canHitSemiInvulnerable, then returns false", () => {
    // Source: Showdown -- earthquake does not hit flying targets
    expect(ruleset.canHitSemiInvulnerable(moveIds.earthquake, volatileIds.flying)).toBe(false);
  });

  // --- Underground volatile ---
  // Source: Showdown data/moves.ts -- Dig semi-invulnerable, bypassed by Earthquake/Magnitude/Fissure
  // Source: Bulbapedia -- "Earthquake, Magnitude, and Fissure can hit a Pokemon during Dig."

  it("given underground volatile and earthquake move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.earthquake, volatileIds.underground)).toBe(true);
  });

  it("given underground volatile and fissure move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.fissure, volatileIds.underground)).toBe(true);
  });

  it("given underground volatile and tackle move, when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.tackle, volatileIds.underground)).toBe(false);
  });

  it("given underground volatile and surf move, when canHitSemiInvulnerable, then returns false", () => {
    // Source: Showdown -- Surf does not hit underground targets (only underwater)
    expect(ruleset.canHitSemiInvulnerable(moveIds.surf, volatileIds.underground)).toBe(false);
  });

  // --- Underwater volatile ---
  // Source: Showdown data/moves.ts -- Dive semi-invulnerable, bypassed by Surf/Whirlpool
  // Source: Bulbapedia -- "Surf and Whirlpool can hit a Pokemon during Dive."

  it("given underwater volatile and surf move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.surf, volatileIds.underwater)).toBe(true);
  });

  it("given underwater volatile and whirlpool move, when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.whirlpool, volatileIds.underwater)).toBe(true);
  });

  it("given underwater volatile and tackle move, when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.tackle, volatileIds.underwater)).toBe(false);
  });

  it("given underwater volatile and earthquake move, when canHitSemiInvulnerable, then returns false", () => {
    // Source: Showdown -- Earthquake does not hit underwater targets
    expect(ruleset.canHitSemiInvulnerable(moveIds.earthquake, volatileIds.underwater)).toBe(false);
  });

  // --- Shadow Force charging volatile ---
  // Source: Showdown data/moves.ts -- Shadow Force / Phantom Force: nothing bypasses
  // Source: Bulbapedia -- "No move can hit a Pokemon during the charging turn of Shadow Force"

  it("given shadow-force-charging volatile and any move (tackle), when canHitSemiInvulnerable, then returns false", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.tackle, volatileIds.shadowForceCharging)).toBe(
      false,
    );
  });

  it("given shadow-force-charging volatile and any move (earthquake), when canHitSemiInvulnerable, then returns false", () => {
    expect(
      ruleset.canHitSemiInvulnerable(moveIds.earthquake, volatileIds.shadowForceCharging),
    ).toBe(false);
  });

  // --- Charging volatile (generic, NOT semi-invulnerable) ---
  // Source: Showdown data/moves.ts -- generic charging (SolarBeam etc.) is NOT semi-invulnerable
  // Source: Bulbapedia -- SolarBeam charge turn does not grant semi-invulnerability

  it("given charging volatile and tackle move, when canHitSemiInvulnerable, then returns true (charging is not semi-invulnerable)", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.tackle, volatileIds.charging)).toBe(true);
  });

  it("given charging volatile and any move (thunderbolt), when canHitSemiInvulnerable, then returns true", () => {
    expect(ruleset.canHitSemiInvulnerable(moveIds.thunderbolt, volatileIds.charging)).toBe(true);
  });

  // --- Default / unknown volatile ---
  // Source: Gen8Ruleset.ts -- default case returns false

  it("given unknown volatile (confusion) and any move, when canHitSemiInvulnerable, then returns false", () => {
    // confusion is not a semi-invulnerable state
    expect(
      ruleset.canHitSemiInvulnerable(
        moveIds.tackle,
        volatileIds.confusion as unknown as TwoTurnMoveVolatile,
      ),
    ).toBe(false);
  });

  it("given unknown volatile (substitute) and any move, when canHitSemiInvulnerable, then returns false", () => {
    expect(
      ruleset.canHitSemiInvulnerable(
        moveIds.earthquake,
        volatileIds.substitute as unknown as TwoTurnMoveVolatile,
      ),
    ).toBe(false);
  });
});
