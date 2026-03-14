import type { SeededRandom } from "@pokemon-lib/core";
import type { BattleAction } from "../events";
import type { GenerationRuleset } from "../ruleset";
import type { BattleState } from "../state";
import type { AIController } from "./AIController";

/**
 * Random AI — picks a random valid move. Deterministic with seeded RNG.
 * Tier 1: no strategy, just random valid actions.
 */
export class RandomAI implements AIController {
  chooseAction(
    side: 0 | 1,
    state: Readonly<BattleState>,
    _ruleset: GenerationRuleset,
    rng: SeededRandom,
  ): BattleAction {
    const sideState = state.sides[side];
    const active = sideState.active[0];

    if (!active) {
      // Shouldn't happen — fall back to struggle
      return { type: "struggle", side };
    }

    // Get available moves (those with PP remaining)
    const availableMoves = active.pokemon.moves
      .map((slot, index) => ({ slot, index }))
      .filter((m) => m.slot.currentPP > 0);

    if (availableMoves.length === 0) {
      return { type: "struggle", side };
    }

    // Randomly pick a move
    const choice = rng.pick(availableMoves);
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
