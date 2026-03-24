import type { GenerationRuleset } from "@pokemon-lib-ts/battle";
import { BattleEngine, RandomAI } from "@pokemon-lib-ts/battle";
import type { DataManager } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { createGen1DataManager, Gen1Ruleset } from "@pokemon-lib-ts/gen1";
import { createGen2DataManager, Gen2Ruleset } from "@pokemon-lib-ts/gen2";
import { checkAllInvariants } from "./invariant-checker.js";
import { generateRandomTeam } from "./team-generator.js";
import type { BatchReport, BattleReport, BattleRunConfig, InvariantViolation } from "./types.js";

// Cache data managers to avoid reinitializing per battle
let _gen1DataManager: DataManager | null = null;
let _gen2DataManager: DataManager | null = null;

function getGen1DataManager(): DataManager {
  if (!_gen1DataManager) _gen1DataManager = createGen1DataManager();
  return _gen1DataManager;
}

function getGen2DataManager(): DataManager {
  if (!_gen2DataManager) _gen2DataManager = createGen2DataManager();
  return _gen2DataManager;
}

function createGenContext(generation: 1 | 2): {
  ruleset: GenerationRuleset;
  dataManager: DataManager;
} {
  if (generation === 1) {
    return { ruleset: new Gen1Ruleset(), dataManager: getGen1DataManager() };
  }
  return { ruleset: new Gen2Ruleset(), dataManager: getGen2DataManager() };
}

/**
 * Run a single AI-vs-AI battle and return a detailed report.
 */
export function runBattle(config: BattleRunConfig): BattleReport {
  const start = Date.now();
  const rng = new SeededRandom(config.seed);
  const { ruleset, dataManager } = createGenContext(config.generation);

  try {
    // Generate two random teams
    const team1 = generateRandomTeam(config.generation, dataManager, rng, {
      teamSize: config.teamSize,
    });
    const team2 = generateRandomTeam(
      config.generation,
      dataManager,
      new SeededRandom(config.seed + 500),
      {
        teamSize: config.teamSize,
      },
    );

    if (team1.length === 0 || team2.length === 0) {
      throw new Error(`Failed to generate teams: team1=${team1.length}, team2=${team2.length}`);
    }

    const engine = new BattleEngine(
      {
        generation: config.generation,
        format: "singles",
        teams: [team1, team2],
        seed: config.seed + 1000,
      },
      ruleset,
      dataManager,
    );

    const ai = new RandomAI();
    const aiRng = new SeededRandom(config.seed + 2000);

    engine.start();

    let turnCount = 0;
    while (!engine.isEnded() && turnCount < config.maxTurns) {
      const phase = engine.getPhase();

      if (phase === "action-select") {
        const state = engine.getState();
        const action0 = ai.chooseAction(0, state, ruleset, aiRng, engine.getAvailableMoves(0));
        const action1 = ai.chooseAction(1, state, ruleset, aiRng, engine.getAvailableMoves(1));
        engine.submitAction(0, action0);
        engine.submitAction(1, action1);
        turnCount++;
      } else if (phase === "switch-prompt") {
        for (const sideIdx of [0, 1] as const) {
          const active = engine.getActive(sideIdx);
          if (active && active.pokemon.currentHp <= 0) {
            const switchTarget = ai.chooseSwitchIn(sideIdx, engine.getState(), ruleset, aiRng);
            engine.submitSwitch(sideIdx, switchTarget);
          }
        }
      } else {
        // Unexpected phase — avoid infinite loop
        break;
      }
    }

    const timedOut = !engine.isEnded() && turnCount >= config.maxTurns;

    return {
      seed: config.seed,
      generation: config.generation,
      winner: engine.getWinner(),
      turnCount,
      events: engine.getEventLog(),
      timedOut,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      seed: config.seed,
      generation: config.generation,
      winner: null,
      turnCount: 0,
      events: [],
      timedOut: false,
      error: error instanceof Error ? error : new Error(String(error)),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Run a batch of battles from seed to seed+count-1, checking invariants on each.
 */
export function runBatch(
  config: BattleRunConfig,
  count: number,
  onProgress?: (i: number, report: BattleReport) => void,
): BatchReport {
  const start = Date.now();
  const allViolations: InvariantViolation[] = [];
  let completed = 0;
  let timedOut = 0;
  let crashed = 0;

  for (let i = 0; i < count; i++) {
    const battleConfig: BattleRunConfig = { ...config, seed: config.seed + i };
    const report = runBattle(battleConfig);

    if (report.error) {
      crashed++;
    } else if (report.timedOut) {
      timedOut++;
      completed++;
    } else {
      completed++;
    }

    if (!report.error) {
      const violations = checkAllInvariants(report.events, battleConfig);
      allViolations.push(...violations);
    }

    onProgress?.(i, report);
  }

  return {
    config,
    totalBattles: count,
    completed,
    timedOut,
    crashed,
    violations: allViolations,
    durationMs: Date.now() - start,
  };
}
