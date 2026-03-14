export type BattleAction =
  | MoveAction
  | SwitchAction
  | ItemAction
  | RunAction
  | RechargeAction
  | StruggleAction;

export interface MoveAction {
  readonly type: "move";
  readonly side: 0 | 1;
  readonly moveIndex: number;
  readonly targetSide?: 0 | 1;
  readonly targetSlot?: number;
  readonly mega?: boolean;
  readonly zMove?: boolean;
  readonly dynamax?: boolean;
  readonly terastallize?: boolean;
}

export interface SwitchAction {
  readonly type: "switch";
  readonly side: 0 | 1;
  readonly switchTo: number;
}

export interface ItemAction {
  readonly type: "item";
  readonly side: 0 | 1;
  readonly itemId: string;
  readonly target?: number;
}

export interface RunAction {
  readonly type: "run";
  readonly side: 0 | 1;
}

export interface RechargeAction {
  readonly type: "recharge";
  readonly side: 0 | 1;
}

export interface StruggleAction {
  readonly type: "struggle";
  readonly side: 0 | 1;
}
