/**
 * Discriminated union of all actions a side can submit during `action-select` phase.
 *
 * Actions are submitted via `BattleEngine.submitAction()`. Once both sides have
 * submitted, the engine resolves them in priority order. The action types are:
 *
 * - `move` — use a move from the active Pokémon's moveset; supports gimmicks (mega, Z, dynamax, tera)
 * - `switch` — voluntarily switch the active Pokémon for another in the team
 * - `item` — use a bag item on a Pokémon when the ruleset permits bag items
 * - `run` — attempt to flee (wild battles only; side 0 only)
 * - `recharge` — skip-turn action for a forced recharge turn (e.g., after Hyper Beam)
 * - `struggle` — fallback action when no moves have PP remaining
 */
export type BattleAction =
  | MoveAction
  | SwitchAction
  | ItemAction
  | RunAction
  | RechargeAction
  | StruggleAction;

/**
 * Action submitted when a side chooses to use one of the active Pokémon's moves.
 * Optional boolean flags activate gimmicks that are valid for one use per battle.
 */
export interface MoveAction {
  /** Discriminant: always `"move"` */
  readonly type: "move";
  /** Which side is submitting this action */
  readonly side: 0 | 1;
  /** Index into the active Pokémon's move array (0–3) */
  readonly moveIndex: number;
  /** Reserved for future multi-active support; BattleEngine currently rejects this field */
  readonly targetSide?: 0 | 1;
  /** Reserved for future multi-active support; BattleEngine currently rejects this field */
  readonly targetSlot?: number;
  /** `true` to mega evolve this turn (Gen 6+); only valid once per battle */
  readonly mega?: boolean;
  /** `true` to use the Z-Move version of this move (Gen 7); only valid once per battle */
  readonly zMove?: boolean;
  /** `true` to dynamax this turn (Gen 8); only valid once per battle */
  readonly dynamax?: boolean;
  /** `true` to terastallize this turn (Gen 9); only valid once per battle */
  readonly terastallize?: boolean;
}

/**
 * Action submitted when a side voluntarily switches the active Pokémon for a
 * team member. Not valid while trapped (e.g., Mean Look, Shadow Tag).
 */
export interface SwitchAction {
  /** Discriminant: always `"switch"` */
  readonly type: "switch";
  /** Which side is submitting this action */
  readonly side: 0 | 1;
  /** Index within the side's `team` array of the Pokémon to switch in (0-based) */
  readonly switchTo: number;
}

/**
 * Action submitted when a side uses a bag item on a Pokémon during battle.
 * Availability depends on the current ruleset's `canUseBagItems()` result.
 */
export interface ItemAction {
  /** Discriminant: always `"item"` */
  readonly type: "item";
  /** Which side is submitting this action */
  readonly side: 0 | 1;
  /** Item ID string (e.g., `"potion"`, `"full-restore"`, `"max-revive"`) */
  readonly itemId: string;
  /** Index within the side's `team` array of the Pokémon to use the item on */
  readonly target?: number;
}

/**
 * Action submitted when side 0 attempts to flee from a wild battle.
 * Flee success depends on the Speed ratio between the two active Pokémon.
 * Not valid in trainer battles.
 */
export interface RunAction {
  /** Discriminant: always `"run"` */
  readonly type: "run";
  /** Which side is fleeing; only side 0 (player) may flee in wild battles */
  readonly side: 0 | 1;
}

/**
 * Action representing a forced recharge turn after a move like Hyper Beam or
 * Giga Impact. The engine often injects this automatically after replacing a
 * submitted action, but it remains part of the public action union.
 */
export interface RechargeAction {
  /** Discriminant: always `"recharge"` */
  readonly type: "recharge";
  /** Which side's Pokémon is recharging */
  readonly side: 0 | 1;
}

/**
 * Action representing Struggle when a side has no PP left across its moves.
 * Higher-level controllers may submit this directly; for example, `RandomAI`
 * returns `struggle` when no moves are usable.
 */
export interface StruggleAction {
  /** Discriminant: always `"struggle"` */
  readonly type: "struggle";
  /** Which side's Pokémon is struggling */
  readonly side: 0 | 1;
}

/**
 * Returns whether an action occupies the side's normal combat slot in turn order.
 *
 * This groups standard move submissions with move-like queued actions that still
 * resolve in the move-vs-move ordering lane, such as forced recharge turns and
 * Struggle fallback turns.
 */
export function isMoveLikeAction(
  action: BattleAction,
): action is MoveAction | RechargeAction | StruggleAction {
  return action.type === "move" || action.type === "recharge" || action.type === "struggle";
}
