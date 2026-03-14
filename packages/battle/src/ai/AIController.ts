import type { SeededRandom } from "@pokemon-lib/core";
import type { BattleAction } from "../events";
import type { GenerationRuleset } from "../ruleset";
import type { BattleState } from "../state";

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
  ): BattleAction;

  /** Choose a switch-in after a faint */
  chooseSwitchIn(
    side: 0 | 1,
    state: Readonly<BattleState>,
    ruleset: GenerationRuleset,
    rng: SeededRandom,
  ): number;
}
