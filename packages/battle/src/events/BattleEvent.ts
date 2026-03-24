import type {
  BattleStat,
  EntryHazardType,
  Gender,
  Generation,
  PokemonType,
  PrimaryStatus,
  ScreenType,
  TerrainType,
  VolatileStatus,
  WeatherType,
} from "@pokemon-lib-ts/core";
import type { BattleFormat } from "../state";

/**
 * Discriminated union of all events emitted by the BattleEngine during a battle.
 *
 * Consumers subscribe via `BattleEngine.on()` or read the full log via `getEventLog()`.
 * Each event has a unique `type` string literal that narrows the union:
 *
 * - `battle-start` — emitted once when `BattleEngine.start()` is called
 * - `turn-start` — emitted at the beginning of each turn
 * - `switch-in` — a Pokémon enters the field (lead send-out, voluntary switch, or post-faint)
 * - `switch-out` — a Pokémon is withdrawn from the field
 * - `move-start` — a Pokémon begins executing a move
 * - `move-miss` — a move fails the accuracy check
 * - `move-fail` — a move fails for a non-accuracy reason (e.g., immune target, no valid target)
 * - `damage` — HP is removed from a Pokémon
 * - `heal` — HP is restored to a Pokémon
 * - `faint` — a Pokémon's HP reaches 0
 * - `effectiveness` — type-effectiveness multiplier for the last damage event
 * - `critical-hit` — the last damage event was a critical hit
 * - `status-inflict` — a primary status condition is applied
 * - `status-cure` — a primary status condition is removed
 * - `volatile-start` — a volatile (in-battle-only) status begins
 * - `volatile-end` — a volatile status ends
 * - `stat-change` — a stat stage changes (e.g., Growl, Swords Dance)
 * - `weather-set` — weather is set or overwritten
 * - `weather-end` — weather expires naturally
 * - `terrain-set` — terrain is set or overwritten (Gen 6+)
 * - `terrain-end` — terrain expires naturally
 * - `ability-activate` — an ability triggers (e.g., Intimidate, Speed Boost)
 * - `item-activate` — a held item activates (e.g., berry, orb)
 * - `item-consumed` — a held item is permanently used up
 * - `hazard-set` — an entry hazard layer is added to a side
 * - `hazard-clear` — entry hazards are removed from a side (Rapid Spin, Defog)
 * - `screen-set` — a protective screen (Reflect, Light Screen) is set on a side
 * - `screen-end` — a screen expires or is broken
 * - `mega-evolve` — a Pokémon mega evolves (Gen 6+)
 * - `dynamax` — a Pokémon dynamaxes (Gen 8)
 * - `dynamax-end` — a Pokémon reverts from Dynamax
 * - `terastallize` — a Pokémon terastallizes (Gen 9)
 * - `z-move` — a Z-Move is used (Gen 7)
 * - `catch-attempt` — a Poké Ball is thrown in a wild battle
 * - `exp-gain` — a Pokémon gains experience points
 * - `level-up` — a Pokémon's level increases
 * - `flee-attempt` — a flee attempt was made in a wild battle
 * - `message` — a freeform text message (fallback for unstructured events)
 * - `battle-end` — the battle has concluded
 */
export type BattleEvent =
  | BattleStartEvent
  | TurnStartEvent
  | SwitchInEvent
  | SwitchOutEvent
  | MoveStartEvent
  | MoveMissEvent
  | MoveFailEvent
  | DamageEvent
  | HealEvent
  | FaintEvent
  | EffectivenessEvent
  | CriticalHitEvent
  | StatusInflictEvent
  | StatusCureEvent
  | VolatileStartEvent
  | VolatileEndEvent
  | StatChangeEvent
  | WeatherSetEvent
  | WeatherEndEvent
  | TerrainSetEvent
  | TerrainEndEvent
  | AbilityActivateEvent
  | ItemActivateEvent
  | ItemConsumedEvent
  | HazardSetEvent
  | HazardClearEvent
  | ScreenSetEvent
  | ScreenEndEvent
  | MegaEvolveEvent
  | DynamaxEvent
  | DynamaxEndEvent
  | TerastallizeEvent
  | ZMoveEvent
  | CatchAttemptEvent
  | ExpGainEvent
  | LevelUpEvent
  | FleeAttemptEvent
  | MessageEvent
  | EngineWarningEvent
  | BattleEndEvent;

/**
 * Emitted once when `BattleEngine.start()` is called.
 * This is always the first event in the log.
 */
export interface BattleStartEvent {
  /** Discriminant: always `"battle-start"` */
  readonly type: "battle-start";
  /** The battle format; BattleEngine currently emits `"singles"` only */
  readonly format: BattleFormat;
  /** The game generation (1–9) governing all mechanics */
  readonly generation: Generation;
}

/**
 * Emitted at the beginning of each turn, before any actions are resolved.
 */
export interface TurnStartEvent {
  /** Discriminant: always `"turn-start"` */
  readonly type: "turn-start";
  /** 1-based turn counter */
  readonly turnNumber: number;
}

/**
 * Emitted when a Pokémon enters the field — either as a lead at battle start,
 * a voluntary switch, or a replacement after a faint.
 */
export interface SwitchInEvent {
  /** Discriminant: always `"switch-in"` */
  readonly type: "switch-in";
  /** Which side the Pokémon belongs to (0 = player/side-A, 1 = opponent/side-B) */
  readonly side: 0 | 1;
  /** Snapshot of the Pokémon's public state at the moment it enters */
  readonly pokemon: PokemonSnapshot;
  /** Active slot index on the side (always 0 in current singles-only support) */
  readonly slot: number;
}

/**
 * Emitted when a Pokémon is withdrawn from the field by a voluntary switch or
 * phazing. Fainting emits a separate `faint` event instead of `switch-out`.
 */
export interface SwitchOutEvent {
  /** Discriminant: always `"switch-out"` */
  readonly type: "switch-out";
  /** Which side the Pokémon belongs to */
  readonly side: 0 | 1;
  /** Snapshot of the Pokémon's public state at the moment it leaves */
  readonly pokemon: PokemonSnapshot;
}

/**
 * Emitted when a Pokémon begins executing a move. Follows `turn-start` for each
 * acting Pokémon in priority order. May be followed by `move-miss` or `move-fail`
 * if the move does not execute successfully.
 */
export interface MoveStartEvent {
  /** Discriminant: always `"move-start"` */
  readonly type: "move-start";
  /** Which side the acting Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the acting Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** Move ID string (e.g., `"tackle"`, `"fire-blast"`) */
  readonly move: string;
}

/**
 * Emitted when a move fails the accuracy check and does not hit its target.
 */
export interface MoveMissEvent {
  /** Discriminant: always `"move-miss"` */
  readonly type: "move-miss";
  /** Which side the acting Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the acting Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** Move ID string */
  readonly move: string;
}

/**
 * Emitted when a move fails for a non-accuracy reason, such as a type immunity,
 * a missing target, or a condition that prevents execution (e.g., Protect, Powder + Fire).
 */
export interface MoveFailEvent {
  /** Discriminant: always `"move-fail"` */
  readonly type: "move-fail";
  /** Which side the acting Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the acting Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** Move ID string */
  readonly move: string;
  /** Human-readable explanation for why the move failed */
  readonly reason: string;
}

/**
 * Emitted whenever HP is removed from a Pokémon. Covers move damage, recoil,
 * burn/poison damage, weather damage, leech seed drain, etc.
 * If the hit was a critical hit, a `critical-hit` event precedes this one.
 * The type effectiveness is communicated via a preceding `effectiveness` event.
 */
export interface DamageEvent {
  /** Discriminant: always `"damage"` */
  readonly type: "damage";
  /** Which side the damaged Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the damaged Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** HP removed (always a positive integer) */
  readonly amount: number;
  /** HP remaining after the damage is applied */
  readonly currentHp: number;
  /** Maximum HP of the damaged Pokémon (for health bar rendering) */
  readonly maxHp: number;
  /** What caused the damage (move ID, `"burn"`, `"sandstorm"`, `"recoil"`, etc.) */
  readonly source: string;
}

/**
 * Emitted whenever HP is restored to a Pokémon. Covers healing moves (Recover, Roost),
 * held items (Leftovers), Aqua Ring, Ingrain, Wish, etc.
 */
export interface HealEvent {
  /** Discriminant: always `"heal"` */
  readonly type: "heal";
  /** Which side the healed Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the healed Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** HP restored (always a positive integer) */
  readonly amount: number;
  /** HP after healing is applied */
  readonly currentHp: number;
  /** Maximum HP of the Pokémon */
  readonly maxHp: number;
  /** What caused the healing (move ID, `"leftovers"`, `"aqua-ring"`, etc.) */
  readonly source: string;
}

/**
 * Emitted when a Pokémon's HP reaches 0. Follows a `damage` event.
 * After this event the battle enters `faint-check` phase.
 */
export interface FaintEvent {
  /** Discriminant: always `"faint"` */
  readonly type: "faint";
  /** Which side the fainted Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the fainted Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
}

/**
 * Emitted immediately before a `damage` event to communicate the type-effectiveness
 * multiplier of the move that dealt the damage.
 * Only emitted for damage from moves (not passive damage like burn).
 */
export interface EffectivenessEvent {
  /** Discriminant: always `"effectiveness"` */
  readonly type: "effectiveness";
  /**
   * Type-effectiveness multiplier. One of: `0` (immune), `0.25`, `0.5`, `1`, `2`, `4`.
   * Values outside `{1}` are shown as "not very effective", "super effective", etc.
   */
  readonly multiplier: number;
}

/**
 * Emitted immediately before a `damage` event to indicate the hit was a critical hit.
 * Consumers should display the "Critical hit!" message when this event appears.
 */
export interface CriticalHitEvent {
  /** Discriminant: always `"critical-hit"` */
  readonly type: "critical-hit";
}

/**
 * Emitted when a primary (non-volatile) status condition is applied to a Pokémon.
 * Primary statuses persist through switches: `burn`, `freeze`, `paralysis`, `poison`,
 * `badly-poisoned`, and `sleep`.
 */
export interface StatusInflictEvent {
  /** Discriminant: always `"status-inflict"` */
  readonly type: "status-inflict";
  /** Which side the affected Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the affected Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** The status condition that was applied */
  readonly status: PrimaryStatus;
}

/**
 * Emitted when a primary status condition is removed from a Pokémon.
 * Causes include: Aromatherapy, Heal Bell, using a status-curing item,
 * waking up from sleep, or thawing from freeze.
 */
export interface StatusCureEvent {
  /** Discriminant: always `"status-cure"` */
  readonly type: "status-cure";
  /** Which side the cured Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the cured Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** The status condition that was removed */
  readonly status: PrimaryStatus;
}

/**
 * Emitted when a volatile (in-battle-only) status begins on a Pokémon.
 * Volatile statuses are cleared when the Pokémon switches out.
 * Examples: confusion, flinch, Encore, Taunt, Leech Seed, Substitute.
 */
export interface VolatileStartEvent {
  /** Discriminant: always `"volatile-start"` */
  readonly type: "volatile-start";
  /** Which side the affected Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the affected Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** The volatile status that was applied */
  readonly volatile: VolatileStatus;
}

/**
 * Emitted when a volatile status ends on a Pokémon — either because its
 * duration expired, it was manually removed (Haze), or the Pokémon switched out.
 */
export interface VolatileEndEvent {
  /** Discriminant: always `"volatile-end"` */
  readonly type: "volatile-end";
  /** Which side the affected Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the affected Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** The volatile status that ended */
  readonly volatile: VolatileStatus;
}

/**
 * Emitted when a Pokémon's stat stage changes. Stat stages range from −6 to +6.
 * Positive stages come from moves like Swords Dance or Nasty Plot.
 * Negative stages come from moves like Growl, Intimidate, etc.
 */
export interface StatChangeEvent {
  /** Discriminant: always `"stat-change"` */
  readonly type: "stat-change";
  /** Which side the affected Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the affected Pokémon (nickname if present, otherwise a fallback species label) */
  readonly pokemon: string;
  /** Which stat changed */
  readonly stat: BattleStat;
  /** Number of stages added (positive = boost, negative = drop) */
  readonly stages: number;
  /** The stat's stage value after the change (clamped to −6..+6) */
  readonly currentStage: number;
}

/**
 * Emitted when weather is set or overwritten. The weather immediately takes
 * effect on the following turn's damage calculations and end-of-turn effects.
 */
export interface WeatherSetEvent {
  /** Discriminant: always `"weather-set"` */
  readonly type: "weather-set";
  /** The new weather condition (e.g., `"rain"`, `"sun"`, `"sandstorm"`, `"hail"`) */
  readonly weather: WeatherType;
  /** Move or ability that set the weather (e.g., `"rain-dance"`, `"drizzle"`) */
  readonly source: string;
}

/**
 * Emitted when weather expires at the end of its duration counter.
 */
export interface WeatherEndEvent {
  /** Discriminant: always `"weather-end"` */
  readonly type: "weather-end";
  /** The weather condition that expired */
  readonly weather: WeatherType;
}

/**
 * Emitted when terrain is set or overwritten (Gen 6+).
 * Terrain affects move power, status immunity, and priority.
 */
export interface TerrainSetEvent {
  /** Discriminant: always `"terrain-set"` */
  readonly type: "terrain-set";
  /** The new terrain (e.g., `"electric"`, `"grassy"`, `"misty"`, `"psychic"`) */
  readonly terrain: TerrainType;
  /** Move or ability that set the terrain */
  readonly source: string;
}

/**
 * Emitted when terrain expires at the end of its duration counter (Gen 6+).
 */
export interface TerrainEndEvent {
  /** Discriminant: always `"terrain-end"` */
  readonly type: "terrain-end";
  /** The terrain that expired */
  readonly terrain: TerrainType;
}

/**
 * Emitted when an ability activates mid-battle (e.g., Intimidate on switch-in,
 * Speed Boost at end of turn, Rough Skin when struck).
 */
export interface AbilityActivateEvent {
  /** Discriminant: always `"ability-activate"` */
  readonly type: "ability-activate";
  /** Which side the Pokémon with the ability belongs to */
  readonly side: 0 | 1;
  /** Display name of the Pokémon whose ability activated */
  readonly pokemon: string;
  /** Ability ID string (e.g., `"intimidate"`, `"speed-boost"`) */
  readonly ability: string;
}

/**
 * Emitted when a held item activates but is not consumed (e.g., Choice Band,
 * type-boosting items, Assault Vest). For items that are used up, see `ItemConsumedEvent`.
 */
export interface ItemActivateEvent {
  /** Discriminant: always `"item-activate"` */
  readonly type: "item-activate";
  /** Which side the Pokémon holding the item belongs to */
  readonly side: 0 | 1;
  /** Display name of the Pokémon holding the item */
  readonly pokemon: string;
  /** Item ID string (e.g., `"choice-band"`, `"leftovers"`) */
  readonly item: string;
}

/**
 * Emitted when a held item is permanently used up during battle (e.g., berries,
 * Air Balloon popping, White Herb). The item slot becomes empty after this event.
 */
export interface ItemConsumedEvent {
  /** Discriminant: always `"item-consumed"` */
  readonly type: "item-consumed";
  /** Which side the Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the Pokémon that consumed the item */
  readonly pokemon: string;
  /** Item ID string that was consumed (e.g., `"sitrus-berry"`, `"focus-sash"`) */
  readonly item: string;
}

/**
 * Emitted when an entry hazard layer is added to a side of the field.
 * Entry hazards trigger when the opposing side switches a Pokémon in.
 */
export interface HazardSetEvent {
  /** Discriminant: always `"hazard-set"` */
  readonly type: "hazard-set";
  /** Which side the hazard was placed on */
  readonly side: 0 | 1;
  /** The hazard type (e.g., `"spikes"`, `"stealth-rock"`, `"toxic-spikes"`) */
  readonly hazard: EntryHazardType;
  /** Current total layer count for stackable hazards (Spikes: 1–3, Toxic Spikes: 1–2) */
  readonly layers?: number;
}

/**
 * Emitted when all layers of an entry hazard are removed from a side
 * (e.g., by Rapid Spin, Defog, or Magic Bounce).
 */
export interface HazardClearEvent {
  /** Discriminant: always `"hazard-clear"` */
  readonly type: "hazard-clear";
  /** Which side had the hazard removed */
  readonly side: 0 | 1;
  /** The hazard type that was cleared */
  readonly hazard: EntryHazardType;
}

/**
 * Emitted when a protective screen (Reflect or Light Screen) is set on a side.
 * Screens halve physical or special damage respectively for their duration.
 */
export interface ScreenSetEvent {
  /** Discriminant: always `"screen-set"` */
  readonly type: "screen-set";
  /** Which side the screen was set on */
  readonly side: 0 | 1;
  /** The screen type (`"reflect"` or `"light-screen"`) */
  readonly screen: ScreenType;
  /** Number of turns the screen will last (typically 5, or 8 with Light Clay) */
  readonly turns: number;
}

/**
 * Emitted when a protective screen expires or is removed by Brick Break / Defog.
 */
export interface ScreenEndEvent {
  /** Discriminant: always `"screen-end"` */
  readonly type: "screen-end";
  /** Which side the screen was on */
  readonly side: 0 | 1;
  /** The screen type that ended */
  readonly screen: ScreenType;
}

/**
 * Emitted when a Pokémon mega evolves mid-battle (Gen 6+).
 * Mega Evolution changes the Pokémon's form, base stats, and possibly its ability and type.
 * Only one mega evolution per trainer per battle.
 */
export interface MegaEvolveEvent {
  /** Discriminant: always `"mega-evolve"` */
  readonly type: "mega-evolve";
  /** Which side the Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the Pokémon that mega evolved */
  readonly pokemon: string;
  /** The mega form name (e.g., `"mega-charizard-x"`) */
  readonly form: string;
}

/**
 * Emitted when a Pokémon dynamaxes (Gen 8).
 * While dynamaxed, the Pokémon uses Max Moves and has doubled HP for 3 turns.
 */
export interface DynamaxEvent {
  /** Discriminant: always `"dynamax"` */
  readonly type: "dynamax";
  /** Which side the Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the Pokémon that dynamaxed */
  readonly pokemon: string;
}

/**
 * Emitted when a Pokémon reverts from Dynamax after 3 turns (Gen 8).
 */
export interface DynamaxEndEvent {
  /** Discriminant: always `"dynamax-end"` */
  readonly type: "dynamax-end";
  /** Which side the Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the Pokémon that reverted from Dynamax */
  readonly pokemon: string;
}

/**
 * Emitted when a Pokémon terastallizes (Gen 9).
 * Terastallization changes the Pokémon's type to its Tera Type and applies a STAB bonus.
 * Only one terastallization per trainer per battle.
 */
export interface TerastallizeEvent {
  /** Discriminant: always `"terastallize"` */
  readonly type: "terastallize";
  /** Which side the Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the Pokémon that terastallized */
  readonly pokemon: string;
  /** The type the Pokémon changed to via Terastallization */
  readonly teraType: PokemonType;
}

/**
 * Emitted when a Z-Move is used (Gen 7).
 * Z-Moves consume the held Z-Crystal and deal boosted damage or trigger special effects.
 * Only one Z-Move per trainer per battle.
 */
export interface ZMoveEvent {
  /** Discriminant: always `"z-move"` */
  readonly type: "z-move";
  /** Which side the acting Pokémon belongs to */
  readonly side: 0 | 1;
  /** Display name of the acting Pokémon */
  readonly pokemon: string;
  /** Z-Move name (e.g., `"gigavolt-havoc"`) */
  readonly move: string;
}

/**
 * Emitted when a Poké Ball is thrown at a wild Pokémon.
 * The `shakes` field indicates how many times the ball shook (0–3)
 * before either catching or breaking free. A `caught: true` result
 * transitions the battle to `battle-end`.
 */
export interface CatchAttemptEvent {
  /** Discriminant: always `"catch-attempt"` */
  readonly type: "catch-attempt";
  /** Ball item ID used (e.g., `"poke-ball"`, `"ultra-ball"`) */
  readonly ball: string;
  /** Display name of the wild Pokémon targeted */
  readonly pokemon: string;
  /** Number of ball shakes (0–3) before the outcome was decided */
  readonly shakes: number;
  /** Whether the Pokémon was successfully caught */
  readonly caught: boolean;
}

/**
 * Emitted when a Pokémon gains experience points after a battle action
 * (typically after an opposing Pokémon faints).
 */
export interface ExpGainEvent {
  /** Discriminant: always `"exp-gain"` */
  readonly type: "exp-gain";
  /** Which side the Pokémon belongs to */
  readonly side: 0 | 1;
  /** Unique identifier of the Pokémon gaining EXP */
  readonly pokemon: string;
  /** Number of experience points gained */
  readonly amount: number;
}

/**
 * Emitted when a Pokémon's level increases after accumulating enough EXP.
 * May be preceded by an `exp-gain` event.
 */
export interface LevelUpEvent {
  /** Discriminant: always `"level-up"` */
  readonly type: "level-up";
  /** Which side the Pokémon belongs to */
  readonly side: 0 | 1;
  /** Unique identifier of the Pokémon that leveled up */
  readonly pokemon: string;
  /** The new level reached (2–100) */
  readonly newLevel: number;
}

/**
 * Emitted when a side attempts to flee from a wild battle.
 * Success depends on the Speed ratio between the two active Pokemon
 * and the number of prior flee attempts.
 *
 * Source: Bulbapedia -- Escape (Generation III+ formula)
 */
export interface FleeAttemptEvent {
  /** Discriminant: always `"flee-attempt"` */
  readonly type: "flee-attempt";
  /** Which side attempted to flee (only side 0 in wild battles) */
  readonly side: 0 | 1;
  /** Whether the flee attempt succeeded */
  readonly success: boolean;
}

/**
 * Emitted for freeform text messages that do not map to a more specific event type.
 * Useful for engine-generated messages ("But it failed!", "It doesn't affect...")
 * that are not covered by the structured event types.
 */
export interface MessageEvent {
  /** Discriminant: always `"message"` */
  readonly type: "message";
  /** The text to display to the player */
  readonly text: string;
}

/**
 * Emitted when the engine encounters a recoverable data error.
 * Signals a missing move or species that does not halt the battle but should be investigated.
 */
export interface EngineWarningEvent {
  /** Discriminant: always `"engine-warning"` */
  readonly type: "engine-warning";
  /** Human-readable description of the warning */
  readonly message: string;
}

/**
 * Emitted when the battle concludes. This is always the last event in the log.
 * After this event, the engine transitions to `battle-end` phase.
 */
export interface BattleEndEvent {
  /** Discriminant: always `"battle-end"` */
  readonly type: "battle-end";
  /**
   * The winning side (0 or 1), or `null` if the battle ended in a draw
   * (e.g., both sides' last Pokémon fainted simultaneously, or both fled).
   */
  readonly winner: 0 | 1 | null;
}

/**
 * A read-only snapshot of a Pokémon's public-facing state at a specific moment in battle.
 * Used in switch events so consumers can render the switch animation with correct info.
 */
export interface PokemonSnapshot {
  /** National Pokédex number */
  readonly speciesId: number;
  /** Display name override, or `null` if using the default species name */
  readonly nickname: string | null;
  /** Current level (1–100) */
  readonly level: number;
  /** HP remaining at the time of the snapshot */
  readonly currentHp: number;
  /** Maximum HP at the time of the snapshot */
  readonly maxHp: number;
  /** Active primary status condition, or `null` if healthy */
  readonly status: PrimaryStatus | null;
  /** Pokémon's gender (for display and some move interactions) */
  readonly gender: Gender;
  /** Whether the Pokémon has the shiny palette */
  readonly isShiny: boolean;
}

/** A callback function that receives a single BattleEvent when it is emitted. */
export type BattleEventListener = (event: BattleEvent) => void;

/**
 * Interface for objects that emit BattleEvents. Implemented by BattleEngine.
 * Consumers use `on`/`off` for real-time updates and `getEventLog` for replay snapshots.
 */
export interface BattleEventEmitter {
  on(listener: BattleEventListener): void;
  off(listener: BattleEventListener): void;
  /** Returns a snapshot copy of the event log, not a live view. */
  getEventLog(): readonly BattleEvent[];
}
