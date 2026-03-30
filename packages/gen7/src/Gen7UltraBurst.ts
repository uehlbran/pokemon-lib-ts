/**
 * Gen 7 Ultra Burst BattleGimmick implementation.
 *
 * Ultra Burst is a mechanic introduced in Pokémon Ultra Sun and Ultra Moon.
 * It allows Necrozma-Dusk-Mane or Necrozma-Dawn-Wings to transform into
 * Ultra Necrozma by consuming the Ultranecrozium Z held item.
 *
 * Key mechanics:
 *   - Only Necrozma-Dusk-Mane (10800) or Necrozma-Dawn-Wings (10801) can Ultra Burst
 *   - Must hold Ultranecrozium Z
 *   - Consumes the Z-Crystal, allowing the signature Z-Move (Light That Burns the Sky)
 *     to fire in the same turn — Ultra Burst and the Z-Move are simultaneous
 *   - Transforms to Ultra Necrozma: Psychic/Dragon, 167/97/167/97/129 non-HP stats
 *   - Ability changes to Neuroforce (1.25x on super-effective hits)
 *   - Once per side per battle
 *   - Unlike Mega Evolution, does not use side.gimmickUsed (Gen 7 tracks internally)
 *
 * Source: Bulbapedia "Ultra Burst" -- https://bulbapedia.bulbagarden.net/wiki/Ultra_Burst
 * Source: Pokémon Showdown data/moves.ts -- "light-that-burns-the-sky" base power 200
 * Source: Showdown sim/battle-actions.ts -- Ultra Burst uses Z-Crystal, zMoveUsed set
 */

import type {
  ActivePokemon,
  BattleEvent,
  BattleGimmick,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import { BATTLE_EVENT_TYPES } from "@pokemon-lib-ts/battle";
import {
  ALL_NATURES,
  CORE_NATURE_IDS,
  CORE_STAT_IDS,
  CORE_TYPE_IDS,
  calculateStat,
  getNatureModifier,
  type MoveData,
  type MutableStatBlock,
  type NatureData,
  type PokemonType,
} from "@pokemon-lib-ts/core";

import {
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_SPECIES_IDS,
} from "./data/reference-ids.js";
import type { Gen7ZMove } from "./Gen7ZMove.js";

/**
 * Species IDs that are eligible for Ultra Burst.
 * Only the two fused Necrozma forms can undergo Ultra Burst.
 *
 * Source: Bulbapedia "Ultra Burst" -- "Necrozma-Dusk-Mane and Necrozma-Dawn-Wings"
 */
const ULTRA_BURST_ELIGIBLE_SPECIES: ReadonlySet<number> = new Set([
  GEN7_SPECIES_IDS.necrozmaDuskMane,
  GEN7_SPECIES_IDS.necrozmaDawnWings,
]);

/**
 * Ultra Necrozma's base stats (non-HP stats, recalculated on transformation).
 * HP is NOT recalculated — only the non-HP stats change, matching Mega Evolution behavior.
 *
 * Source: Bulbapedia "Necrozma" -- Ultra Necrozma form stats
 * Source: Pokémon Showdown data/pokedex.ts -- "necrozmaultra" base stats
 */
const ULTRA_NECROZMA_BASE_STATS = {
  attack: 167,
  defense: 97,
  spAttack: 167,
  spDefense: 97,
  speed: 129,
} as const;

/**
 * Ultra Necrozma's types after transformation.
 * Source: Bulbapedia "Necrozma" -- Ultra Necrozma is Psychic/Dragon
 */
const ULTRA_NECROZMA_TYPES: readonly PokemonType[] = [CORE_TYPE_IDS.psychic, CORE_TYPE_IDS.dragon];

/**
 * The base move required to use Light That Burns the Sky via Ultranecrozium Z.
 * Source: Showdown data/items.ts -- ultranecroziumz: zMoveFrom "photon-geyser"
 */
const ULTRA_BURST_BASE_MOVE = GEN7_MOVE_IDS.photonGeyser;

/**
 * The signature Z-Move that fires when Ultra Necrozma uses Photon Geyser + Ultranecrozium Z.
 * Source: Showdown data/items.ts -- ultranecroziumz: zMove "light-that-burns-the-sky"
 */
const LIGHT_THAT_BURNS_THE_SKY = "light-that-burns-the-sky";

/**
 * Light That Burns the Sky: 200 BP, Psychic-type, never misses.
 * Source: Showdown data/moves.ts -- "light-that-burns-the-sky" basePower 200
 * Source: Bulbapedia "Light That Burns the Sky" -- 200 BP, Psychic, ignores ability
 */
const LIGHT_THAT_BURNS_THE_SKY_POWER = 200;

/**
 * Gen 7 Ultra Burst BattleGimmick.
 *
 * Implements the BattleGimmick interface. Ultra Burst is tracked internally
 * via usedBySide (not side.gimmickUsed), because Gen 7 allows Mega Evolution,
 * Z-Moves, and Ultra Burst to coexist in the same battle on different Pokémon.
 *
 * When Ultra Burst activates, it also marks the Z-Move as used (via Gen7ZMove.markUsed),
 * because the Ultranecrozium Z is consumed by Ultra Burst. The engine then calls
 * the Z-Move gimmick's modifyMove() to convert Photon Geyser to
 * Light That Burns the Sky in the same turn.
 *
 * Source: Showdown sim/battle-actions.ts -- Ultra Burst handling
 * Source: Bulbapedia "Ultra Burst" -- fused forms, item requirement, stat changes
 */
export class Gen7UltraBurst implements BattleGimmick {
  readonly name = "Ultra Burst";
  readonly generations = [7] as const;

  /**
   * Tracks which sides have already used Ultra Burst this battle.
   * Source: Showdown sim/side.ts -- separate tracking for each gimmick type in Gen 7
   */
  private readonly usedBySide: Set<0 | 1> = new Set();

  /**
   * Reference to the Z-Move gimmick to mark it as used when Ultra Burst fires.
   * Ultra Burst consumes the Ultranecrozium Z, which also consumes the Z-Move slot.
   */
  private readonly zMove: Gen7ZMove;

  constructor(zMove: Gen7ZMove) {
    this.zMove = zMove;
  }

  /**
   * Returns true if the Ultra Burst gimmick can be activated for the given Pokémon.
   *
   * Conditions (all must be true):
   *   1. This side has not yet used Ultra Burst this battle
   *   2. The Pokémon is Necrozma-Dusk-Mane (10800) or Necrozma-Dawn-Wings (10801)
   *   3. The Pokémon holds Ultranecrozium Z
   *   4. The Z-Move has not been used yet (the Z-Crystal must be unspent)
   *   5. The Pokémon has not already Ultra Bursted (isUltraBurst guard)
   *
   * Source: Bulbapedia "Ultra Burst" -- eligibility requirements
   * Source: Showdown sim/battle-actions.ts -- canUltraBurst checks
   */
  canUse(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): boolean {
    if (this.usedBySide.has(side.index)) return false;
    if (pokemon.isUltraBurst) return false;
    if (!ULTRA_BURST_ELIGIBLE_SPECIES.has(pokemon.pokemon.speciesId)) return false;
    if (pokemon.pokemon.heldItem !== GEN7_ITEM_IDS.ultranecroziumZ) return false;
    // Ultra Burst is independent of the Z-Move quota. A teammate using a Z-Move
    // does NOT block Ultra Burst, and vice versa.
    // Source: Showdown sim/battle-actions.ts canUltraBurst() — only checks species + item,
    //   does NOT check side.zMoveUsed
    return true;
  }

  /**
   * Activates Ultra Burst for the given Pokémon.
   *
   * Steps:
   *   1. Transform types to Psychic/Dragon
   *   2. Recalculate non-HP stats using Ultra Necrozma base stats
   *   3. Change ability to Neuroforce
   *   4. Set isUltraBurst = true
   *   5. Mark the Z-Move as used (Ultranecrozium Z is consumed)
   *   6. Mark this side as having used Ultra Burst
   *   7. Emit the ultra-burst event
   *
   * Source: Bulbapedia "Ultra Burst" -- transformation details
   * Source: Showdown sim/battle-actions.ts -- activate Ultra Burst
   */
  activate(pokemon: ActivePokemon, side: BattleSide, _state: BattleState): BattleEvent[] {
    if (this.usedBySide.has(side.index) || pokemon.isUltraBurst) return [];
    if (!ULTRA_BURST_ELIGIBLE_SPECIES.has(pokemon.pokemon.speciesId)) return [];
    if (pokemon.pokemon.heldItem !== GEN7_ITEM_IDS.ultranecroziumZ) return [];

    // Transform types to Psychic/Dragon
    pokemon.types = [...ULTRA_NECROZMA_TYPES] as PokemonType[];

    // Recalculate non-HP stats using Ultra Necrozma base stats
    // HP is NOT recalculated (same pattern as Mega Evolution).
    // Source: Showdown sim/battle-actions.ts -- runUltraBurst recalculates non-HP stats
    if (pokemon.pokemon.calculatedStats) {
      const cs = pokemon.pokemon.calculatedStats as unknown as MutableStatBlock;
      const { level, ivs, evs, nature: natureId } = pokemon.pokemon;

      const foundNature = ALL_NATURES.find((n) => n.id === natureId);
      const natureData: NatureData = foundNature ?? {
        id: CORE_NATURE_IDS.hardy,
        displayName: "Hardy",
        increased: null,
        decreased: null,
        likedFlavor: null,
        dislikedFlavor: null,
      };

      cs.attack = calculateStat(
        ULTRA_NECROZMA_BASE_STATS.attack,
        ivs.attack,
        evs.attack,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.attack),
      );
      cs.defense = calculateStat(
        ULTRA_NECROZMA_BASE_STATS.defense,
        ivs.defense,
        evs.defense,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.defense),
      );
      cs.spAttack = calculateStat(
        ULTRA_NECROZMA_BASE_STATS.spAttack,
        ivs.spAttack,
        evs.spAttack,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.spAttack),
      );
      cs.spDefense = calculateStat(
        ULTRA_NECROZMA_BASE_STATS.spDefense,
        ivs.spDefense,
        evs.spDefense,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.spDefense),
      );
      cs.speed = calculateStat(
        ULTRA_NECROZMA_BASE_STATS.speed,
        ivs.speed,
        evs.speed,
        level,
        getNatureModifier(natureData, CORE_STAT_IDS.speed),
      );
    }

    // Change ability to Neuroforce
    pokemon.ability = GEN7_ABILITY_IDS.neuroforce;

    // Persist Ultra Burst form to PokemonInstance so it survives switching.
    // Same pattern as Gen6MegaEvolution storing megaTypes/megaAbility.
    // Source: Showdown sim/battle-actions.ts — formeChange is permanent
    pokemon.pokemon.ultraBurstTypes = [...ULTRA_NECROZMA_TYPES] as PokemonType[];
    pokemon.pokemon.ultraBurstAbility = GEN7_ABILITY_IDS.neuroforce;

    // Mark as Ultra Burst
    pokemon.isUltraBurst = true;

    // Mark this side as having used Ultra Burst
    this.usedBySide.add(side.index);

    const event: BattleEvent = {
      type: BATTLE_EVENT_TYPES.ultraBurst,
      side: side.index,
      pokemon: pokemon.pokemon.uid,
    };

    return [event];
  }

  /**
   * Converts Photon Geyser to Light That Burns the Sky when the Pokémon
   * has undergone Ultra Burst and holds Ultranecrozium Z.
   *
   * Light That Burns the Sky: 200 BP, Psychic-type, never misses, ignores
   * the target's ability (handled by Showdown's ignoreAbility flag).
   * The category (physical or special) is determined by comparing the
   * user's Attack vs Sp. Atk stat — whichever is higher is used.
   * Here we preserve the base move's category as the engine handles that.
   *
   * Source: Showdown data/moves.ts -- "light-that-burns-the-sky" entry
   * Source: Bulbapedia "Light That Burns the Sky" -- 200 BP, Psychic, ignores abilities
   */
  modifyMove(move: MoveData, pokemon: ActivePokemon): MoveData {
    if (!pokemon.isUltraBurst) return move;
    if (pokemon.pokemon.heldItem !== GEN7_ITEM_IDS.ultranecroziumZ) return move;
    if (move.id !== ULTRA_BURST_BASE_MOVE) return move;

    return {
      ...move,
      id: LIGHT_THAT_BURNS_THE_SKY,
      displayName: "Light That Burns the Sky",
      power: LIGHT_THAT_BURNS_THE_SKY_POWER,
      type: CORE_TYPE_IDS.psychic,
      accuracy: null,
      zMovePower: LIGHT_THAT_BURNS_THE_SKY_POWER,
    };
  }

  /**
   * Reset Ultra Burst tracking for a new battle.
   */
  reset(): void {
    this.usedBySide.clear();
  }

  serializeState(): { usedBySide: Array<0 | 1> } {
    return { usedBySide: [...this.usedBySide] };
  }

  restoreState(state: unknown): void {
    this.usedBySide.clear();
    if (!state || typeof state !== "object" || !("usedBySide" in state)) return;

    const usedBySide = (state as { usedBySide?: unknown }).usedBySide;
    if (!Array.isArray(usedBySide)) return;

    for (const sideIndex of usedBySide) {
      if (sideIndex === 0 || sideIndex === 1) {
        this.usedBySide.add(sideIndex);
      }
    }
  }

  /**
   * Check if a side has already used Ultra Burst.
   * Exposed for testing and external validation.
   */
  hasUsedUltraBurst(sideIndex: 0 | 1): boolean {
    return this.usedBySide.has(sideIndex);
  }
}
