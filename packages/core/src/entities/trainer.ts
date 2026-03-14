import type { NatureId } from "./nature";
import type { StatBlock } from "./stats";

export interface TrainerData {
  /** Unique trainer identifier */
  readonly id: string;

  /** Display name */
  readonly displayName: string;

  /** Trainer class (e.g., "Bug Catcher", "Gym Leader") */
  readonly trainerClass: string;

  /** Team definition */
  readonly team: readonly TrainerPokemon[];

  /** AI tier (1 = random, 2 = type-aware, 3 = competitive) */
  readonly aiTier: 1 | 2 | 3;

  /** Money reward multiplier */
  readonly rewardMultiplier: number;

  /** Pre-battle dialog */
  readonly beforeBattleDialog: readonly string[];

  /** Post-defeat dialog */
  readonly defeatDialog: readonly string[];

  /** Post-victory dialog (player lost) */
  readonly victoryDialog: readonly string[];

  /** Sprite key */
  readonly spriteKey: string;

  /** Battle BGM override (null = use default) */
  readonly battleMusic?: string;

  /** Whether this is a rematchable trainer */
  readonly rematchable: boolean;
}

export interface TrainerPokemon {
  readonly speciesId: number;
  readonly level: number;
  readonly moves?: readonly string[]; // If undefined, use default level-up moveset
  readonly ability?: string; // If undefined, use first normal ability
  readonly heldItem?: string;
  readonly nature?: NatureId; // If undefined, random
  readonly ivs?: Partial<StatBlock>; // If undefined, defaults vary by AI tier
  readonly evs?: Partial<StatBlock>; // If undefined, 0
}
