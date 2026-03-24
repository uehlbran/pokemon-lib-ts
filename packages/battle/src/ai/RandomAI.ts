import type { SeededRandom } from "@pokemon-lib-ts/core";
import type { AvailableMove } from "../context";
import type { BattleAction } from "../events";
import type { GenerationRuleset } from "../ruleset";
import type { BattleState } from "../state";
import type { AIController } from "./AIController";

/**
 * Random AI — picks a random move from the caller-provided legal move snapshot.
 * Deterministic with seeded RNG. Tier 1: no strategy, just random available actions.
 */
export class RandomAI implements AIController {
  chooseAction(
    side: 0 | 1,
    state: Readonly<BattleState>,
    _ruleset: GenerationRuleset,
    rng: SeededRandom,
    availableMoves: readonly AvailableMove[],
  ): BattleAction {
    const sideState = state.sides[side];
    const active = sideState.active[0];

    if (!active) {
      // Shouldn't happen — fall back to struggle
      return { type: "struggle", side };
    }

    const enabledMoves = availableMoves.filter((move) => !move.disabled);

    if (enabledMoves.length === 0) {
      return { type: "struggle", side };
    }

    // Randomly pick a legal move from the engine-provided availability snapshot.
    const choice = rng.pick(enabledMoves);
    return {
      type: "move",
      side,
      moveIndex: choice.index,
    };
  }

  chooseSwitchIn(
    side: 0 | 1,
    state: Readonly<BattleState>,
    _ruleset: GenerationRuleset,
    rng: SeededRandom,
  ): number {
    const sideState = state.sides[side];
    const active = sideState.active[0];
    const activeSlot = active?.teamSlot ?? -1;

    // Find valid switch targets: alive, not already active
    const validTargets = sideState.team
      .map((p, index) => ({ pokemon: p, index }))
      .filter((t) => t.pokemon.currentHp > 0 && t.index !== activeSlot);

    if (validTargets.length === 0) {
      // No valid targets — return first slot as fallback
      return 0;
    }

    return rng.pick(validTargets).index;
  }
}
