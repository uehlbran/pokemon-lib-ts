import type {
  AbilityContext,
  ActivePokemon,
  BattleState,
  TerrainEffectResult,
} from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus, TerrainType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { isGen7Grounded } from "../src/Gen7DamageCalc";
import { Gen7Ruleset } from "../src/Gen7Ruleset";
import {
  applyGen7TerrainEffects,
  checkGen7TerrainStatusImmunity,
  checkMistyTerrainConfusionImmunity,
  checkPsychicTerrainPriorityBlock,
  handleSurgeAbility,
  isSurgeAbility,
  TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS,
} from "../src/Gen7Terrain";

// ---------------------------------------------------------------------------
// Helper factories
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
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function makeState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: TerrainType; turnsLeft: number; source: string } | null;
  gravity?: { active: boolean; turnsLeft: number };
  sides?: Array<{
    index?: number;
    active?: Array<ActivePokemon | null>;
  }>;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 7,
    turnNumber: 1,
    rng: new SeededRandom(42),
    sides: overrides?.sides ?? [
      { index: 0, active: [] },
      { index: 1, active: [] },
    ],
  } as unknown as BattleState;
}

function makeAbilityContext(overrides: {
  pokemon: ActivePokemon;
  state?: BattleState;
  opponent?: ActivePokemon;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon,
    opponent: overrides.opponent ?? makeActive({}),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(42),
    trigger: "on-switch-in",
  };
}

// ===========================================================================
// isGen7Grounded -- grounded check
// ===========================================================================

describe("isGen7Grounded", () => {
  it("given a normal Ground-type Pokemon, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- default is grounded unless exempted
    const pokemon = makeActive({ types: ["ground"] });
    expect(isGen7Grounded(pokemon, false)).toBe(true);
  });

  it("given a normal Normal-type Pokemon, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- default is grounded
    const pokemon = makeActive({ types: ["normal"] });
    expect(isGen7Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Pokemon, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: type=Flying => not grounded
    // Source: Bulbapedia -- Flying-type Pokemon are not grounded
    const pokemon = makeActive({ types: ["flying"] });
    expect(isGen7Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Levitate ability, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: ability=Levitate => not grounded
    // Source: Bulbapedia -- Levitate: "The Pokemon is made immune to Ground-type moves"
    const pokemon = makeActive({ ability: "levitate" });
    expect(isGen7Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon holding Air Balloon, when checking grounded, then returns false", () => {
    // Source: Showdown data/items.ts -- airballoon: isGrounded: false
    // Source: Bulbapedia -- Air Balloon: "Makes the holder unaffected by Ground-type moves"
    const pokemon = makeActive({ heldItem: "air-balloon" });
    expect(isGen7Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Magnet Rise volatile, when checking grounded, then returns false", () => {
    // Source: Showdown data/conditions.ts -- magnetrise: isGrounded: false
    // Source: Bulbapedia -- Magnet Rise: "causes the user to float for 5 turns"
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("magnet-rise", { turnsLeft: 3 });
    const pokemon = makeActive({ volatiles });
    expect(isGen7Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Telekinesis volatile, when checking grounded, then returns false", () => {
    // Source: Showdown data/conditions.ts -- telekinesis: isGrounded: false
    // Source: Bulbapedia -- Telekinesis: "raises the target into the air for 3 turns"
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("telekinesis", { turnsLeft: 2 });
    const pokemon = makeActive({ volatiles });
    expect(isGen7Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type Pokemon under Gravity, when checking grounded, then returns true", () => {
    // Source: Showdown data/conditions.ts -- gravity: isGrounded overrides everything
    // Source: Bulbapedia -- Gravity: "Grounds all Flying-type Pokemon"
    const pokemon = makeActive({ types: ["flying"] });
    expect(isGen7Grounded(pokemon, true)).toBe(true);
  });

  it("given a Pokemon with Levitate under Gravity, when checking grounded, then returns true", () => {
    // Source: Showdown data/conditions.ts -- gravity overrides Levitate
    const pokemon = makeActive({ ability: "levitate" });
    expect(isGen7Grounded(pokemon, true)).toBe(true);
  });
});

// ===========================================================================
// Electric Terrain
// ===========================================================================

describe("Electric Terrain", () => {
  describe("status immunity", () => {
    it("given Electric Terrain, when inflicting sleep on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain.onSetStatus:
      //   if (status.id === 'slp') return false
      // Source: Bulbapedia "Electric Terrain" -- "Grounded Pokemon cannot fall asleep."
      const target = makeActive({ types: ["electric"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("sleep", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Electric Terrain, when inflicting sleep on a Flying-type Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- terrain effects only apply to grounded Pokemon
      // Source: Bulbapedia "Electric Terrain" -- only grounded Pokemon are affected
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("sleep", target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting burn on a grounded Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain only blocks sleep, not other statuses
      // Source: Bulbapedia "Electric Terrain" -- only prevents sleep
      const target = makeActive({ types: ["electric"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("burn", target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting paralysis on a grounded Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain only blocks sleep
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("paralysis", target, state);
      expect(result.immune).toBe(false);
    });
  });

  describe("via Gen7Ruleset.checkTerrainStatusImmunity", () => {
    it("given Electric Terrain, when checking sleep immunity via ruleset, then blocks it for grounded", () => {
      // Source: Showdown data/conditions.ts -- electricterrain.onSetStatus
      const ruleset = new Gen7Ruleset();
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-terrain" },
      });

      const result = ruleset.checkTerrainStatusImmunity("sleep", target, state);
      expect(result.immune).toBe(true);
    });
  });
});

// ===========================================================================
// Grassy Terrain
// ===========================================================================

describe("Grassy Terrain", () => {
  describe("end-of-turn healing", () => {
    it("given Grassy Terrain and a grounded Pokemon below max HP, when applying terrain effects, then heals 1/16 max HP", () => {
      // Source: Showdown data/conditions.ts -- grassyterrain.onResidual:
      //   this.heal(pokemon.baseMaxhp / 16)
      // Source: Bulbapedia "Grassy Terrain" -- "At the end of each turn, the HP of each
      //   grounded Pokemon is restored by 1/16 of its maximum HP."
      // For maxHp=160: floor(160/16) = 10
      const pokemon = makeActive({ hp: 160, currentHp: 100, types: ["grass"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-terrain" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen7TerrainEffects(state);
      expect(results.length).toBe(1);
      expect(results[0].effect).toBe("grassy-heal");
      expect(results[0].healAmount).toBe(10);
    });

    it("given Grassy Terrain and a grounded Pokemon with 320 max HP, when applying terrain effects, then heals floor(320/16) = 20", () => {
      // Source: Showdown data/conditions.ts -- grassyterrain.onResidual:
      //   this.heal(pokemon.baseMaxhp / 16)
      // floor(320/16) = 20
      const pokemon = makeActive({ hp: 320, currentHp: 200, types: ["normal"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 3, source: "grassy-terrain" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen7TerrainEffects(state);
      expect(results.length).toBe(1);
      expect(results[0].healAmount).toBe(20);
    });

    it("given Grassy Terrain and a Flying-type Pokemon, when applying terrain effects, then does not heal", () => {
      // Source: Showdown data/conditions.ts -- terrain effects only apply to grounded Pokemon
      // Source: Bulbapedia "Grassy Terrain" -- only grounded Pokemon receive healing
      const pokemon = makeActive({ hp: 200, currentHp: 100, types: ["flying"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-terrain" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen7TerrainEffects(state);
      expect(results.length).toBe(0);
    });

    it("given Grassy Terrain and a grounded Pokemon at full HP, when applying terrain effects, then does not heal", () => {
      // Source: Showdown data/conditions.ts -- no heal if already at max HP
      const pokemon = makeActive({ hp: 200, currentHp: 200, types: ["grass"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-terrain" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen7TerrainEffects(state);
      expect(results.length).toBe(0);
    });

    it("given Grassy Terrain and a fainted Pokemon, when applying terrain effects, then does not heal", () => {
      // Source: Showdown data/conditions.ts -- fainted Pokemon are skipped
      const pokemon = makeActive({ hp: 200, currentHp: 0, types: ["grass"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-terrain" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen7TerrainEffects(state);
      expect(results.length).toBe(0);
    });
  });

  describe("via Gen7Ruleset.applyTerrainEffects", () => {
    it("given Grassy Terrain, when calling ruleset applyTerrainEffects, then returns healing results", () => {
      // Source: Showdown data/conditions.ts -- grassyterrain.onResidual
      const ruleset = new Gen7Ruleset();
      const pokemon = makeActive({ hp: 160, currentHp: 80, types: ["grass"] });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "grassy-terrain" },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = ruleset.applyTerrainEffects(state);
      expect(results.length).toBe(1);
      expect(results[0].healAmount).toBe(10); // floor(160/16) = 10
    });
  });
});

// ===========================================================================
// Psychic Terrain
// ===========================================================================

describe("Psychic Terrain", () => {
  describe("priority blocking", () => {
    it("given Psychic Terrain and a priority +1 move targeting a grounded Pokemon, when checking priority block, then returns true", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain.onTryHit:
      //   if (target.isGrounded() && move.priority > 0) return false
      // Source: Bulbapedia "Psychic Terrain" -- "Grounded Pokemon are protected from
      //   moves with increased priority."
      const target = makeActive({ types: ["normal"] });
      const state = makeState();

      const blocked = checkPsychicTerrainPriorityBlock("psychic", 1, target, state);
      expect(blocked).toBe(true);
    });

    it("given Psychic Terrain and a priority +2 move targeting a grounded Pokemon, when checking priority block, then returns true", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain: any priority > 0 is blocked
      // Source: Bulbapedia "Psychic Terrain" -- blocks ALL increased priority, not just +1
      const target = makeActive({ types: ["psychic"] });
      const state = makeState();

      const blocked = checkPsychicTerrainPriorityBlock("psychic", 2, target, state);
      expect(blocked).toBe(true);
    });

    it("given Psychic Terrain and a priority +1 move targeting a Flying-type, when checking priority block, then returns false", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain: only blocks vs grounded targets
      // Source: Bulbapedia "Psychic Terrain" -- non-grounded Pokemon are not protected
      const target = makeActive({ types: ["flying"] });
      const state = makeState();

      const blocked = checkPsychicTerrainPriorityBlock("psychic", 1, target, state);
      expect(blocked).toBe(false);
    });

    it("given Psychic Terrain and a normal-priority move (priority 0), when checking priority block, then returns false", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain: only priority > 0
      const target = makeActive({ types: ["normal"] });
      const state = makeState();

      const blocked = checkPsychicTerrainPriorityBlock("psychic", 0, target, state);
      expect(blocked).toBe(false);
    });

    it("given Psychic Terrain and a negative priority move (priority -1), when checking priority block, then returns false", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain: only priority > 0
      // Negative priority moves (e.g., Roar at -6) are not blocked
      const target = makeActive({ types: ["normal"] });
      const state = makeState();

      const blocked = checkPsychicTerrainPriorityBlock("psychic", -1, target, state);
      expect(blocked).toBe(false);
    });

    it("given Electric Terrain (not Psychic), when checking priority block, then returns false", () => {
      // Source: Showdown data/conditions.ts -- only psychicterrain blocks priority
      const target = makeActive({ types: ["normal"] });
      const state = makeState();

      const blocked = checkPsychicTerrainPriorityBlock("electric", 1, target, state);
      expect(blocked).toBe(false);
    });

    it("given no terrain (null), when checking priority block, then returns false", () => {
      // Source: No terrain = no blocking
      const target = makeActive({ types: ["normal"] });
      const state = makeState();

      const blocked = checkPsychicTerrainPriorityBlock(null, 1, target, state);
      expect(blocked).toBe(false);
    });

    it("given Psychic Terrain and a Levitate Pokemon, when checking priority block with +1 priority, then returns false", () => {
      // Source: Showdown data/conditions.ts -- Levitate = not grounded = not protected
      const target = makeActive({ types: ["normal"], ability: "levitate" });
      const state = makeState();

      const blocked = checkPsychicTerrainPriorityBlock("psychic", 1, target, state);
      expect(blocked).toBe(false);
    });
  });
});

// ===========================================================================
// Misty Terrain
// ===========================================================================

describe("Misty Terrain", () => {
  describe("status immunity", () => {
    it("given Misty Terrain, when inflicting burn on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return false (all status)
      // Source: Bulbapedia "Misty Terrain" -- "Grounded Pokemon are protected from status conditions."
      const target = makeActive({ types: ["fairy"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("burn", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting paralysis on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return false
      // Source: Bulbapedia "Misty Terrain" -- blocks all primary status conditions
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("paralysis", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting poison on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return false
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("poison", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting sleep on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: blocks all status
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("sleep", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting freeze on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: blocks all status
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("freeze", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting burn on a Flying-type Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain: only grounded Pokemon protected
      // Source: Bulbapedia "Misty Terrain" -- non-grounded Pokemon are not protected
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-terrain" },
      });

      const result = checkGen7TerrainStatusImmunity("burn", target, state);
      expect(result.immune).toBe(false);
    });
  });

  describe("confusion immunity", () => {
    it("given Misty Terrain, when checking confusion immunity for a grounded Pokemon, then returns true", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onTryAddVolatile:
      //   if (status.id === 'confusion') return null
      // Source: Bulbapedia "Misty Terrain" -- "prevents confusion"
      const target = makeActive({ types: ["fairy"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-terrain" },
      });

      const result = checkMistyTerrainConfusionImmunity(target, state);
      expect(result).toBe(true);
    });

    it("given Misty Terrain, when checking confusion immunity for a Flying-type, then returns false", () => {
      // Source: Showdown data/conditions.ts -- terrain only protects grounded Pokemon
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "misty-terrain" },
      });

      const result = checkMistyTerrainConfusionImmunity(target, state);
      expect(result).toBe(false);
    });

    it("given no terrain, when checking confusion immunity, then returns false", () => {
      // Source: No terrain = no confusion immunity
      const target = makeActive({ types: ["normal"] });
      const state = makeState();

      const result = checkMistyTerrainConfusionImmunity(target, state);
      expect(result).toBe(false);
    });

    it("given Electric Terrain (not Misty), when checking confusion immunity, then returns false", () => {
      // Source: Only Misty Terrain blocks confusion
      const target = makeActive({ types: ["normal"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "electric-terrain" },
      });

      const result = checkMistyTerrainConfusionImmunity(target, state);
      expect(result).toBe(false);
    });
  });
});

// ===========================================================================
// No terrain
// ===========================================================================

describe("No terrain", () => {
  it("given no terrain active, when checking terrain status immunity, then allows all status", () => {
    // Source: No terrain = no protection
    const target = makeActive({ types: ["normal"] });
    const state = makeState();

    const result = checkGen7TerrainStatusImmunity("sleep", target, state);
    expect(result.immune).toBe(false);
  });

  it("given no terrain active, when applying terrain effects, then returns empty array", () => {
    // Source: No terrain = no effects
    const state = makeState();
    const results = applyGen7TerrainEffects(state);
    expect(results.length).toBe(0);
  });
});

// ===========================================================================
// Surge Abilities
// ===========================================================================

describe("Surge abilities", () => {
  describe("isSurgeAbility", () => {
    it("given electric-surge, when checking isSurgeAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- electricsurge
      expect(isSurgeAbility("electric-surge")).toBe(true);
    });

    it("given grassy-surge, when checking isSurgeAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- grassysurge
      expect(isSurgeAbility("grassy-surge")).toBe(true);
    });

    it("given psychic-surge, when checking isSurgeAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- psychicsurge
      expect(isSurgeAbility("psychic-surge")).toBe(true);
    });

    it("given misty-surge, when checking isSurgeAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- mistysurge
      expect(isSurgeAbility("misty-surge")).toBe(true);
    });

    it("given intimidate, when checking isSurgeAbility, then returns false", () => {
      // Source: Intimidate is not a Surge ability
      expect(isSurgeAbility("intimidate")).toBe(false);
    });

    it("given null, when checking isSurgeAbility, then returns false", () => {
      expect(isSurgeAbility(null)).toBe(false);
    });
  });

  describe("Electric Surge", () => {
    it("given a Pokemon with Electric Surge, when switching in, then sets Electric Terrain for 5 turns", () => {
      // Source: Showdown data/abilities.ts -- electricsurge:
      //   onStart: this.field.setTerrain('electricterrain')
      // Source: Bulbapedia "Electric Surge" -- "sets Electric Terrain when the Pokemon enters battle"
      // Default duration: 5 turns
      const pokemon = makeActive({
        ability: "electric-surge",
        speciesId: 785,
        nickname: "Tapu Koko",
      });
      const state = makeState();
      const context = makeAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe("electric");
      expect(state.terrain!.turnsLeft).toBe(5);
      expect(state.terrain!.source).toBe("electric-surge");
    });
  });

  describe("Grassy Surge", () => {
    it("given a Pokemon with Grassy Surge, when switching in, then sets Grassy Terrain for 5 turns", () => {
      // Source: Showdown data/abilities.ts -- grassysurge:
      //   onStart: this.field.setTerrain('grassyterrain')
      // Source: Bulbapedia "Grassy Surge" -- "sets Grassy Terrain when the Pokemon enters battle"
      const pokemon = makeActive({
        ability: "grassy-surge",
        speciesId: 787,
        nickname: "Tapu Bulu",
      });
      const state = makeState();
      const context = makeAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe("grassy");
      expect(state.terrain!.turnsLeft).toBe(5);
    });
  });

  describe("Psychic Surge", () => {
    it("given a Pokemon with Psychic Surge, when switching in, then sets Psychic Terrain for 5 turns", () => {
      // Source: Showdown data/abilities.ts -- psychicsurge:
      //   onStart: this.field.setTerrain('psychicterrain')
      // Source: Bulbapedia "Psychic Surge" -- "sets Psychic Terrain when the Pokemon enters battle"
      const pokemon = makeActive({
        ability: "psychic-surge",
        speciesId: 786,
        nickname: "Tapu Lele",
      });
      const state = makeState();
      const context = makeAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe("psychic");
      expect(state.terrain!.turnsLeft).toBe(5);
    });
  });

  describe("Misty Surge", () => {
    it("given a Pokemon with Misty Surge, when switching in, then sets Misty Terrain for 5 turns", () => {
      // Source: Showdown data/abilities.ts -- mistysurge:
      //   onStart: this.field.setTerrain('mistyterrain')
      // Source: Bulbapedia "Misty Surge" -- "sets Misty Terrain when the Pokemon enters battle"
      const pokemon = makeActive({
        ability: "misty-surge",
        speciesId: 788,
        nickname: "Tapu Fini",
      });
      const state = makeState();
      const context = makeAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe("misty");
      expect(state.terrain!.turnsLeft).toBe(5);
    });
  });

  describe("via Gen7Ruleset.applyAbility", () => {
    it("given a Pokemon with Electric Surge on switch-in trigger, when calling ruleset.applyAbility, then sets Electric Terrain", () => {
      // Source: Showdown data/abilities.ts -- electricsurge triggers on switch-in
      const ruleset = new Gen7Ruleset();
      const pokemon = makeActive({
        ability: "electric-surge",
        speciesId: 785,
        nickname: "Tapu Koko",
      });
      const state = makeState();
      const context: AbilityContext = {
        pokemon,
        opponent: makeActive({}),
        state,
        rng: new SeededRandom(42),
        trigger: "on-switch-in",
      };

      const result = ruleset.applyAbility("on-switch-in", context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe("electric");
      expect(state.terrain!.turnsLeft).toBe(5);
    });
  });

  describe("non-Surge ability", () => {
    it("given a Pokemon with Intimidate on switch-in, when calling handleSurgeAbility, then returns not activated", () => {
      // Source: Intimidate is not a Surge ability -- no terrain should be set
      const pokemon = makeActive({ ability: "intimidate" });
      const state = makeState();
      const context = makeAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(false);
      expect(state.terrain).toBeNull();
    });
  });
});

// ===========================================================================
// Terrain duration
// ===========================================================================

describe("Terrain duration", () => {
  it("given default terrain duration constant, then is 5 turns", () => {
    // Source: Showdown data/conditions.ts -- terrain default duration: 5
    // Source: Bulbapedia -- "Terrain lasts 5 turns"
    expect(TERRAIN_DEFAULT_TURNS).toBe(5);
  });

  it("given terrain extender duration constant, then is 8 turns", () => {
    // Source: Showdown data/items.ts -- terrainextender: duration 5 + 3 = 8
    // Source: Bulbapedia "Terrain Extender" -- "extends terrain duration to 8 turns"
    expect(TERRAIN_EXTENDED_TURNS).toBe(8);
  });

  it("given a Surge ability with Terrain Extender, when activating, then sets terrain for 8 turns", () => {
    // Source: Showdown data/items.ts -- terrainextender: terrain duration + 3
    // Source: Bulbapedia "Terrain Extender" -- "If held by a Pokemon that creates a terrain
    //   via its Ability, that terrain will last 8 turns instead of 5."
    const pokemon = makeActive({
      ability: "electric-surge",
      heldItem: "terrain-extender",
      speciesId: 785,
      nickname: "Tapu Koko",
    });
    const state = makeState();
    const context = makeAbilityContext({ pokemon, state });

    const result = handleSurgeAbility(context);

    expect(result.activated).toBe(true);
    expect(state.terrain).not.toBeNull();
    expect(state.terrain!.type).toBe("electric");
    expect(state.terrain!.turnsLeft).toBe(8);
  });

  it("given a Surge ability without Terrain Extender, when activating, then sets terrain for 5 turns", () => {
    // Source: Showdown data/conditions.ts -- default terrain duration: 5
    const pokemon = makeActive({
      ability: "grassy-surge",
      heldItem: null,
      speciesId: 787,
      nickname: "Tapu Bulu",
    });
    const state = makeState();
    const context = makeAbilityContext({ pokemon, state });

    const result = handleSurgeAbility(context);

    expect(result.activated).toBe(true);
    expect(state.terrain!.turnsLeft).toBe(5);
  });

  it("given Misty Surge with Terrain Extender, when activating, then sets misty terrain for 8 turns", () => {
    // Source: Showdown data/items.ts -- terrainextender works with all Surge abilities
    const pokemon = makeActive({
      ability: "misty-surge",
      heldItem: "terrain-extender",
      speciesId: 788,
      nickname: "Tapu Fini",
    });
    const state = makeState();
    const context = makeAbilityContext({ pokemon, state });

    const result = handleSurgeAbility(context);

    expect(result.activated).toBe(true);
    expect(state.terrain!.type).toBe("misty");
    expect(state.terrain!.turnsLeft).toBe(8);
  });
});

// ===========================================================================
// Suppressed ability edge case
// ===========================================================================

describe("Suppressed Surge ability", () => {
  it("given a Pokemon with Electric Surge but ability is suppressed, when switching in, then does not set terrain", () => {
    // Source: Showdown sim/pokemon.ts -- suppressedAbility prevents ability triggers
    // Source: Bulbapedia -- Gastro Acid suppresses abilities
    const pokemon = makeActive({
      ability: "electric-surge",
      speciesId: 785,
      nickname: "Tapu Koko",
    });
    // Simulate suppressed ability via suppressedAbility field
    (pokemon as any).suppressedAbility = "electric-surge";
    const state = makeState();
    const context = makeAbilityContext({ pokemon, state });

    const result = handleSurgeAbility(context);

    expect(result.activated).toBe(false);
    expect(state.terrain).toBeNull();
  });
});
