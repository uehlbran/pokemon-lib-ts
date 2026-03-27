import type { SeededRandom } from "@pokemon-lib-ts/core";
import type { AvailableMove } from "../context/types";
import type { BattleAction } from "../events/BattleAction";
import type { GenerationRuleset } from "../ruleset/GenerationRuleset";
import type { BattleState } from "../state/BattleState";

/**
 * Interface for AI controllers that choose actions and switch-ins.
 */
export interface AIController {
  /** Choose an action for the given battle state */
  chooseAction(
    side: 0 | 1,
    state: Readonly<BattleState>,
    ruleset: GenerationRuleset,
    rng: SeededRandom,
    availableMoves: readonly AvailableMove[],
  ): BattleAction;

  /** Choose a switch-in after a faint */
  chooseSwitchIn(
    side: 0 | 1,
    state: Readonly<BattleState>,
    ruleset: GenerationRuleset,
    rng: SeededRandom,
  ): number | null;
}
