import type { BattleStat, StatName } from "./stats";
import type { PrimaryStatus } from "./status";
import type { Generation, PokemonType } from "./types";
import type { TerrainType, WeatherType } from "./weather";

export type ItemCategory =
  | "pokeball"
  | "medicine"
  | "vitamin"
  | "held-item"
  | "battle-item"
  | "berry"
  | "tm"
  | "hm" // Gen 1-6
  | "tr" // Gen 8 (Technical Records)
  | "key-item"
  | "evolution-item"
  | "mail" // Gen 2-4
  | "gem" // Gen 5+
  | "z-crystal" // Gen 7
  | "mega-stone"; // Gen 6-7

export type BagPocket =
  | "items"
  | "medicine"
  | "pokeballs"
  | "tms"
  | "berries"
  | "key-items"
  | "battle-items"
  | "treasures"; // Sellable items

export interface ItemData {
  /** Lowercase identifier (e.g., "potion") */
  readonly id: string;

  /** Display name (e.g., "Potion") */
  readonly displayName: string;

  /** Description */
  readonly description: string;

  /** Item category */
  readonly category: ItemCategory;

  /** Bag pocket this item goes in */
  readonly pocket: BagPocket;

  /** Buy price in PokeDollars (sell = price / 2) */
  readonly price: number;

  /** Whether this item can be used in battle */
  readonly battleUsable: boolean;

  /** Whether this item can be used outside battle */
  readonly fieldUsable: boolean;

  /** Effect when used from the bag */
  readonly useEffect?: ItemUseEffect;

  /** Effect when held by a Pokemon */
  readonly holdEffect?: HoldEffect;

  /** Generation this item was introduced */
  readonly generation: Generation;

  /** Sprite/icon key */
  readonly spriteKey: string;

  /** Fling base power (Gen 4+, for Fling move) */
  readonly flingPower?: number;

  /** Fling effect (Gen 4+) */
  readonly flingEffect?: string;
}

/** Effect when an item is actively used */
export type ItemUseEffect =
  | { readonly type: "heal-hp"; readonly amount: number }
  | { readonly type: "heal-hp-fraction"; readonly fraction: number }
  | { readonly type: "heal-status"; readonly status: PrimaryStatus | "all" }
  | { readonly type: "heal-pp"; readonly amount: number | "all" }
  | { readonly type: "revive"; readonly hpFraction: number }
  | { readonly type: "boost-stat"; readonly stat: StatName; readonly evAmount: number }
  | { readonly type: "rare-candy" }
  | { readonly type: "evolution-trigger" }
  | {
      readonly type: "catch";
      readonly catchRateModifier: number;
      readonly bonusCondition?: string;
    }
  | { readonly type: "battle-boost"; readonly stat: BattleStat; readonly stages: number }
  | { readonly type: "custom"; readonly handler: string };

/** Effect when a Pokemon holds this item */
export type HoldEffect =
  | { readonly type: "stat-boost"; readonly stat: StatName; readonly multiplier: number }
  | { readonly type: "type-boost"; readonly moveType: PokemonType; readonly multiplier: number }
  | { readonly type: "choice-lock"; readonly stat: StatName; readonly multiplier: number }
  | {
      readonly type: "life-orb";
      readonly damageMultiplier: number;
      readonly recoilFraction: number;
    }
  | { readonly type: "leftovers"; readonly healFraction: number }
  | { readonly type: "berry"; readonly trigger: string; readonly effect: string }
  | { readonly type: "focus-sash" }
  | { readonly type: "eviolite" }
  | { readonly type: "assault-vest" }
  | { readonly type: "weather-extend"; readonly weather: WeatherType }
  | { readonly type: "terrain-extend"; readonly terrain: TerrainType }
  | { readonly type: "mega-stone"; readonly species: number; readonly form: string }
  | { readonly type: "z-crystal"; readonly moveType: PokemonType }
  | { readonly type: "custom"; readonly handler: string };
