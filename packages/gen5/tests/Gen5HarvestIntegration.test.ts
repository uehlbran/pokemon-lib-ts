import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  ItemResult,
} from "@pokemon-lib-ts/battle";
import type { Gender, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen5RemainingAbility } from "../src/Gen5AbilitiesRemaining";
import { applyGen5HeldItem } from "../src/Gen5Items";

/**
 * Integration tests for the Harvest ability berry tracking pipeline.
 *
 * These tests verify that when a berry is consumed (via the item effect pipeline),
 * the "harvest-berry" volatile is set on the Pokemon, and subsequently
 * handleHarvest() can read that volatile to restore the berry.
 *
 * Source: Showdown data/abilities.ts -- harvest onResidual:
 *   `if (pokemon.hp && !pokemon.item && this.dex.items.get(pokemon.lastItem).isBerry)`
 *   `if (this.field.isWeather(['sunnyday', 'desolateland']) || this.randomChance(1, 2))`
 *   `pokemon.setItem(pokemon.lastItem)`
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  uid?: string;
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  gender?: Gender;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: overrides.uid ?? "test",
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
    status: overrides.status ?? null,
    friendship: 0,
    gender: (overrides.gender ?? "male") as const,
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
  uid?: string;
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  gender?: Gender;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      uid: overrides.uid,
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
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
  } as unknown as ActivePokemon;
}

function makeBattleState(overrides?: {
  format?: "singles" | "doubles";
  weather?: { type: string; turnsLeft: number; source: string } | null;
  sides?: [BattleSide, BattleSide];
}): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: overrides?.format ?? "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [
      {
        index: 0,
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
      } as unknown as BattleSide,
      {
        index: 1,
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
      } as unknown as BattleSide,
    ],
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

/**
 * Simulates the engine's processItemResult "consume" effect processing.
 * This is the engine-level logic that sets the "harvest-berry" volatile
 * when a berry is consumed.
 *
 * Source: BattleEngine.ts processItemResult case "consume" --
 *   sets harvest-berry volatile when consumed item ends with "-berry"
 */
function simulateConsumeEffect(pokemon: ActivePokemon, itemResult: ItemResult): void {
  for (const effect of itemResult.effects) {
    if (effect.type === "consume") {
      const consumedItemId = effect.value as string;
      // This mirrors the engine's logic in processItemResult
      if (consumedItemId && consumedItemId.endsWith("-berry")) {
        pokemon.volatileStatuses.set("harvest-berry", {
          turnsLeft: -1,
          data: { berryId: consumedItemId },
        });
      }
      pokemon.pokemon.heldItem = null;
    }
    if (effect.type === "heal") {
      const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
      pokemon.pokemon.currentHp = Math.min(
        maxHp,
        pokemon.pokemon.currentHp + (effect.value as number),
      );
    }
  }
}

function makeAbilityContext(opts: {
  pokemon: ActivePokemon;
  trigger: string;
  rngNextValues?: number[];
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): AbilityContext {
  const state = makeBattleState({ weather: opts.weather });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon: opts.pokemon,
    opponent: undefined,
    state,
    trigger: opts.trigger,
    move: undefined,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// HARVEST INTEGRATION TESTS
// ===========================================================================

describe("Harvest berry tracking integration", () => {
  it("given pokemon with Harvest and consumed Sitrus Berry via item pipeline, when end of turn fires with rng < 0.5, then berry is restored", () => {
    // Source: Showdown data/abilities.ts -- harvest onResidual:
    //   randomChance(1, 2) = 50%; if passed, pokemon.setItem(pokemon.lastItem)
    // Source: Showdown data/items.ts -- sitrus-berry: isBerry: true

    // Step 1: Create a pokemon holding a Sitrus Berry at low HP
    const pokemon = makeActivePokemon({
      ability: "harvest",
      heldItem: "sitrus-berry",
      currentHp: 80,
      maxHp: 200,
    });

    // Step 2: Trigger the Sitrus Berry via the item pipeline
    const itemResult = applyGen5HeldItem("end-of-turn", {
      pokemon,
      state: makeBattleState(),
      rng: {
        next: () => 0,
        int: () => 1,
        chance: (_p: number) => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
    });

    // Verify the Sitrus Berry activated
    expect(itemResult.activated).toBe(true);
    expect(itemResult.effects.some((e) => e.type === "consume")).toBe(true);

    // Step 3: Simulate the engine's processItemResult -- consume sets harvest-berry volatile
    simulateConsumeEffect(pokemon, itemResult);

    // Verify: heldItem is now null and harvest-berry volatile is set
    expect(pokemon.pokemon.heldItem).toBeNull();
    expect(pokemon.volatileStatuses.has("harvest-berry")).toBe(true);
    const harvestData = pokemon.volatileStatuses.get("harvest-berry");
    expect(harvestData?.data?.berryId).toBe("sitrus-berry");

    // Step 4: Trigger Harvest at end of turn with rng = 0.3 (< 0.5, passes 50% check)
    const abilityCtx = makeAbilityContext({
      pokemon,
      trigger: "on-turn-end",
      rngNextValues: [0.3],
    });
    const harvestResult = handleGen5RemainingAbility(abilityCtx);

    // Verify: Harvest activated and wants to restore the berry
    expect(harvestResult.activated).toBe(true);
    expect(harvestResult.effects).toHaveLength(1);
    expect(harvestResult.effects[0]).toEqual({
      effectType: "item-restore",
      target: "self",
      item: "sitrus-berry",
    });
  });

  it("given pokemon with Harvest and consumed Sitrus Berry, when end of turn fires with rng >= 0.5 (no sun), then berry is NOT restored", () => {
    // Source: Showdown data/abilities.ts -- harvest: randomChance(1, 2) = 50%
    // rng.next() returns 0.7 >= 0.5 => fails the 50% check

    const pokemon = makeActivePokemon({
      ability: "harvest",
      heldItem: "sitrus-berry",
      currentHp: 80,
      maxHp: 200,
    });

    // Trigger and consume the berry
    const itemResult = applyGen5HeldItem("end-of-turn", {
      pokemon,
      state: makeBattleState(),
      rng: {
        next: () => 0,
        int: () => 1,
        chance: (_p: number) => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
    });

    simulateConsumeEffect(pokemon, itemResult);
    expect(pokemon.volatileStatuses.has("harvest-berry")).toBe(true);

    // Trigger Harvest with rng = 0.7 (>= 0.5, fails the 50% check)
    const abilityCtx = makeAbilityContext({
      pokemon,
      trigger: "on-turn-end",
      rngNextValues: [0.7],
    });
    const harvestResult = handleGen5RemainingAbility(abilityCtx);

    expect(harvestResult.activated).toBe(false);
  });

  it("given pokemon with Harvest and consumed Sitrus Berry in sun, when end of turn fires with rng >= 0.5, then berry is still restored (100% in sun)", () => {
    // Source: Showdown data/abilities.ts -- harvest:
    //   this.field.isWeather(['sunnyday', 'desolateland']) => 100% chance
    // Source: Bulbapedia -- Harvest: "Always restores the Berry in sunlight."

    const pokemon = makeActivePokemon({
      ability: "harvest",
      heldItem: "sitrus-berry",
      currentHp: 80,
      maxHp: 200,
    });

    // Trigger and consume the berry
    const itemResult = applyGen5HeldItem("end-of-turn", {
      pokemon,
      state: makeBattleState(),
      rng: {
        next: () => 0,
        int: () => 1,
        chance: (_p: number) => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
    });

    simulateConsumeEffect(pokemon, itemResult);

    // Trigger Harvest with sun active and rng = 0.9 (would fail without sun)
    const abilityCtx = makeAbilityContext({
      pokemon,
      trigger: "on-turn-end",
      rngNextValues: [0.9],
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const harvestResult = handleGen5RemainingAbility(abilityCtx);

    // 100% in sun -- should activate despite high rng roll
    expect(harvestResult.activated).toBe(true);
    expect(harvestResult.effects[0]).toEqual({
      effectType: "item-restore",
      target: "self",
      item: "sitrus-berry",
    });
  });

  it("given pokemon with Harvest but no previously consumed berry, when end of turn fires, then no berry is restored", () => {
    // Source: Showdown data/abilities.ts -- harvest: pokemon.lastItem must be a berry
    // No consume happened, so no harvest-berry volatile exists.

    const pokemon = makeActivePokemon({
      ability: "harvest",
      heldItem: null,
      currentHp: 100,
      maxHp: 200,
    });

    // No berry was consumed -- volatile is not set
    expect(pokemon.volatileStatuses.has("harvest-berry")).toBe(false);

    const abilityCtx = makeAbilityContext({
      pokemon,
      trigger: "on-turn-end",
      rngNextValues: [0.1], // Would pass the 50% check, but no berry to restore
    });
    const harvestResult = handleGen5RemainingAbility(abilityCtx);

    expect(harvestResult.activated).toBe(false);
  });

  it("given a non-berry item consumed, when checking volatile, then harvest-berry volatile is NOT set", () => {
    // Source: Showdown data/abilities.ts -- harvest only tracks berry items
    // Source: BattleEngine processItemResult -- only sets volatile for items ending in "-berry"

    const pokemon = makeActivePokemon({
      ability: "harvest",
      heldItem: "white-herb",
    });

    // Simulate consuming a non-berry item (White Herb restoring stats)
    const fakeNonBerryResult: ItemResult = {
      activated: true,
      effects: [{ type: "consume", target: "self", value: "white-herb" }],
      messages: ["White Herb restored stats!"],
    };

    simulateConsumeEffect(pokemon, fakeNonBerryResult);

    // Non-berry items should NOT set the harvest-berry volatile
    expect(pokemon.pokemon.heldItem).toBeNull();
    expect(pokemon.volatileStatuses.has("harvest-berry")).toBe(false);
  });

  it("given a Lum Berry consumed via pipeline, when Harvest triggers, then Lum Berry is restored", () => {
    // Source: Showdown data/abilities.ts -- harvest works with any berry, not just Sitrus
    // Source: Showdown data/items.ts -- lum-berry has isBerry: true

    const pokemon = makeActivePokemon({
      ability: "harvest",
      heldItem: "lum-berry",
      status: "paralysis",
    });

    // Trigger and consume the Lum Berry
    const itemResult = applyGen5HeldItem("end-of-turn", {
      pokemon,
      state: makeBattleState(),
      rng: {
        next: () => 0,
        int: () => 1,
        chance: (_p: number) => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
    });

    expect(itemResult.activated).toBe(true);
    simulateConsumeEffect(pokemon, itemResult);

    expect(pokemon.volatileStatuses.has("harvest-berry")).toBe(true);
    expect(pokemon.volatileStatuses.get("harvest-berry")?.data?.berryId).toBe("lum-berry");

    // Trigger Harvest
    const abilityCtx = makeAbilityContext({
      pokemon,
      trigger: "on-turn-end",
      rngNextValues: [0.2], // Passes 50% check
    });
    const harvestResult = handleGen5RemainingAbility(abilityCtx);

    expect(harvestResult.activated).toBe(true);
    expect(harvestResult.effects[0]).toEqual({
      effectType: "item-restore",
      target: "self",
      item: "lum-berry",
    });
  });
});
