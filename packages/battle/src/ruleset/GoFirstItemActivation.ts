import type { BattleAction } from "../events";

const GO_FIRST_ITEM_ACTIVATED = Symbol("goFirstItemActivated");

type GoFirstPreparedAction = BattleAction & {
  [GO_FIRST_ITEM_ACTIVATED]?: true;
};

export function markGoFirstItemActivated(action: BattleAction): void {
  (action as GoFirstPreparedAction)[GO_FIRST_ITEM_ACTIVATED] = true;
}

export function hasGoFirstItemActivated(action: BattleAction): boolean {
  return (action as GoFirstPreparedAction)[GO_FIRST_ITEM_ACTIVATED] === true;
}
