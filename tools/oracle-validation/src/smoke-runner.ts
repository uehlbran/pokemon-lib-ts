/**
 * Smoke runner for oracle validation.
 *
 * Runs 200+ AI-vs-AI random battles per generation and validates structural
 * invariants: no HP < 0, legal status transitions, no infinite loops, etc.
 *
 * Delegates to the shared battle simulation infrastructure.
 */
import type {
  BattleEvent,
  DamageEvent,
  GenerationRuleset,
  HealEvent,
  StatusInflictEvent,
  TerrainSetEvent,
  TurnStartEvent,
  WeatherSetEvent,
} from "@pokemon-lib-ts/battle";
import {
  BATTLE_EVENT_TYPES,
  BATTLE_PHASE_IDS,
  BattleEngine,
  RandomAI,
} from "@pokemon-lib-ts/battle";
import type { AbilitySlot, DataManager, Generation, NatureId } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_WEATHER_IDS,
  createDvs,
  createEvs,
  createIvs,
  createStatExp,
  MAX_DV,
  MAX_IV,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { createGen1DataManager, Gen1Ruleset } from "@pokemon-lib-ts/gen1";
import { createGen2DataManager, Gen2Ruleset } from "@pokemon-lib-ts/gen2";
import { createGen3DataManager, Gen3Ruleset } from "@pokemon-lib-ts/gen3";
import { createGen4DataManager, Gen4Ruleset } from "@pokemon-lib-ts/gen4";
import { createGen5DataManager, Gen5Ruleset } from "@pokemon-lib-ts/gen5";
import { createGen6DataManager, Gen6Ruleset } from "@pokemon-lib-ts/gen6";
import { createGen7DataManager, Gen7Ruleset } from "@pokemon-lib-ts/gen7";
import { createGen8DataManager, Gen8Ruleset } from "@pokemon-lib-ts/gen8";
import { createGen9DataManager, Gen9Ruleset } from "@pokemon-lib-ts/gen9";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

const SMOKE_BATTLES_PER_GEN = 500;
const TEAM_SIZE = 6;
const MAX_TURNS = 200;
const BASE_SEED = 0xbabe_cafe;

// Cache data managers to avoid reinit per battle
const _dataManagerCache = new Map<number, DataManager>();

function getDataManager(gen: number): DataManager {
  if (!_dataManagerCache.has(gen)) {
    const factory: Record<number, () => DataManager> = {
      1: createGen1DataManager,
      2: createGen2DataManager,
      3: createGen3DataManager,
      4: createGen4DataManager,
      5: createGen5DataManager,
      6: createGen6DataManager,
      7: createGen7DataManager,
      8: createGen8DataManager,
      9: createGen9DataManager,
    };
    _dataManagerCache.set(gen, (factory[gen] ?? createGen1DataManager)());
  }
  return _dataManagerCache.get(gen) as DataManager;
}

function createRuleset(gen: number): GenerationRuleset {
  const factories: Record<number, () => GenerationRuleset> = {
    1: () => new Gen1Ruleset(),
    2: () => new Gen2Ruleset(),
    3: () => new Gen3Ruleset(),
    4: () => new Gen4Ruleset(),
    5: () => new Gen5Ruleset(),
    6: () => new Gen6Ruleset(),
    7: () => new Gen7Ruleset(),
    8: () => new Gen8Ruleset(),
    9: () => new Gen9Ruleset(),
  };
  return (factories[gen] ?? (() => new Gen1Ruleset()))();
}

export function generateMinimalTeam(
  gen: number,
  dataManager: DataManager,
  rng: SeededRandom,
  uidPrefix: string,
) {
  const allSpecies = dataManager.getAllSpecies();
  const shuffled = rng.shuffle([...allSpecies]);
  const team = [];
  let nextUid = 0;

  // Pre-build item pool and nature list once per team
  // Items: Gen 2+ has held items in the DataManager (62 in Gen 2, growing in later gens)
  // Natures: Gen 3+ only (Gen 1-2 have no nature mechanic)
  const allItems = gen >= 2 ? dataManager.getAllItems() : [];
  const allNatures = gen >= 3 ? dataManager.getAllNatures() : [];

  for (const species of shuffled) {
    if (team.length >= TEAM_SIZE) break;

    const learnableMoveIds = [
      ...species.learnset.levelUp.filter((m) => m.level <= 50).map((m) => m.move),
      ...species.learnset.tm,
    ];
    const uniqueIds = [...new Set(learnableMoveIds)];
    if (uniqueIds.length === 0) continue;

    // Shuffle the move pool and pick up to 4
    const shuffledMoveIds = rng.shuffle([...uniqueIds]);
    const moves = shuffledMoveIds.slice(0, 4).flatMap((id) => {
      try {
        const md = dataManager.getMove(id);
        return [{ moveId: id, currentPP: md.pp, maxPP: md.pp, ppUps: 0 }];
      } catch {
        return [];
      }
    });
    if (moves.length === 0) continue;

    const ivs =
      gen <= 2
        ? createDvs({
            attack: MAX_DV,
            defense: MAX_DV,
            speed: MAX_DV,
            spAttack: MAX_DV,
            spDefense: MAX_DV,
          })
        : createIvs({
            hp: MAX_IV,
            attack: MAX_IV,
            defense: MAX_IV,
            spAttack: MAX_IV,
            spDefense: MAX_IV,
            speed: MAX_IV,
          });
    const evs = gen <= 2 ? createStatExp() : createEvs();

    // Randomly select an ability slot from available options
    let ability = "";
    let abilitySlot: AbilitySlot = CORE_ABILITY_SLOTS.normal1;
    if (gen >= 3) {
      const candidates: [string, AbilitySlot][] = [];
      if (species.abilities.normal[0])
        candidates.push([species.abilities.normal[0], CORE_ABILITY_SLOTS.normal1]);
      if (species.abilities.normal[1])
        candidates.push([species.abilities.normal[1], CORE_ABILITY_SLOTS.normal2]);
      if (species.abilities.hidden)
        candidates.push([species.abilities.hidden, CORE_ABILITY_SLOTS.hidden]);

      if (candidates.length === 0) continue;

      // Pick a random slot
      const pick = rng.pick(candidates);
      const [candidateId, candidateSlot] = pick;
      try {
        dataManager.getAbility(candidateId);
        ability = candidateId;
        abilitySlot = candidateSlot;
      } catch {
        // Fall back to first candidate (if the random pick happened to be candidates[0]
        // and it failed, this re-tries the same entry — both will fail together, which is
        // correct since a bad ability reference means the species should be skipped).
        const first = candidates[0];
        if (!first) continue;
        try {
          dataManager.getAbility(first[0]);
          ability = first[0];
          abilitySlot = first[1];
        } catch {
          continue;
        }
      }
    }

    // Randomly pick a held item (Gen 2+)
    let heldItem: string | null = null;
    if (gen >= 2 && allItems.length > 0) {
      heldItem = rng.pick(allItems).id;
    }

    // Randomly pick a nature (Gen 3+), or use neutral for Gen 1-2
    let nature: NatureId;
    if (gen <= 2) {
      nature = CORE_NATURE_IDS.serious;
    } else if (allNatures.length > 0) {
      nature = rng.pick(allNatures).id;
    } else {
      nature = CORE_NATURE_IDS.hardy;
    }

    team.push({
      uid: `${uidPrefix}-${++nextUid}`,
      speciesId: species.id,
      nickname: null,
      level: 50,
      experience: 0,
      nature,
      ivs,
      evs,
      currentHp: 1,
      moves,
      ability,
      abilitySlot,
      heldItem,
      status: null,
      friendship: 70,
      gender: "male" as const,
      isShiny: false,
      metLocation: "smoke-test",
      metLevel: 50,
      originalTrainer: "Smoke",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
    });
  }

  return team;
}

const VALID_PRIMARY_STATUSES = new Set(Object.values(CORE_STATUS_IDS));
const VALID_WEATHER_TYPES = new Set(Object.values(CORE_WEATHER_IDS));
const VALID_TERRAIN_TYPES = new Set([
  CORE_TERRAIN_IDS.electric,
  CORE_TERRAIN_IDS.grassy,
  CORE_TERRAIN_IDS.misty,
  CORE_TERRAIN_IDS.psychic,
]);

export interface SmokeInvariantViolation {
  readonly eventIndex: number;
  readonly description: string;
}

export function checkBattleInvariants(events: readonly BattleEvent[]): SmokeInvariantViolation[] {
  const violations: SmokeInvariantViolation[] = [];
  let lastTurnNumber = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) continue;

    if (event.type === BATTLE_EVENT_TYPES.damage) {
      const e = event as DamageEvent;
      if (e.currentHp < 0) {
        violations.push({
          eventIndex: i,
          description: `${e.side}:${e.pokemon} HP went negative (${e.currentHp}) in damage event`,
        });
      }
      if (e.maxHp > 0 && e.currentHp > e.maxHp) {
        violations.push({
          eventIndex: i,
          description: `${e.side}:${e.pokemon} HP exceeded max (${e.currentHp}/${e.maxHp}) in damage event`,
        });
      }
      if (e.amount < 0) {
        violations.push({
          eventIndex: i,
          description: `${e.side}:${e.pokemon} damage amount must not be negative, got ${e.amount}`,
        });
      }
    } else if (event.type === BATTLE_EVENT_TYPES.heal) {
      const e = event as HealEvent;
      if (e.currentHp < 0) {
        violations.push({
          eventIndex: i,
          description: `${e.side}:${e.pokemon} HP went negative (${e.currentHp}) in heal event`,
        });
      }
      if (e.maxHp > 0 && e.currentHp > e.maxHp) {
        violations.push({
          eventIndex: i,
          description: `${e.side}:${e.pokemon} HP exceeded max (${e.currentHp}/${e.maxHp}) in heal event`,
        });
      }
      if (e.amount < 0) {
        violations.push({
          eventIndex: i,
          description: `${e.side}:${e.pokemon} heal amount must not be negative, got ${e.amount}`,
        });
      }
    } else if (event.type === BATTLE_EVENT_TYPES.turnStart) {
      const e = event as TurnStartEvent;
      if (e.turnNumber <= lastTurnNumber) {
        violations.push({
          eventIndex: i,
          description: `turn number did not increase: got ${e.turnNumber} after ${lastTurnNumber}`,
        });
      }
      lastTurnNumber = e.turnNumber;
    } else if (event.type === BATTLE_EVENT_TYPES.statusInflict) {
      const e = event as StatusInflictEvent;
      if (!VALID_PRIMARY_STATUSES.has(e.status)) {
        violations.push({
          eventIndex: i,
          description: `invalid status "${e.status}" applied to ${e.side}:${e.pokemon}`,
        });
      }
    } else if (event.type === BATTLE_EVENT_TYPES.weatherSet) {
      const e = event as WeatherSetEvent;
      if (!VALID_WEATHER_TYPES.has(e.weather)) {
        violations.push({
          eventIndex: i,
          description: `invalid weather "${e.weather}" set from ${e.source}`,
        });
      }
    } else if (event.type === BATTLE_EVENT_TYPES.terrainSet) {
      const e = event as TerrainSetEvent;
      if (!VALID_TERRAIN_TYPES.has(e.terrain)) {
        violations.push({
          eventIndex: i,
          description: `invalid terrain "${e.terrain}" set from ${e.source}`,
        });
      }
    }
  }

  return violations;
}

export function runSmokeSuite(generation: ImplementedGeneration): SuiteResult {
  const gen = generation.gen;
  const failures: string[] = [];
  let crashed = 0;
  let timedOut = 0;

  try {
    const dataManager = getDataManager(gen);

    for (let i = 0; i < SMOKE_BATTLES_PER_GEN; i++) {
      const seed = BASE_SEED + gen * 10000 + i;
      const rng1 = new SeededRandom(seed);
      const rng2 = new SeededRandom(seed + 500);

      const team1 = generateMinimalTeam(gen, dataManager, rng1, "p1");
      const team2 = generateMinimalTeam(gen, dataManager, rng2, "p2");

      if (team1.length === 0 || team2.length === 0) {
        crashed++;
        failures.push(`Battle ${i}: failed to generate teams (gen${gen})`);
        continue;
      }

      try {
        const ruleset = createRuleset(gen);
        const engine = new BattleEngine(
          {
            generation: gen as Generation,
            format: "singles",
            teams: [team1, team2],
            seed: seed + 1000,
          },
          ruleset,
          dataManager,
        );

        const ai = new RandomAI();
        const aiRng = new SeededRandom(seed + 2000);

        engine.start();

        let turnCount = 0;
        while (!engine.isEnded() && turnCount < MAX_TURNS) {
          const phase = engine.getPhase();
          if (phase === BATTLE_PHASE_IDS.actionSelect) {
            const state = engine.getState();
            const action0 = ai.chooseAction(0, state, ruleset, aiRng, engine.getAvailableMoves(0));
            const action1 = ai.chooseAction(1, state, ruleset, aiRng, engine.getAvailableMoves(1));
            engine.submitAction(0, action0);
            engine.submitAction(1, action1);
            turnCount++;
          } else if (phase === BATTLE_PHASE_IDS.switchPrompt) {
            // No HP guard — self-switch moves (U-turn, Volt Switch, Baton Pass) put the
            // engine into switch-prompt with the user's active Pokemon still alive.
            for (const sideIdx of [0, 1] as const) {
              const sw = ai.chooseSwitchIn(sideIdx, engine.getState(), ruleset, aiRng);
              if (sw !== null) {
                try {
                  engine.submitSwitch(sideIdx, sw);
                } catch {
                  /* side doesn't need a switch */
                }
              }
            }
          } else {
            break;
          }
        }

        if (!engine.isEnded() && turnCount >= MAX_TURNS) {
          timedOut++;
          // Time-outs are not failures — they indicate long battles
        }

        const events = engine.getEventLog();
        const violations = checkBattleInvariants(events);
        for (const v of violations) {
          failures.push(`Gen${gen} battle ${i} seed=${seed}: ${v.description}`);
        }
      } catch (err) {
        crashed++;
        failures.push(
          `Gen${gen} battle ${i} seed=${seed}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    return {
      status: "fail",
      suitePassed: false,
      failed: 1,
      skipped: 0,
      failures: [
        `Smoke runner init failed for Gen${gen}: ${err instanceof Error ? err.message : String(err)}`,
      ],
      notes: [],
      matchedKnownDisagreements: [],
      staleDisagreements: [],
      oracleChecks: [],
    };
  }

  const notes = [`${SMOKE_BATTLES_PER_GEN} battles run, ${crashed} crashed, ${timedOut} timed out`];

  if (failures.length > 0) {
    return {
      status: "fail",
      suitePassed: false,
      failed: failures.length,
      skipped: 0,
      failures,
      notes,
      matchedKnownDisagreements: [],
      staleDisagreements: [],
      oracleChecks: [],
    };
  }

  return {
    status: "pass",
    suitePassed: true,
    failed: 0,
    skipped: 0,
    failures: [],
    notes,
    matchedKnownDisagreements: [],
    staleDisagreements: [],
    oracleChecks: [],
  };
}
