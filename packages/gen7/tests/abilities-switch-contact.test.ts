import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getWeatherDuration,
  handleGen7SwitchAbility,
  hasMagicGuard,
  hasOvercoat,
  isBulletproofBlocked,
  isDampBlocked,
  isMoldBreakerAbility,
  isSoundproofBlocked,
  rollHarvest,
  rollShedSkin,
  TRACE_UNCOPYABLE_ABILITIES,
  UNSUPPRESSABLE_ABILITIES,
} from "../src/Gen7AbilitiesSwitch";

/**
 * Gen 7 switch-in, switch-out, contact, and passive ability tests.
 *
 * Tests carry-forward abilities from Gen 6 and Gen 7 additions:
 *   - Intimidate, Download, Trace (updated ban list)
 *   - Weather abilities with rock extensions (5 base / 8 with rock)
 *   - Regenerator, Natural Cure (switch-out)
 *   - Rough Skin, Flame Body, Static, Poison Point, Effect Spore (contact)
 *   - Gooey / Tangling Hair (new Tangling Hair in Gen 7)
 *   - Mummy (contact ability overwrite)
 *   - Magic Guard, Overcoat, Soundproof, Bulletproof, Damp (passive checks)
 *   - Shed Skin, Harvest (end-of-turn RNG checks)
 *   - Mold Breaker / Teravolt / Turboblaze detection
 *
 * Source: Showdown data/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  gender?: "male" | "female" | "genderless";
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: `test-${Math.random()}`,
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: (overrides.status as PokemonInstance["status"]) ?? null,
    friendship: 0,
    gender: overrides.gender ?? "male",
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
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
  gender?: "male" | "female" | "genderless";
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  calcDefense?: number;
  calcSpDefense?: number;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      status: overrides.status,
      heldItem: overrides.heldItem,
      gender: overrides.gender,
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: overrides.substituteHp ?? 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  };
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
  };
}

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 7,
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

function _makeMove(
  type: PokemonType,
  opts: {
    id?: string;
    category?: "physical" | "special" | "status";
    flags?: Record<string, boolean>;
  } = {},
): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type,
    category: opts.category ?? "physical",
    power: opts.category === "status" ? 0 : 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "single",
    generation: 7,
    flags: opts.flags ?? { contact: true },
    effectChance: null,
    secondaryEffects: [],
  } as unknown as MoveData;
}

function makeContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  move?: MoveData;
  nickname?: string;
  heldItem?: string | null;
  speciesId?: number;
  status?: string | null;
  currentHp?: number;
  maxHp?: number;
  rng?: { next: () => number };
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  gender?: "male" | "female" | "genderless";
}): AbilityContext {
  const state = makeBattleState();
  if (opts.rng) {
    (state as any).rng = { ...state.rng, ...opts.rng };
  }
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname,
    heldItem: opts.heldItem,
    speciesId: opts.speciesId,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    substituteHp: opts.substituteHp,
    volatiles: opts.volatiles,
    gender: opts.gender,
  });
  if (opts.opponent) {
    // Override calculated stats for Download tests
    if ((opts.opponent as any)._calcDefOverride !== undefined) {
      opts.opponent.pokemon.calculatedStats = {
        ...opts.opponent.pokemon.calculatedStats!,
        defense: (opts.opponent as any)._calcDefOverride,
        spDefense: (opts.opponent as any)._calcSpDefOverride,
      };
    }
  }

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    rng: (opts.rng ?? state.rng) as any,
    trigger: opts.trigger as any,
    move: opts.move,
  };
}

// ---------------------------------------------------------------------------
// Tests: on-switch-in
// ---------------------------------------------------------------------------

describe("Gen 7 Switch-in Abilities", () => {
  describe("Intimidate", () => {
    it("given Intimidate user, when switching in with opponent, then lowers opponent Attack by 1 stage", () => {
      // Source: Showdown data/abilities.ts -- Intimidate: -1 Atk to foe on switch-in
      const opponent = makeActivePokemon({ ability: "inner-focus" });
      const ctx = makeContext({
        ability: "intimidate",
        trigger: "on-switch-in",
        nickname: "Gyarados",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0]).toEqual({
        effectType: "stat-change",
        target: "opponent",
        stat: "attack",
        stages: -1,
      });
      expect(result.messages[0]).toContain("Intimidate");
    });

    it("given Intimidate user, when opponent has Substitute, then does not lower Attack", () => {
      // Source: Showdown data/abilities.ts -- Intimidate blocked by Substitute
      const opponent = makeActivePokemon({ ability: "inner-focus", substituteHp: 50 });
      const ctx = makeContext({
        ability: "intimidate",
        trigger: "on-switch-in",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(false);
    });

    it("given Intimidate user, when no opponent present, then does not activate", () => {
      // Source: Showdown -- no opponent to target
      const ctx = makeContext({
        ability: "intimidate",
        trigger: "on-switch-in",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(false);
    });
  });

  describe("Trace", () => {
    it("given Trace user, when opponent has a copyable ability, then copies opponent ability", () => {
      // Source: Showdown data/abilities.ts -- Trace: copies opponent's ability
      const opponent = makeActivePokemon({ ability: "levitate" });
      const ctx = makeContext({
        ability: "trace",
        trigger: "on-switch-in",
        nickname: "Gardevoir",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0]).toEqual({
        effectType: "ability-change",
        target: "self",
        newAbility: "levitate",
      });
      expect(result.messages[0]).toContain("traced");
    });

    it("given Trace user, when opponent has Disguise (Gen 7 uncopyable), then does not activate", () => {
      // Source: Bulbapedia "Trace" Gen VII -- cannot copy Disguise
      const opponent = makeActivePokemon({ ability: "disguise" });
      const ctx = makeContext({
        ability: "trace",
        trigger: "on-switch-in",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(false);
    });

    it("given Trace user, when opponent has Schooling (Gen 7 uncopyable), then does not activate", () => {
      // Source: Bulbapedia "Trace" Gen VII -- cannot copy Schooling
      const opponent = makeActivePokemon({ ability: "schooling" });
      const ctx = makeContext({
        ability: "trace",
        trigger: "on-switch-in",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(false);
    });

    it("given Trace user, when opponent has Battle Bond (Gen 7 uncopyable), then does not activate", () => {
      // Source: Bulbapedia "Trace" Gen VII -- cannot copy Battle Bond
      const opponent = makeActivePokemon({ ability: "battle-bond" });
      const ctx = makeContext({
        ability: "trace",
        trigger: "on-switch-in",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(false);
    });
  });

  describe("Download", () => {
    it("given Download user, when opponent SpDef > Def, then raises Attack", () => {
      // Source: Showdown data/abilities.ts -- Download: foe Def < SpDef => +1 Atk
      const opponent = makeActivePokemon({ ability: "" });
      opponent.pokemon.calculatedStats = {
        hp: 200,
        attack: 100,
        defense: 80,
        spAttack: 100,
        spDefense: 120,
        speed: 100,
      };
      const ctx = makeContext({
        ability: "download",
        trigger: "on-switch-in",
        nickname: "Porygon-Z",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "stat-change",
        target: "self",
        stat: "attack",
        stages: 1,
      });
    });

    it("given Download user, when opponent Def >= SpDef, then raises Sp. Atk", () => {
      // Source: Showdown data/abilities.ts -- Download: foe Def >= SpDef => +1 SpA
      const opponent = makeActivePokemon({ ability: "" });
      opponent.pokemon.calculatedStats = {
        hp: 200,
        attack: 100,
        defense: 120,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      };
      const ctx = makeContext({
        ability: "download",
        trigger: "on-switch-in",
        nickname: "Porygon-Z",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "stat-change",
        target: "self",
        stat: "spAttack",
        stages: 1,
      });
    });
  });

  describe("Weather Abilities", () => {
    it("given Drizzle user with no weather rock, when switching in, then sets 5-turn rain", () => {
      // Source: Showdown data/abilities.ts -- Drizzle: 5 turns of rain
      // Source: Bulbapedia -- Drizzle Gen 6+: 5-turn rain
      const ctx = makeContext({
        ability: "drizzle",
        trigger: "on-switch-in",
        nickname: "Pelipper",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "weather-set",
        target: "field",
        weather: "rain",
        weatherTurns: 5,
      });
    });

    it("given Drizzle user with Damp Rock, when switching in, then sets 8-turn rain", () => {
      // Source: Bulbapedia -- Damp Rock extends rain from 5 to 8 turns
      // Source: Showdown data/items.ts -- damprock
      const ctx = makeContext({
        ability: "drizzle",
        trigger: "on-switch-in",
        nickname: "Pelipper",
        heldItem: "damp-rock",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "weather-set",
        target: "field",
        weather: "rain",
        weatherTurns: 8,
      });
    });

    it("given Drought user with Heat Rock, when switching in, then sets 8-turn sun", () => {
      // Source: Bulbapedia -- Heat Rock extends sun from 5 to 8 turns
      const ctx = makeContext({
        ability: "drought",
        trigger: "on-switch-in",
        heldItem: "heat-rock",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.effects[0]).toEqual({
        effectType: "weather-set",
        target: "field",
        weather: "sun",
        weatherTurns: 8,
      });
    });

    it("given Sand Stream user with Smooth Rock, when switching in, then sets 8-turn sand", () => {
      // Source: Bulbapedia -- Smooth Rock extends sandstorm from 5 to 8 turns
      const ctx = makeContext({
        ability: "sand-stream",
        trigger: "on-switch-in",
        heldItem: "smooth-rock",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.effects[0]).toEqual({
        effectType: "weather-set",
        target: "field",
        weather: "sand",
        weatherTurns: 8,
      });
    });

    it("given Snow Warning user with Icy Rock, when switching in, then sets 8-turn hail", () => {
      // Source: Bulbapedia -- Icy Rock extends hail from 5 to 8 turns
      const ctx = makeContext({
        ability: "snow-warning",
        trigger: "on-switch-in",
        heldItem: "icy-rock",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.effects[0]).toEqual({
        effectType: "weather-set",
        target: "field",
        weather: "hail",
        weatherTurns: 8,
      });
    });

    it("given Drought user with wrong rock (Damp Rock), when switching in, then sets 5-turn sun", () => {
      // Source: Weather rocks only extend matching weather type
      const ctx = makeContext({
        ability: "drought",
        trigger: "on-switch-in",
        heldItem: "damp-rock",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.effects[0]).toEqual({
        effectType: "weather-set",
        target: "field",
        weather: "sun",
        weatherTurns: 5,
      });
    });
  });

  describe("Mold Breaker / Teravolt / Turboblaze", () => {
    it("given Mold Breaker user, when switching in, then announces with 'breaks the mold' message", () => {
      // Source: Showdown data/abilities.ts -- Mold Breaker onStart
      const ctx = makeContext({
        ability: "mold-breaker",
        trigger: "on-switch-in",
        nickname: "Excadrill",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.messages[0]).toBe("Excadrill breaks the mold!");
    });

    it("given Teravolt user, when switching in, then announces with 'bursting aura' message", () => {
      // Source: Showdown data/abilities.ts -- Teravolt onStart
      const ctx = makeContext({
        ability: "teravolt",
        trigger: "on-switch-in",
        nickname: "Zekrom",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.messages[0]).toBe("Zekrom is radiating a bursting aura!");
    });

    it("given Turboblaze user, when switching in, then announces with 'blazing aura' message", () => {
      // Source: Showdown data/abilities.ts -- Turboblaze onStart
      const ctx = makeContext({
        ability: "turboblaze",
        trigger: "on-switch-in",
        nickname: "Reshiram",
      });

      const result = handleGen7SwitchAbility("on-switch-in", ctx);

      expect(result.activated).toBe(true);
      expect(result.messages[0]).toBe("Reshiram is radiating a blazing aura!");
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: on-switch-out
// ---------------------------------------------------------------------------

describe("Gen 7 Switch-out Abilities", () => {
  describe("Regenerator", () => {
    it("given Regenerator user at 100/300 HP, when switching out, then heals 100 HP (1/3 of max)", () => {
      // Source: Showdown data/abilities.ts -- Regenerator: heals 1/3 max HP on switch-out
      // Source: Bulbapedia -- Regenerator: "Restores 1/3 of its maximum HP"
      // 300 / 3 = 100
      const ctx = makeContext({
        ability: "regenerator",
        trigger: "on-switch-out",
        nickname: "Slowbro",
        currentHp: 100,
        maxHp: 300,
      });

      const result = handleGen7SwitchAbility("on-switch-out", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "heal",
        target: "self",
        value: 100,
      });
    });

    it("given Regenerator user with max HP that is not divisible by 3, when switching out, then floors the heal amount", () => {
      // Source: Showdown data/abilities.ts -- Math.floor(maxHP / 3)
      // 200 / 3 = 66.67 -> floor to 66
      const ctx = makeContext({
        ability: "regenerator",
        trigger: "on-switch-out",
        currentHp: 50,
        maxHp: 200,
      });

      const result = handleGen7SwitchAbility("on-switch-out", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "heal",
        target: "self",
        value: 66,
      });
    });
  });

  describe("Natural Cure", () => {
    it("given Natural Cure user with burn, when switching out, then cures burn", () => {
      // Source: Showdown data/abilities.ts -- Natural Cure: cures status on switch-out
      // Source: Bulbapedia -- Natural Cure: "All status conditions are healed"
      const ctx = makeContext({
        ability: "natural-cure",
        trigger: "on-switch-out",
        nickname: "Chansey",
        status: "burn",
      });

      const result = handleGen7SwitchAbility("on-switch-out", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "status-cure",
        target: "self",
      });
    });

    it("given Natural Cure user with no status, when switching out, then does not activate", () => {
      // Source: Showdown -- no status to cure
      const ctx = makeContext({
        ability: "natural-cure",
        trigger: "on-switch-out",
      });

      const result = handleGen7SwitchAbility("on-switch-out", ctx);

      expect(result.activated).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: on-contact
// ---------------------------------------------------------------------------

describe("Gen 7 Contact Abilities", () => {
  describe("Rough Skin", () => {
    it("given Rough Skin defender with 200 HP attacker, when attacker makes contact, then deals 25 chip damage (1/8 of 200)", () => {
      // Source: Showdown data/abilities.ts -- Rough Skin: 1/8 max HP chip
      // Source: Bulbapedia -- Rough Skin: "1/8 of the attacker's maximum HP"
      // 200 / 8 = 25
      const opponent = makeActivePokemon({ ability: "", maxHp: 200 });
      const ctx = makeContext({
        ability: "rough-skin",
        trigger: "on-contact",
        nickname: "Garchomp",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "chip-damage",
        target: "opponent",
        value: 25,
      });
      expect(result.messages[0]).toContain("Rough Skin");
    });

    it("given Iron Barbs defender with 160 HP attacker, when attacker makes contact, then deals 20 chip damage (floor(160/8))", () => {
      // Source: Showdown data/abilities.ts -- Iron Barbs: same as Rough Skin (1/8)
      // 160 / 8 = 20
      const opponent = makeActivePokemon({ ability: "", maxHp: 160 });
      const ctx = makeContext({
        ability: "iron-barbs",
        trigger: "on-contact",
        nickname: "Ferrothorn",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "chip-damage",
        target: "opponent",
        value: 20,
      });
      expect(result.messages[0]).toContain("Iron Barbs");
    });
  });

  describe("Flame Body", () => {
    it("given Flame Body defender, when attacker makes contact and RNG < 0.3, then burns attacker", () => {
      // Source: Showdown data/abilities.ts -- Flame Body: 30% burn on contact
      // Source: Bulbapedia -- Flame Body: "30% chance of burning the attacker"
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "flame-body",
        trigger: "on-contact",
        nickname: "Talonflame",
        opponent,
        rng: { next: () => 0.1 }, // < 0.3, triggers
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "status-inflict",
        target: "opponent",
        status: "burn",
      });
    });

    it("given Flame Body defender, when attacker makes contact and RNG >= 0.3, then does not burn", () => {
      // Source: Showdown -- 70% chance of NOT triggering
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "flame-body",
        trigger: "on-contact",
        opponent,
        rng: { next: () => 0.5 }, // >= 0.3, does not trigger
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(false);
    });

    it("given Flame Body defender, when attacker already has a status, then does not burn", () => {
      // Source: Showdown -- cannot inflict if already statused
      const opponent = makeActivePokemon({ ability: "", status: "paralysis" });
      const ctx = makeContext({
        ability: "flame-body",
        trigger: "on-contact",
        opponent,
        rng: { next: () => 0.1 },
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(false);
    });
  });

  describe("Static", () => {
    it("given Static defender, when attacker makes contact and RNG < 0.3, then paralyzes attacker", () => {
      // Source: Showdown data/abilities.ts -- Static: 30% paralysis on contact
      // Source: Bulbapedia -- Static: "30% chance of paralyzing the attacker"
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "static",
        trigger: "on-contact",
        nickname: "Pikachu",
        opponent,
        rng: { next: () => 0.2 }, // < 0.3, triggers
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "status-inflict",
        target: "opponent",
        status: "paralysis",
      });
    });

    it("given Static defender, when attacker already statused, then does not paralyze", () => {
      // Source: Showdown -- cannot inflict on already-statused Pokemon
      const opponent = makeActivePokemon({ ability: "", status: "burn" });
      const ctx = makeContext({
        ability: "static",
        trigger: "on-contact",
        opponent,
        rng: { next: () => 0.1 },
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(false);
    });
  });

  describe("Poison Point", () => {
    it("given Poison Point defender, when attacker makes contact and RNG < 0.3, then poisons attacker", () => {
      // Source: Showdown data/abilities.ts -- Poison Point: 30% poison on contact
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "poison-point",
        trigger: "on-contact",
        opponent,
        rng: { next: () => 0.15 },
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "status-inflict",
        target: "opponent",
        status: "poison",
      });
    });
  });

  describe("Gooey / Tangling Hair", () => {
    it("given Gooey defender, when attacker makes contact, then lowers attacker Speed by 1 stage", () => {
      // Source: Showdown data/abilities.ts -- Gooey: -1 Speed to contact attacker
      // Source: Bulbapedia -- Gooey: "Lowers the attacker's Speed by one stage on contact"
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "gooey",
        trigger: "on-contact",
        nickname: "Goodra",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "stat-change",
        target: "opponent",
        stat: "speed",
        stages: -1,
      });
      expect(result.messages[0]).toContain("Gooey");
    });

    it("given Tangling Hair defender (Gen 7 new), when attacker makes contact, then lowers attacker Speed by 1 stage", () => {
      // Source: Bulbapedia "Tangling Hair" -- introduced Gen 7 (Alolan Dugtrio)
      // Same effect as Gooey: -1 Speed to contact attacker
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "tangling-hair",
        trigger: "on-contact",
        nickname: "Dugtrio-Alola",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "stat-change",
        target: "opponent",
        stat: "speed",
        stages: -1,
      });
      expect(result.messages[0]).toContain("Tangling Hair");
    });
  });

  describe("Mummy", () => {
    it("given Mummy defender, when attacker makes contact, then overwrites attacker ability to Mummy", () => {
      // Source: Showdown data/abilities.ts -- Mummy: contact overwrite
      const opponent = makeActivePokemon({ ability: "tough-claws" });
      const ctx = makeContext({
        ability: "mummy",
        trigger: "on-contact",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "ability-change",
        target: "opponent",
        newAbility: "mummy",
      });
    });

    it("given Mummy defender, when attacker has unsuppressable ability (Schooling), then does not overwrite", () => {
      // Source: Showdown data/abilities.ts -- cannot suppress Schooling
      const opponent = makeActivePokemon({ ability: "schooling" });
      const ctx = makeContext({
        ability: "mummy",
        trigger: "on-contact",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(false);
    });

    it("given Mummy defender, when attacker already has Mummy, then does not activate", () => {
      // Source: Showdown -- cannot overwrite Mummy with Mummy
      const opponent = makeActivePokemon({ ability: "mummy" });
      const ctx = makeContext({
        ability: "mummy",
        trigger: "on-contact",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(false);
    });
  });

  describe("Effect Spore", () => {
    it("given Effect Spore defender, when attacker makes contact and roll = 5, then puts attacker to sleep", () => {
      // Source: Showdown data/abilities.ts -- Effect Spore: roll 0-9 = sleep
      // Math.floor(0.05 * 100) = 5, which is in range [0, 9]
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "effect-spore",
        trigger: "on-contact",
        opponent,
        rng: { next: () => 0.05 },
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "status-inflict",
        target: "opponent",
        status: "sleep",
      });
    });

    it("given Effect Spore defender, when attacker is Grass-type, then does not activate", () => {
      // Source: Showdown data/abilities.ts -- Grass-types immune to Effect Spore
      const opponent = makeActivePokemon({ ability: "", types: ["grass"] });
      const ctx = makeContext({
        ability: "effect-spore",
        trigger: "on-contact",
        opponent,
        rng: { next: () => 0.05 },
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(false);
    });

    it("given Effect Spore defender, when attacker has Overcoat, then does not activate", () => {
      // Source: Showdown data/abilities.ts -- Overcoat blocks Effect Spore
      const opponent = makeActivePokemon({ ability: "overcoat" });
      const ctx = makeContext({
        ability: "effect-spore",
        trigger: "on-contact",
        opponent,
        rng: { next: () => 0.05 },
      });

      const result = handleGen7SwitchAbility("on-contact", ctx);

      expect(result.activated).toBe(false);
    });
  });

  describe("Synchronize", () => {
    it("given Synchronize holder with burn, when status was inflicted by opponent, then spreads burn to opponent", () => {
      // Source: Showdown data/abilities.ts -- Synchronize: passes burn/paralysis/poison
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "synchronize",
        trigger: "on-status-inflicted",
        nickname: "Espeon",
        status: "burn",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-status-inflicted", ctx);

      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        effectType: "status-inflict",
        target: "opponent",
        status: "burn",
      });
    });

    it("given Synchronize holder with sleep, when status was inflicted, then does NOT spread sleep", () => {
      // Source: Showdown data/abilities.ts -- Synchronize does NOT pass sleep or freeze
      const opponent = makeActivePokemon({ ability: "" });
      const ctx = makeContext({
        ability: "synchronize",
        trigger: "on-status-inflicted",
        status: "sleep",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-status-inflicted", ctx);

      expect(result.activated).toBe(false);
    });

    it("given Synchronize holder with poison, when opponent already statused, then does not activate", () => {
      // Source: Showdown -- cannot inflict on already-statused Pokemon
      const opponent = makeActivePokemon({ ability: "", status: "burn" });
      const ctx = makeContext({
        ability: "synchronize",
        trigger: "on-status-inflicted",
        status: "poison",
        opponent,
      });

      const result = handleGen7SwitchAbility("on-status-inflicted", ctx);

      expect(result.activated).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Passive ability checks
// ---------------------------------------------------------------------------

describe("Gen 7 Passive Ability Checks", () => {
  describe("Magic Guard", () => {
    it("given Magic Guard, when checking hasMagicGuard, then returns true", () => {
      // Source: Showdown data/abilities.ts -- magicguard: onDamage
      // Source: Bulbapedia -- "Prevents all damage except from direct attacks"
      expect(hasMagicGuard("magic-guard")).toBe(true);
    });

    it("given non-Magic Guard ability, when checking hasMagicGuard, then returns false", () => {
      expect(hasMagicGuard("overgrow")).toBe(false);
    });
  });

  describe("Overcoat", () => {
    it("given Overcoat, when checking hasOvercoat, then returns true", () => {
      // Source: Showdown data/abilities.ts -- overcoat: blocks weather and powder
      expect(hasOvercoat("overcoat")).toBe(true);
    });

    it("given non-Overcoat ability, when checking hasOvercoat, then returns false", () => {
      expect(hasOvercoat("inner-focus")).toBe(false);
    });
  });

  describe("Soundproof", () => {
    it("given Soundproof and a sound-based move, when checking isSoundproofBlocked, then returns true", () => {
      // Source: Showdown data/abilities.ts -- soundproof: move.flags['sound']
      expect(isSoundproofBlocked("soundproof", { sound: true })).toBe(true);
    });

    it("given Soundproof and a non-sound move, when checking isSoundproofBlocked, then returns false", () => {
      expect(isSoundproofBlocked("soundproof", { contact: true })).toBe(false);
    });

    it("given non-Soundproof ability and a sound move, when checking, then returns false", () => {
      expect(isSoundproofBlocked("inner-focus", { sound: true })).toBe(false);
    });
  });

  describe("Bulletproof", () => {
    it("given Bulletproof and a ball/bomb move, when checking isBulletproofBlocked, then returns true", () => {
      // Source: Showdown data/abilities.ts -- bulletproof: move.flags['bullet']
      expect(isBulletproofBlocked("bulletproof", { bullet: true })).toBe(true);
    });

    it("given Bulletproof and a non-bullet move, when checking, then returns false", () => {
      expect(isBulletproofBlocked("bulletproof", { contact: true })).toBe(false);
    });
  });

  describe("Damp", () => {
    it("given Damp and Self-Destruct, when checking isDampBlocked, then returns true", () => {
      // Source: Showdown data/abilities.ts -- damp: prevents Explosion/Self-Destruct
      expect(isDampBlocked("damp", "self-destruct")).toBe(true);
    });

    it("given Damp and Explosion, when checking isDampBlocked, then returns true", () => {
      expect(isDampBlocked("damp", "explosion")).toBe(true);
    });

    it("given Damp and Mind Blown, when checking isDampBlocked, then returns true", () => {
      // Source: Showdown data/abilities.ts -- damp also blocks Mind Blown (Gen 7 move)
      expect(isDampBlocked("damp", "mind-blown")).toBe(true);
    });

    it("given Damp and a normal move, when checking isDampBlocked, then returns false", () => {
      expect(isDampBlocked("damp", "tackle")).toBe(false);
    });

    it("given non-Damp ability and Self-Destruct, when checking, then returns false", () => {
      expect(isDampBlocked("inner-focus", "self-destruct")).toBe(false);
    });
  });

  describe("Mold Breaker detection", () => {
    it("given mold-breaker, when checking isMoldBreakerAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- mold-breaker
      expect(isMoldBreakerAbility("mold-breaker")).toBe(true);
    });

    it("given teravolt, when checking isMoldBreakerAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- teravolt (same as mold-breaker)
      expect(isMoldBreakerAbility("teravolt")).toBe(true);
    });

    it("given turboblaze, when checking isMoldBreakerAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- turboblaze (same as mold-breaker)
      expect(isMoldBreakerAbility("turboblaze")).toBe(true);
    });

    it("given non-mold-breaker ability, when checking, then returns false", () => {
      expect(isMoldBreakerAbility("intimidate")).toBe(false);
    });
  });

  describe("Shed Skin", () => {
    it("given Shed Skin with status, when RNG roll < 1/3, then returns true", () => {
      // Source: Showdown data/abilities.ts -- shedskin: 1/3 chance
      // Source: Bulbapedia -- Shed Skin: "1/3 chance of curing status"
      expect(rollShedSkin("shed-skin", true, 0.2)).toBe(true);
    });

    it("given Shed Skin with status, when RNG roll >= 1/3, then returns false", () => {
      // 0.5 >= 1/3 = does not trigger
      expect(rollShedSkin("shed-skin", true, 0.5)).toBe(false);
    });

    it("given Shed Skin without status, when checking, then returns false", () => {
      expect(rollShedSkin("shed-skin", false, 0.1)).toBe(false);
    });

    it("given non-Shed Skin ability, when checking, then returns false", () => {
      expect(rollShedSkin("inner-focus", true, 0.1)).toBe(false);
    });
  });

  describe("Harvest", () => {
    it("given Harvest with consumed berry in sun, when checking rollHarvest, then always returns true", () => {
      // Source: Showdown data/abilities.ts -- harvest: 100% in sun
      // Source: Bulbapedia -- Harvest: "100% chance in harsh sunlight"
      expect(rollHarvest("harvest", true, "sun", 0.9)).toBe(true);
    });

    it("given Harvest with consumed berry, when RNG < 0.5, then returns true", () => {
      // Source: Showdown data/abilities.ts -- harvest: 50% chance normally
      expect(rollHarvest("harvest", true, null, 0.3)).toBe(true);
    });

    it("given Harvest with consumed berry, when RNG >= 0.5, then returns false", () => {
      expect(rollHarvest("harvest", true, null, 0.7)).toBe(false);
    });

    it("given Harvest without consumed berry, when checking, then returns false", () => {
      expect(rollHarvest("harvest", false, "sun", 0.1)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Utility exports
// ---------------------------------------------------------------------------

describe("Gen 7 Ability Constants", () => {
  describe("TRACE_UNCOPYABLE_ABILITIES", () => {
    it("given Gen 7 Trace ban list, when checking for new Gen 7 abilities, then includes all expected entries", () => {
      // Source: Bulbapedia "Trace" Gen VII -- these abilities cannot be copied
      expect(TRACE_UNCOPYABLE_ABILITIES.has("disguise")).toBe(true);
      expect(TRACE_UNCOPYABLE_ABILITIES.has("schooling")).toBe(true);
      expect(TRACE_UNCOPYABLE_ABILITIES.has("battle-bond")).toBe(true);
      expect(TRACE_UNCOPYABLE_ABILITIES.has("shields-down")).toBe(true);
      expect(TRACE_UNCOPYABLE_ABILITIES.has("comatose")).toBe(true);
      expect(TRACE_UNCOPYABLE_ABILITIES.has("rks-system")).toBe(true);
      expect(TRACE_UNCOPYABLE_ABILITIES.has("power-construct")).toBe(true);
      // Legacy entries still present
      expect(TRACE_UNCOPYABLE_ABILITIES.has("trace")).toBe(true);
      expect(TRACE_UNCOPYABLE_ABILITIES.has("illusion")).toBe(true);
      expect(TRACE_UNCOPYABLE_ABILITIES.has("stance-change")).toBe(true);
    });
  });

  describe("UNSUPPRESSABLE_ABILITIES", () => {
    it("given Gen 7 unsuppressable list, when checking for new Gen 7 abilities, then includes all expected entries", () => {
      // Source: Showdown data/abilities.ts -- { cantsuppress: true } flag
      expect(UNSUPPRESSABLE_ABILITIES.has("disguise")).toBe(true);
      expect(UNSUPPRESSABLE_ABILITIES.has("schooling")).toBe(true);
      expect(UNSUPPRESSABLE_ABILITIES.has("battle-bond")).toBe(true);
      expect(UNSUPPRESSABLE_ABILITIES.has("shields-down")).toBe(true);
      expect(UNSUPPRESSABLE_ABILITIES.has("comatose")).toBe(true);
      expect(UNSUPPRESSABLE_ABILITIES.has("rks-system")).toBe(true);
      expect(UNSUPPRESSABLE_ABILITIES.has("power-construct")).toBe(true);
      expect(UNSUPPRESSABLE_ABILITIES.has("stance-change")).toBe(true);
    });
  });

  describe("getWeatherDuration", () => {
    it("given no held item, when getting weather duration, then returns 5", () => {
      // Source: Showdown -- base weather duration is 5 turns
      expect(getWeatherDuration(null, "rain")).toBe(5);
    });

    it("given matching rock, when getting weather duration, then returns 8", () => {
      // Source: Bulbapedia -- Damp Rock extends rain to 8 turns
      expect(getWeatherDuration("damp-rock", "rain")).toBe(8);
    });

    it("given non-matching rock, when getting weather duration, then returns 5", () => {
      // Damp Rock only extends rain, not sun
      expect(getWeatherDuration("damp-rock", "sun")).toBe(5);
    });
  });
});
