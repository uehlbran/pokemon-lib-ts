/**
 * Discriminated union of all actions a side can submit during `ACTION_SELECT` phase.
 *
 * Actions are submitted via `BattleEngine.submitAction()`. Once both sides have
 * submitted, the engine resolves them in priority order. The action types are:
 *
 * - `move` — use a move from the active Pokémon's moveset; supports gimmicks (mega, Z, dynamax, tera)
 * - `switch` — voluntarily switch the active Pokémon for another in the team
 * - `item` — use a bag item on a Pokémon (trainer battles, not wild)
 * - `run` — attempt to flee (wild battles only; side 0 only)
 * - `recharge` — engine-generated action for moves that require a recharge turn (e.g., Hyper Beam)
 * - `struggle` — engine-generated action when all moves are out of PP
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
  /** Target side for multi-target scenarios (doubles/triples); omit for singles */
  readonly targetSide?: 0 | 1;
  /** Target slot within the target side (doubles/triples); omit for singles */
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
 * Only valid in trainer battles where item use is permitted.
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
 * Engine-generated action that forces a Pokémon to skip its turn while recharging
 * after a two-turn move (e.g., Hyper Beam, Giga Impact).
 * Not submitted by consumers — the engine injects this automatically.
 */
export interface RechargeAction {
  /** Discriminant: always `"recharge"` */
  readonly type: "recharge";
  /** Which side's Pokémon is recharging */
  readonly side: 0 | 1;
}

/**
 * Engine-generated action that forces a Pokémon to use Struggle when it has no
 * remaining PP across all moves. Struggle deals typeless damage with 50% recoil.
 * Not submitted by consumers — the engine injects this automatically.
 */
export interface StruggleAction {
  /** Discriminant: always `"struggle"` */
  readonly type: "struggle";
  /** Which side's Pokémon is struggling */
  readonly side: 0 | 1;
}
