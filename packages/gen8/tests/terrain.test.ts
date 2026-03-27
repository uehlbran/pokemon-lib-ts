import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonType, PrimaryStatus, TerrainType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
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
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src/data";
import { Gen8Ruleset } from "../src/Gen8Ruleset";
import {
  applyGen8TerrainEffects,
  checkGen8TerrainStatusImmunity,
  checkMistyTerrainConfusionImmunity,
  checkPsychicTerrainPriorityBlock,
  handleSurgeAbility,
  isSurgeAbility,
  TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS,
} from "../src/Gen8Terrain";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const dataManager = createGen8DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN8_ABILITY_IDS } as const;
const abilityTriggerIds = CORE_ABILITY_TRIGGER_IDS;
const itemIds = { ...CORE_ITEM_IDS, ...GEN8_ITEM_IDS } as const;
const natureIds = GEN8_NATURE_IDS;
const speciesIds = GEN8_SPECIES_IDS;
const statusIds = CORE_STATUS_IDS;
const terrainIds = CORE_TERRAIN_IDS;
const typeIds = CORE_TYPE_IDS;
const surgeSpeciesIds = {
  pincurchin: speciesIds.pincurchin,
  rillaboom: speciesIds.rillaboom,
  indeedee: speciesIds.indeedee,
  weezing: speciesIds.weezing,
} as const;
const defaultSpecies = dataManager.getSpecies(speciesIds.pikachu);
const defaultNature = dataManager.getNature(natureIds.hardy).id;

function _createSyntheticBattleStats(maxHp = 200, statValue = 100) {
  return {
    hp: maxHp,
    attack: statValue,
    defense: statValue,
    spAttack: statValue,
    spDefense: statValue,
    speed: statValue,
  };
}

function createOnFieldPokemon(overrides: {
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
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const level = overrides.level ?? 50;
  const maxHp = overrides.hp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, level, new SeededRandom(7), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    moves: [],
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });

  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.status ?? null;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: overrides.speed ?? 100,
  };

  const active = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(species.types as PokemonType[])],
  );
  active.ability = overrides.ability ?? abilityIds.none;
  active.volatileStatuses = overrides.volatiles ?? new Map();
  active.statStages = {
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
  return active;
}

function createBattleState(overrides?: {
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
    generation: 8,
    turnNumber: 1,
    rng: new SeededRandom(42),
    sides: overrides?.sides ?? [
      { index: 0, active: [] },
      { index: 1, active: [] },
    ],
  } as unknown as BattleState;
}

function createAbilityContext(overrides: {
  pokemon: ActivePokemon;
  state?: BattleState;
  opponent?: ActivePokemon;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon,
    opponent: overrides.opponent ?? createOnFieldPokemon({}),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(42),
    trigger: abilityTriggerIds.onSwitchIn,
  };
}

// ===========================================================================
// Electric Terrain -- Status Immunity
// ===========================================================================

describe("Electric Terrain", () => {
  describe("status immunity", () => {
    it("given Electric Terrain, when inflicting sleep on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain.onSetStatus:
      //   if (status.id === 'slp') return false
      // Source: Bulbapedia "Electric Terrain" -- "Grounded Pokemon cannot fall asleep."
      const target = createOnFieldPokemon({ types: [typeIds.electric] });
      const state = createBattleState({
        terrain: { type: terrainIds.electric, turnsLeft: 5, source: terrainIds.electricTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.sleep, target, state);
      expect(result.immune).toBe(true);
      expect(result.message).toContain("Electric Terrain");
    });

    it("given Electric Terrain, when inflicting sleep on a Flying-type (non-grounded), then allows it", () => {
      // Source: Showdown data/conditions.ts -- terrain effects only apply to grounded Pokemon
      // Source: Bulbapedia "Electric Terrain" -- only grounded Pokemon are affected
      const target = createOnFieldPokemon({ types: [typeIds.flying] });
      const state = createBattleState({
        terrain: { type: terrainIds.electric, turnsLeft: 5, source: terrainIds.electricTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.sleep, target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting burn on a grounded Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain only blocks sleep, not other statuses
      // Source: Bulbapedia "Electric Terrain" -- only prevents sleep
      const target = createOnFieldPokemon({ types: [typeIds.electric] });
      const state = createBattleState({
        terrain: { type: terrainIds.electric, turnsLeft: 5, source: terrainIds.electricTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.burn, target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting paralysis on a grounded Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain only blocks sleep
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.electric, turnsLeft: 5, source: terrainIds.electricTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.paralysis, target, state);
      expect(result.immune).toBe(false);
    });
  });
});

// ===========================================================================
// Misty Terrain -- Status Immunity
// ===========================================================================

describe("Misty Terrain", () => {
  describe("status immunity", () => {
    it("given Misty Terrain, when inflicting burn on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return false (all status)
      // Source: Bulbapedia "Misty Terrain" -- "Grounded Pokemon are protected from status conditions."
      const target = createOnFieldPokemon({ types: [typeIds.fairy] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.burn, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting paralysis on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return false
      // Source: Bulbapedia "Misty Terrain" -- blocks all primary status conditions
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.paralysis, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting freeze on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: blocks all status
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.freeze, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting sleep on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: blocks all status
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.sleep, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting poison on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return false
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.poison, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting toxic on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return false
      // Toxic (badly poisoned) is a primary status variant
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkGen8TerrainStatusImmunity("toxic" as PrimaryStatus, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting burn on a Flying-type (non-grounded), then allows it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain: only grounded Pokemon protected
      // Source: Bulbapedia "Misty Terrain" -- non-grounded Pokemon are not protected
      const target = createOnFieldPokemon({ types: [typeIds.flying] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkGen8TerrainStatusImmunity(statusIds.burn, target, state);
      expect(result.immune).toBe(false);
    });
  });

  describe("confusion immunity", () => {
    it("given Misty Terrain, when checking confusion immunity for a grounded Pokemon, then returns true", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onTryAddVolatile:
      //   if (status.id === 'confusion') return null
      // Source: Bulbapedia "Misty Terrain" -- "prevents confusion"
      const target = createOnFieldPokemon({ types: [typeIds.fairy] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkMistyTerrainConfusionImmunity(target, state);
      expect(result).toBe(true);
    });

    it("given Misty Terrain, when checking confusion immunity for a Flying-type (non-grounded), then returns false", () => {
      // Source: Showdown data/conditions.ts -- terrain only protects grounded Pokemon
      const target = createOnFieldPokemon({ types: [typeIds.flying] });
      const state = createBattleState({
        terrain: { type: terrainIds.misty, turnsLeft: 5, source: terrainIds.mistyTerrain },
      });

      const result = checkMistyTerrainConfusionImmunity(target, state);
      expect(result).toBe(false);
    });

    it("given no terrain, when checking confusion immunity, then returns false", () => {
      // Source: No terrain = no confusion immunity
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState();

      const result = checkMistyTerrainConfusionImmunity(target, state);
      expect(result).toBe(false);
    });

    it("given Electric Terrain (not Misty), when checking confusion immunity, then returns false", () => {
      // Source: Only Misty Terrain blocks confusion
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.electric, turnsLeft: 5, source: terrainIds.electricTerrain },
      });

      const result = checkMistyTerrainConfusionImmunity(target, state);
      expect(result).toBe(false);
    });
  });
});

// ===========================================================================
// Psychic Terrain -- Priority Blocking
// ===========================================================================

describe("Psychic Terrain", () => {
  describe("priority blocking", () => {
    it("given Psychic Terrain and a priority +1 move targeting a grounded Pokemon, when checking priority block, then returns true", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain.onTryHit:
      //   if (target.isGrounded() && move.priority > 0) return false
      // Source: Bulbapedia "Psychic Terrain" -- "Grounded Pokemon are protected from
      //   moves with increased priority."
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState();

      const blocked = checkPsychicTerrainPriorityBlock(terrainIds.psychic, 1, target, state);
      expect(blocked).toBe(true);
    });

    it("given Psychic Terrain and a priority +2 move targeting a grounded Pokemon, when checking priority block, then returns true", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain: any priority > 0 is blocked
      // Source: Bulbapedia "Psychic Terrain" -- blocks ALL increased priority, not just +1
      const target = createOnFieldPokemon({ types: [typeIds.psychic] });
      const state = createBattleState();

      const blocked = checkPsychicTerrainPriorityBlock(terrainIds.psychic, 2, target, state);
      expect(blocked).toBe(true);
    });

    it("given Psychic Terrain and a priority +1 move targeting a Flying-type (non-grounded), then returns false", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain: only blocks vs grounded targets
      // Source: Bulbapedia "Psychic Terrain" -- non-grounded Pokemon are not protected
      const target = createOnFieldPokemon({ types: [typeIds.flying] });
      const state = createBattleState();

      const blocked = checkPsychicTerrainPriorityBlock(terrainIds.psychic, 1, target, state);
      expect(blocked).toBe(false);
    });

    it("given Psychic Terrain and a normal-priority move (priority 0), when checking priority block, then returns false", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain: only priority > 0
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState();

      const blocked = checkPsychicTerrainPriorityBlock(terrainIds.psychic, 0, target, state);
      expect(blocked).toBe(false);
    });

    it("given Psychic Terrain and a negative priority move (priority -1), when checking priority block, then returns false", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain: only priority > 0
      // Negative priority moves (e.g., Roar at -6) are not blocked
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState();

      const blocked = checkPsychicTerrainPriorityBlock(terrainIds.psychic, -1, target, state);
      expect(blocked).toBe(false);
    });

    it("given Electric Terrain (not Psychic), when checking priority block, then returns false", () => {
      // Source: Showdown data/conditions.ts -- only psychicterrain blocks priority
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState();

      const blocked = checkPsychicTerrainPriorityBlock(terrainIds.electric, 1, target, state);
      expect(blocked).toBe(false);
    });

    it("given no terrain (null), when checking priority block, then returns false", () => {
      // Source: No terrain = no blocking
      const target = createOnFieldPokemon({ types: [typeIds.normal] });
      const state = createBattleState();

      const blocked = checkPsychicTerrainPriorityBlock(null, 1, target, state);
      expect(blocked).toBe(false);
    });

    it("given Psychic Terrain and a Levitate Pokemon, when checking priority block with +1 priority, then returns false", () => {
      // Source: Showdown data/conditions.ts -- Levitate = not grounded = not protected
      const target = createOnFieldPokemon({
        types: [typeIds.normal],
        ability: abilityIds.levitate,
      });
      const state = createBattleState();

      const blocked = checkPsychicTerrainPriorityBlock(terrainIds.psychic, 1, target, state);
      expect(blocked).toBe(false);
    });
  });
});

// ===========================================================================
// Grassy Terrain -- End-of-Turn Healing
// ===========================================================================

describe("Grassy Terrain", () => {
  describe("end-of-turn healing", () => {
    it("given Grassy Terrain and a grounded Pokemon below max HP, when applying terrain effects, then heals 1/16 max HP", () => {
      // Source: Showdown data/conditions.ts -- grassyterrain.onResidual:
      //   this.heal(pokemon.baseMaxhp / 16)
      // Source: Bulbapedia "Grassy Terrain" -- "At the end of each turn, the HP of each
      //   grounded Pokemon is restored by 1/16 of its maximum HP."
      // For maxHp=160: floor(160/16) = 10
      const pokemon = createOnFieldPokemon({ hp: 160, currentHp: 100, types: [typeIds.grass] });
      const state = createBattleState({
        terrain: { type: terrainIds.grassy, turnsLeft: 5, source: terrainIds.grassyTerrain },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen8TerrainEffects(state);
      expect(results.length).toBe(1);
      expect(results[0].effect).toBe("grassy-heal");
      expect(results[0].healAmount).toBe(10);
    });

    it("given Grassy Terrain and a grounded Pokemon with 320 max HP, when applying terrain effects, then heals floor(320/16) = 20", () => {
      // Source: Showdown data/conditions.ts -- grassyterrain.onResidual:
      //   this.heal(pokemon.baseMaxhp / 16)
      // floor(320/16) = 20
      const pokemon = createOnFieldPokemon({ hp: 320, currentHp: 200, types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.grassy, turnsLeft: 3, source: terrainIds.grassyTerrain },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen8TerrainEffects(state);
      expect(results.length).toBe(1);
      expect(results[0].healAmount).toBe(20);
    });

    it("given Grassy Terrain and a Flying-type (non-grounded) Pokemon, when applying terrain effects, then does not heal", () => {
      // Source: Showdown data/conditions.ts -- terrain effects only apply to grounded Pokemon
      // Source: Bulbapedia "Grassy Terrain" -- only grounded Pokemon receive healing
      const pokemon = createOnFieldPokemon({ hp: 200, currentHp: 100, types: [typeIds.flying] });
      const state = createBattleState({
        terrain: { type: terrainIds.grassy, turnsLeft: 5, source: terrainIds.grassyTerrain },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen8TerrainEffects(state);
      expect(results.length).toBe(0);
    });

    it("given Grassy Terrain and a grounded Pokemon at full HP, when applying terrain effects, then does not heal", () => {
      // Source: Showdown data/conditions.ts -- no heal if already at max HP
      const pokemon = createOnFieldPokemon({ hp: 200, currentHp: 200, types: [typeIds.grass] });
      const state = createBattleState({
        terrain: { type: terrainIds.grassy, turnsLeft: 5, source: terrainIds.grassyTerrain },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen8TerrainEffects(state);
      expect(results.length).toBe(0);
    });

    it("given Grassy Terrain and a fainted Pokemon, when applying terrain effects, then does not heal", () => {
      // Source: Showdown data/conditions.ts -- fainted Pokemon are skipped
      const pokemon = createOnFieldPokemon({ hp: 200, currentHp: 0, types: [typeIds.grass] });
      const state = createBattleState({
        terrain: { type: terrainIds.grassy, turnsLeft: 5, source: terrainIds.grassyTerrain },
        sides: [
          { index: 0, active: [pokemon] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen8TerrainEffects(state);
      expect(results.length).toBe(0);
    });

    it("given Grassy Terrain and a Pokemon with 1 max HP, when applying terrain effects, then heals minimum 1 HP", () => {
      // Source: Showdown data/conditions.ts -- Math.max(1, floor(maxhp/16))
      // For maxHp=1: floor(1/16) = 0, clamped to 1
      // This tests the min-1 clamp for Shedinja-like edge cases
      const _pokemon = createOnFieldPokemon({
        hp: 1,
        currentHp: 0,
        types: [typeIds.bug, typeIds.ghost],
      });
      // Shedinja can't be at 0 HP and receive heal... use a 15 HP mon where floor(15/16)=0
      const pokemon2 = createOnFieldPokemon({ hp: 15, currentHp: 10, types: [typeIds.normal] });
      const state = createBattleState({
        terrain: { type: terrainIds.grassy, turnsLeft: 5, source: terrainIds.grassyTerrain },
        sides: [
          { index: 0, active: [pokemon2] },
          { index: 1, active: [] },
        ],
      });

      const results = applyGen8TerrainEffects(state);
      expect(results.length).toBe(1);
      // floor(15/16) = 0, clamped to min 1
      expect(results[0].healAmount).toBe(1);
    });
  });

  describe("via Gen8Ruleset.applyTerrainEffects", () => {
    it("given Grassy Terrain, when calling ruleset applyTerrainEffects, then returns healing results", () => {
      // Source: Showdown data/conditions.ts -- grassyterrain.onResidual
      const ruleset = new Gen8Ruleset();
      const pokemon = createOnFieldPokemon({ hp: 160, currentHp: 80, types: [typeIds.grass] });
      const state = createBattleState({
        terrain: { type: terrainIds.grassy, turnsLeft: 5, source: terrainIds.grassyTerrain },
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
// No terrain
// ===========================================================================

describe("No terrain", () => {
  it("given no terrain active, when checking terrain status immunity, then allows all status", () => {
    // Source: No terrain = no protection
    const target = createOnFieldPokemon({ types: [typeIds.normal] });
    const state = createBattleState();

    const result = checkGen8TerrainStatusImmunity(statusIds.sleep, target, state);
    expect(result.immune).toBe(false);
  });

  it("given no terrain active, when applying terrain effects, then returns empty array", () => {
    // Source: No terrain = no effects
    const state = createBattleState();
    const results = applyGen8TerrainEffects(state);
    expect(results.length).toBe(0);
  });

  it("given no terrain active, when checking confusion immunity, then returns false", () => {
    // Source: No terrain = no confusion immunity
    const target = createOnFieldPokemon({ types: [typeIds.normal] });
    const state = createBattleState();

    const result = checkMistyTerrainConfusionImmunity(target, state);
    expect(result).toBe(false);
  });
});

// ===========================================================================
// Surge Abilities
// ===========================================================================

describe("Surge abilities", () => {
  describe("isSurgeAbility", () => {
    it("given electric-surge, when checking isSurgeAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- electricsurge
      expect(isSurgeAbility(abilityIds.electricSurge)).toBe(true);
    });

    it("given grassy-surge, when checking isSurgeAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- grassysurge
      expect(isSurgeAbility(abilityIds.grassySurge)).toBe(true);
    });

    it("given psychic-surge, when checking isSurgeAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- psychicsurge
      expect(isSurgeAbility(abilityIds.psychicSurge)).toBe(true);
    });

    it("given misty-surge, when checking isSurgeAbility, then returns true", () => {
      // Source: Showdown data/abilities.ts -- mistysurge
      expect(isSurgeAbility(abilityIds.mistySurge)).toBe(true);
    });

    it("given intimidate, when checking isSurgeAbility, then returns false", () => {
      // Source: Intimidate is not a Surge ability
      expect(isSurgeAbility(abilityIds.intimidate)).toBe(false);
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
      const pokemon = createOnFieldPokemon({
        ability: abilityIds.electricSurge,
        speciesId: surgeSpeciesIds.pincurchin,
        nickname: "Pincurchin",
      });
      const state = createBattleState();
      const context = createAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe(terrainIds.electric);
      expect(state.terrain!.turnsLeft).toBe(5);
      expect(state.terrain!.source).toBe(abilityIds.electricSurge);
    });
  });

  describe("Grassy Surge", () => {
    it("given a Pokemon with Grassy Surge, when switching in, then sets Grassy Terrain for 5 turns", () => {
      // Source: Showdown data/abilities.ts -- grassysurge:
      //   onStart: this.field.setTerrain('grassyterrain')
      // Source: Bulbapedia "Grassy Surge" -- "sets Grassy Terrain when the Pokemon enters battle"
      const pokemon = createOnFieldPokemon({
        ability: abilityIds.grassySurge,
        speciesId: surgeSpeciesIds.rillaboom,
        nickname: "Rillaboom",
      });
      const state = createBattleState();
      const context = createAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe(terrainIds.grassy);
      expect(state.terrain!.turnsLeft).toBe(5);
    });
  });

  describe("Psychic Surge", () => {
    it("given a Pokemon with Psychic Surge, when switching in, then sets Psychic Terrain for 5 turns", () => {
      // Source: Showdown data/abilities.ts -- psychicsurge:
      //   onStart: this.field.setTerrain('psychicterrain')
      // Source: Bulbapedia "Psychic Surge" -- "sets Psychic Terrain when the Pokemon enters battle"
      const pokemon = createOnFieldPokemon({
        ability: abilityIds.psychicSurge,
        speciesId: surgeSpeciesIds.indeedee,
        nickname: "Indeedee",
      });
      const state = createBattleState();
      const context = createAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe(terrainIds.psychic);
      expect(state.terrain!.turnsLeft).toBe(5);
    });
  });

  describe("Misty Surge", () => {
    it("given a Pokemon with Misty Surge, when switching in, then sets Misty Terrain for 5 turns", () => {
      // Source: Showdown data/abilities.ts -- mistysurge:
      //   onStart: this.field.setTerrain('mistyterrain')
      // Source: Bulbapedia "Misty Surge" -- "sets Misty Terrain when the Pokemon enters battle"
      const pokemon = createOnFieldPokemon({
        ability: abilityIds.mistySurge,
        speciesId: surgeSpeciesIds.weezing,
        nickname: "Galarian Weezing",
      });
      const state = createBattleState();
      const context = createAbilityContext({ pokemon, state });

      const result = handleSurgeAbility(context);

      expect(result.activated).toBe(true);
      expect(state.terrain).not.toBeNull();
      expect(state.terrain!.type).toBe(terrainIds.misty);
      expect(state.terrain!.turnsLeft).toBe(5);
    });
  });

  describe("non-Surge ability", () => {
    it("given a Pokemon with Intimidate on switch-in, when calling handleSurgeAbility, then returns not activated", () => {
      // Source: Intimidate is not a Surge ability -- no terrain should be set
      const pokemon = createOnFieldPokemon({ ability: abilityIds.intimidate });
      const state = createBattleState();
      const context = createAbilityContext({ pokemon, state });

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
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.electricSurge,
      heldItem: itemIds.terrainExtender,
      speciesId: surgeSpeciesIds.pincurchin,
      nickname: "Pincurchin",
    });
    const state = createBattleState();
    const context = createAbilityContext({ pokemon, state });

    const result = handleSurgeAbility(context);

    expect(result.activated).toBe(true);
    expect(state.terrain).not.toBeNull();
    expect(state.terrain!.type).toBe(terrainIds.electric);
    expect(state.terrain!.turnsLeft).toBe(8);
  });

  it("given a Surge ability without Terrain Extender, when activating, then sets terrain for 5 turns", () => {
    // Source: Showdown data/conditions.ts -- default terrain duration: 5
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.grassySurge,
      heldItem: null,
      speciesId: surgeSpeciesIds.rillaboom,
      nickname: "Rillaboom",
    });
    const state = createBattleState();
    const context = createAbilityContext({ pokemon, state });

    const result = handleSurgeAbility(context);

    expect(result.activated).toBe(true);
    expect(state.terrain!.turnsLeft).toBe(5);
  });

  it("given Misty Surge with Terrain Extender, when activating, then sets misty terrain for 8 turns", () => {
    // Source: Showdown data/items.ts -- terrainextender works with all Surge abilities
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.mistySurge,
      heldItem: itemIds.terrainExtender,
      speciesId: surgeSpeciesIds.weezing,
      nickname: "Galarian Weezing",
    });
    const state = createBattleState();
    const context = createAbilityContext({ pokemon, state });

    const result = handleSurgeAbility(context);

    expect(result.activated).toBe(true);
    expect(state.terrain!.type).toBe(terrainIds.misty);
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
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.electricSurge,
      speciesId: surgeSpeciesIds.pincurchin,
      nickname: "Pincurchin",
    });
    // Simulate suppressed ability via suppressedAbility field
    (pokemon as any).suppressedAbility = abilityIds.electricSurge;
    const state = createBattleState();
    const context = createAbilityContext({ pokemon, state });

    const result = handleSurgeAbility(context);

    expect(result.activated).toBe(false);
    expect(state.terrain).toBeNull();
  });
});
