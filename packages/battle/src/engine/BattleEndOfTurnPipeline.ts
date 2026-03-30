import type { DataManager, PrimaryStatus, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { BATTLE_EVENT_TYPES, BATTLE_SOURCE_IDS } from "../constants/reference-ids";
import type { AbilityResult, EndOfTurnEffect, ItemResult } from "../context";
import type { BattleEvent } from "../events";
import type { GenerationRuleset } from "../ruleset";
import type { ActivePokemon, BattleState } from "../state";
import { getPokemonName } from "../utils";

export interface BattleEndOfTurnPipelineHost {
  readonly state: BattleState;
  readonly ruleset: GenerationRuleset;
  readonly dataManager: DataManager;
  emit(event: BattleEvent): void;
  processWeatherDamage(): void;
  processWeatherCountdown(): void;
  processTerrainCountdown(): void;
  processStatusDamage(): void;
  processScreenCountdown(): void;
  processTailwindCountdown(): void;
  processTrickRoomCountdown(): void;
  processHeldItemEndOfTurn(): void;
  processLeechSeed(): void;
  processPerishSong(): void;
  processCurse(): void;
  processNightmare(): void;
  processBindDamage(): void;
  processSaltCureEoT(): void;
  processDefrost(): void;
  processSafeguardCountdown(): void;
  processMysteryBerry(): void;
  processStatBoostingItems(): void;
  processHealingItems(): void;
  processEncoreCountdown(): void;
  getOpponentActive(side: 0 | 1): ActivePokemon | null;
  processAbilityResult(
    result: AbilityResult,
    pokemon: ActivePokemon,
    opponent: ActivePokemon,
    sideParam: 0 | 1,
  ): void;
  processItemResult(result: ItemResult, pokemon: ActivePokemon, sideParam: 0 | 1): void;
  checkMidTurnFaints(moveSource?: { attackerSide: 0 | 1 }): void;
  applyPrimaryStatus(
    target: ActivePokemon,
    status: PrimaryStatus,
    side: 0 | 1,
    sleepTurnsOverride?: number,
  ): void;
}

function processOnTurnEndAbilities(
  host: BattleEndOfTurnPipelineHost,
  abilityEndOfTurnFired: Set<string>,
): void {
  for (const side of host.state.sides) {
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) continue;

    const pokeKey = `${side.index}-0`;
    if (abilityEndOfTurnFired.has(pokeKey)) continue;
    abilityEndOfTurnFired.add(pokeKey);

    const opponent = host.getOpponentActive(side.index);
    const result = host.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onTurnEnd, {
      pokemon: active,
      opponent: opponent ?? undefined,
      state: host.state,
      rng: host.state.rng,
      trigger: CORE_ABILITY_TRIGGER_IDS.onTurnEnd,
    });
    if (result.activated) {
      host.processAbilityResult(result, active, opponent ?? active, side.index);
    }
  }
}

function processSpecificHeldItemEndOfTurn(host: BattleEndOfTurnPipelineHost, itemId: string): void {
  for (const side of host.state.sides) {
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) continue;
    if (active.pokemon.heldItem !== itemId) continue;

    const itemResult = host.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.endOfTurn, {
      pokemon: active,
      state: host.state,
      rng: host.state.rng,
    });
    if (itemResult.activated) {
      host.processItemResult(itemResult, active, side.index);
    }
  }
}

type CountdownFieldKey = "gravity" | "magicRoom" | "wonderRoom";

function forEachLivingActivePokemon(
  host: BattleEndOfTurnPipelineHost,
  callback: (active: ActivePokemon, sideIndex: 0 | 1) => void,
): void {
  for (const side of host.state.sides) {
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) continue;
    callback(active, side.index);
  }
}

function endVolatileStatus(
  host: BattleEndOfTurnPipelineHost,
  active: ActivePokemon,
  sideIndex: 0 | 1,
  volatile: VolatileStatus,
): void {
  active.volatileStatuses.delete(volatile);
  host.emit({
    type: BATTLE_EVENT_TYPES.volatileEnd,
    side: sideIndex,
    pokemon: getPokemonName(active),
    volatile,
  });
}

function processSimpleVolatileCountdown(
  host: BattleEndOfTurnPipelineHost,
  volatile: VolatileStatus,
  onExpire?: (active: ActivePokemon, sideIndex: 0 | 1) => void,
): void {
  forEachLivingActivePokemon(host, (active, sideIndex) => {
    const volatileState = active.volatileStatuses.get(volatile);
    if (!volatileState || volatileState.turnsLeft <= 0) return;

    volatileState.turnsLeft -= 1;
    if (volatileState.turnsLeft > 0) return;

    endVolatileStatus(host, active, sideIndex, volatile);
    onExpire?.(active, sideIndex);
  });
}

function processYawnCountdown(host: BattleEndOfTurnPipelineHost): void {
  forEachLivingActivePokemon(host, (active, sideIndex) => {
    const yawnState = active.volatileStatuses.get(CORE_VOLATILE_IDS.yawn);
    if (!yawnState) return;

    if (yawnState.turnsLeft > 0) {
      yawnState.turnsLeft -= 1;
    }
    if (yawnState.turnsLeft > 0) return;

    endVolatileStatus(host, active, sideIndex, CORE_VOLATILE_IDS.yawn);
    if (active.pokemon.status === null) {
      host.applyPrimaryStatus(active, CORE_STATUS_IDS.sleep, sideIndex);
    }
  });
}

function processFieldCountdown(
  host: BattleEndOfTurnPipelineHost,
  fieldKey: CountdownFieldKey,
  expirationMessage: string,
): void {
  const fieldState = host.state[fieldKey];
  if (!fieldState.active) return;

  fieldState.turnsLeft -= 1;
  if (fieldState.turnsLeft > 0) return;

  fieldState.active = false;
  host.emit({ type: BATTLE_EVENT_TYPES.message, text: expirationMessage });
}

/**
 * Shared end-of-turn pipeline extracted from BattleEngine.
 *
 * This module owns the residual-effect dispatch order and the repeated
 * on-turn-end ability / held-item routing so BattleEngine can stay focused on
 * the individual mechanics helpers.
 */
export function processEndOfTurnPipeline(host: BattleEndOfTurnPipelineHost): void {
  const effectOrder: readonly EndOfTurnEffect[] = host.ruleset.getEndOfTurnOrder();
  const abilityEndOfTurnFired = new Set<string>();

  for (const effect of effectOrder) {
    switch (effect) {
      case CORE_END_OF_TURN_EFFECT_IDS.weatherDamage:
        host.processWeatherDamage();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown:
        host.processWeatherCountdown();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.terrainCountdown:
        host.processTerrainCountdown();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.statusDamage:
        host.processStatusDamage();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.screenCountdown:
        host.processScreenCountdown();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.tailwindCountdown:
        host.processTailwindCountdown();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.trickRoomCountdown:
        host.processTrickRoomCountdown();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.leftovers:
        host.processHeldItemEndOfTurn();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.leechSeed:
        host.processLeechSeed();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.perishSong:
        host.processPerishSong();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.curse:
        host.processCurse();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.nightmare:
        host.processNightmare();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.bind:
        host.processBindDamage();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.saltCure:
        host.processSaltCureEoT();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.defrost:
        host.processDefrost();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.safeguardCountdown:
        host.processSafeguardCountdown();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.mysteryBerry:
        host.processMysteryBerry();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.statBoostingItems:
        host.processStatBoostingItems();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.healingItems:
        host.processHealingItems();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown:
        host.processEncoreCountdown();
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.weatherHealing:
      case CORE_ABILITY_IDS.shedSkin:
      case CORE_ABILITY_IDS.poisonHeal:
      case CORE_ABILITY_IDS.badDreams:
      case CORE_ABILITY_IDS.speedBoost:
      case CORE_ABILITY_IDS.moody:
      case CORE_ABILITY_IDS.harvest:
      case CORE_ABILITY_IDS.pickup:
        processOnTurnEndAbilities(host, abilityEndOfTurnFired);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.slowStartCountdown:
        // Slow Start: decrement turnsLeft on the slow-start volatile each EoT.
        // No ability check: the volatile should tick down even if the ability was
        // temporarily changed (e.g., by Skill Swap). The stat-halving in damage/speed
        // calcs already requires both the ability AND the volatile to be present.
        // Source: Pokemon Showdown Gen 4 mod — Slow Start countdown ticks volatile
        // When turnsLeft reaches 0, remove the volatile so the Attack/Speed halving stops.
        // Source: Pokemon Showdown Gen 4 mod — Slow Start countdown
        // Source: Bulbapedia — Slow Start: halves Attack and Speed for 5 turns
        processSimpleVolatileCountdown(host, CORE_VOLATILE_IDS.slowStart, (active) => {
          const pokeName = active.pokemon.nickname ?? String(active.pokemon.speciesId);
          host.emit({
            type: BATTLE_EVENT_TYPES.message,
            text: `${pokeName}'s Slow Start wore off!`,
          });
        });
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.toxicOrbActivation:
        processSpecificHeldItemEndOfTurn(host, CORE_ITEM_IDS.toxicOrb);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.flameOrbActivation:
        processSpecificHeldItemEndOfTurn(host, CORE_ITEM_IDS.flameOrb);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.blackSludge:
        if (!host.ruleset.hasHeldItems()) break;
        processSpecificHeldItemEndOfTurn(host, CORE_ITEM_IDS.blackSludge);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.aquaRing:
        for (const side of host.state.sides) {
          const active = side.active[0];
          if (!active || active.pokemon.currentHp <= 0) continue;
          if (!active.volatileStatuses.has(BATTLE_SOURCE_IDS.aquaRing)) continue;
          const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
          const healAmount = Math.max(1, Math.floor(maxHp / 16));
          const oldHp = active.pokemon.currentHp;
          active.pokemon.currentHp = Math.min(maxHp, oldHp + healAmount);
          const healed = active.pokemon.currentHp - oldHp;
          if (healed > 0) {
            host.emit({
              type: BATTLE_EVENT_TYPES.heal,
              side: side.index,
              pokemon: getPokemonName(active),
              amount: healed,
              currentHp: active.pokemon.currentHp,
              maxHp,
              source: BATTLE_SOURCE_IDS.aquaRing,
            });
          }
        }
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.ingrain:
        // Source: Bulbapedia — Ingrain heals 1/16 max HP per turn
        for (const side of host.state.sides) {
          const active = side.active[0];
          if (!active || active.pokemon.currentHp <= 0) continue;
          if (!active.volatileStatuses.has(BATTLE_SOURCE_IDS.ingrain)) continue;
          const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
          const healAmount = Math.max(1, Math.floor(maxHp / 16));
          const oldHp = active.pokemon.currentHp;
          active.pokemon.currentHp = Math.min(maxHp, oldHp + healAmount);
          const healed = active.pokemon.currentHp - oldHp;
          if (healed > 0) {
            host.emit({
              type: BATTLE_EVENT_TYPES.heal,
              side: side.index,
              pokemon: getPokemonName(active),
              amount: healed,
              currentHp: active.pokemon.currentHp,
              maxHp,
              source: BATTLE_SOURCE_IDS.ingrain,
            });
          }
        }
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.wish:
        for (const side of host.state.sides) {
          if (!side.wish?.active) continue;
          side.wish.turnsLeft--;
          if (side.wish.turnsLeft <= 0) {
            const active = side.active[0];
            if (active && active.pokemon.currentHp > 0) {
              const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
              const healAmount = Math.min(side.wish.healAmount, maxHp - active.pokemon.currentHp);
              if (healAmount > 0) {
                active.pokemon.currentHp += healAmount;
                host.emit({
                  type: BATTLE_EVENT_TYPES.heal,
                  side: side.index,
                  pokemon: getPokemonName(active),
                  amount: healAmount,
                  currentHp: active.pokemon.currentHp,
                  maxHp,
                  source: BATTLE_SOURCE_IDS.wish,
                });
              }
            }
            side.wish = null;
          }
        }
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.futureAttack:
        for (const side of host.state.sides) {
          if (!side.futureAttack) continue;
          side.futureAttack.turnsLeft--;
          if (side.futureAttack.turnsLeft <= 0) {
            const active = side.active[0];
            if (active && active.pokemon.currentHp > 0) {
              let futureDamage = side.futureAttack.damage;

              // Protocol: Gen 2-4 rulesets store pre-calculated damage at use time (non-zero).
              // Gen 5+ rulesets signal hit-time recalculation by returning true from
              // recalculatesFutureAttackDamage(), OR by storing 0 as a sentinel.
              // Source: Bulbapedia — "From Generation V onwards, damage is calculated when
              //   Future Sight or Doom Desire hits, not when it is used."
              // Source: Showdown sim/battle-actions.ts — Gen 5+ recalculates future attack damage
              if (futureDamage === 0 || host.ruleset.recalculatesFutureAttackDamage?.()) {
                const sourceSideState = host.state.sides[side.futureAttack.sourceSide];
                const sourceActive = sourceSideState.active[0];
                if (sourceActive && sourceActive.pokemon.currentHp > 0) {
                  try {
                    const moveData = host.dataManager.getMove(side.futureAttack.moveId);
                    const result = host.ruleset.calculateDamage({
                      attacker: sourceActive,
                      defender: active,
                      move: moveData,
                      state: host.state,
                      rng: host.state.rng,
                      isCrit: false,
                    });
                    futureDamage = result.damage;
                  } catch {
                    host.emit({
                      type: BATTLE_EVENT_TYPES.engineWarning,
                      message:
                        `Future attack move "${side.futureAttack.moveId}" data missing while resolving. ` +
                        "Using stored fallback damage.",
                    });
                  }
                }
              }

              const clampedDamage = Math.min(futureDamage, active.pokemon.currentHp);
              active.pokemon.currentHp -= clampedDamage;
              const maxHp =
                active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp + clampedDamage;
              host.emit({
                type: BATTLE_EVENT_TYPES.damage,
                side: side.index,
                pokemon: getPokemonName(active),
                amount: clampedDamage,
                currentHp: active.pokemon.currentHp,
                maxHp,
                source: side.futureAttack.moveId,
              });
            }
            side.futureAttack = null;
          }
        }
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.tauntCountdown:
        // Taunt volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — "Taunt lasts for 3 turns in Gen 4"
        processSimpleVolatileCountdown(host, CORE_VOLATILE_IDS.taunt);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.disableCountdown:
        // Disable volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — "Disable lasts for 4-7 turns in Gen 4"
        processSimpleVolatileCountdown(host, CORE_VOLATILE_IDS.disable);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.gravityCountdown:
        // Gravity field countdown — deactivate when turnsLeft reaches 0
        // Source: Showdown Gen 4 mod — Gravity lasts 5 turns
        processFieldCountdown(host, "gravity", "Gravity returned to normal!");
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.magicRoomCountdown:
        // Magic Room field countdown — deactivate when turnsLeft reaches 0
        // Source: Showdown magicroom condition — duration: 5
        processFieldCountdown(host, "magicRoom", "The area returned to normal!");
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.wonderRoomCountdown:
        // Wonder Room field countdown — deactivate when turnsLeft reaches 0
        // Source: Showdown wonderroom condition — duration: 5
        processFieldCountdown(
          host,
          "wonderRoom",
          "Wonder Room wore off, and Defense and Sp. Def stats returned to normal!",
        );
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.yawnCountdown:
        // Yawn volatile countdown — inflict sleep when turnsLeft reaches 0
        // Source: Bulbapedia — Yawn: "causes drowsiness; the target falls asleep at
        //   the end of the next turn"
        // Source: Showdown Gen 4 mod — Yawn sets a 1-turn drowsy volatile
        processYawnCountdown(host);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.healBlockCountdown:
        // Heal Block volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — Heal Block prevents HP recovery for 5 turns
        // Source: Showdown Gen 4 mod — Heal Block lasts 5 turns
        processSimpleVolatileCountdown(host, CORE_VOLATILE_IDS.healBlock);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.embargoCountdown:
        // Embargo volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — Embargo prevents use of held items for 5 turns
        // Source: Showdown Gen 4 mod — Embargo lasts 5 turns
        processSimpleVolatileCountdown(host, CORE_VOLATILE_IDS.embargo);
        break;
      case CORE_END_OF_TURN_EFFECT_IDS.magnetRiseCountdown:
        // Magnet Rise volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — Magnet Rise: "The user levitates for five turns."
        // Source: Showdown Gen 4 mod — Magnet Rise lasts 5 turns
        processSimpleVolatileCountdown(host, CORE_VOLATILE_IDS.magnetRise);
        break;
      case CORE_VOLATILE_IDS.uproar: {
        // Source: pret/pokeemerald -- Uproar: countdown duration, wake sleeping Pokemon
        // Source: Bulbapedia — Uproar prevents sleep while the user is in uproar
        // Note: "uproar" is added to VolatileStatus in core/entities/status.ts
        //
        // Bug #494 fix: first decrement all uproar counters, THEN check if any Pokemon
        // still has the uproar volatile. Only wake sleepers if uproar is still active.
        // Previously, the wake check ran inside the same loop as the decrement, so
        // sleepers were woken even when the uproar expired on that turn.
        const uproarVolatile = CORE_VOLATILE_IDS.uproar;

        // Step 1: Decrement uproar counters for all active Pokemon
        for (const side of host.state.sides) {
          const active = side.active[0];
          if (!active || active.pokemon.currentHp <= 0) continue;

          const uproarData = active.volatileStatuses.get(uproarVolatile);
          if (uproarData) {
            if (uproarData.turnsLeft !== undefined && uproarData.turnsLeft > 0) {
              uproarData.turnsLeft--;
              if (uproarData.turnsLeft === 0) {
                active.volatileStatuses.delete(uproarVolatile);
                host.emit({
                  type: BATTLE_EVENT_TYPES.volatileEnd,
                  side: side.index,
                  pokemon: getPokemonName(active),
                  volatile: uproarVolatile,
                });
                host.emit({
                  type: BATTLE_EVENT_TYPES.message,
                  text: `${getPokemonName(active)}'s uproar ended!`,
                });
              }
            }
          }
        }

        // Step 2: Check if ANY active Pokemon on either side still has the uproar volatile
        const anyUproarActive = host.state.sides.some((side) => {
          const active = side.active[0];
          return (
            active && active.pokemon.currentHp > 0 && active.volatileStatuses.has(uproarVolatile)
          );
        });

        // Step 3: Only wake sleeping Pokemon if uproar is still ongoing
        if (anyUproarActive) {
          for (const side of host.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            if (active.pokemon.status === CORE_STATUS_IDS.sleep) {
              // Soundproof blocks Uproar wake-up (Uproar is a sound-based move/effect)
              // Source: Bulbapedia — Soundproof protects from sound-based effects including Uproar
              // Source: Showdown sim/battle-actions.ts — Soundproof immunity to Uproar
              if (host.ruleset.hasAbilities() && active.ability === CORE_ABILITY_IDS.soundproof) {
                continue;
              }
              active.pokemon.status = null;
              host.emit({
                type: BATTLE_EVENT_TYPES.statusCure,
                side: side.index,
                pokemon: getPokemonName(active),
                status: CORE_STATUS_IDS.sleep,
              });
              host.emit({
                type: BATTLE_EVENT_TYPES.message,
                text: `${getPokemonName(active)} woke up due to the uproar!`,
              });
            }
          }
        }
        break;
      }
      case CORE_END_OF_TURN_EFFECT_IDS.grassyTerrainHeal: {
        // Gen 6+ terrain: heals grounded Pokemon for 1/16 max HP at EoT.
        // Source: Showdown sim/field.ts — Grassy Terrain heals at residual phase
        if (host.state.terrain?.type === CORE_TERRAIN_IDS.grassy) {
          const terrainResults = host.ruleset.applyTerrainEffects(host.state);
          for (const result of terrainResults) {
            const active = host.state.sides[result.side].active[0];
            if (active && active.pokemon.currentHp > 0) {
              const healAmount = result.healAmount ?? 0;
              if (healAmount > 0) {
                const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
                const healed = Math.min(healAmount, maxHp - active.pokemon.currentHp);
                if (healed > 0) {
                  active.pokemon.currentHp += healed;
                  host.emit({
                    type: BATTLE_EVENT_TYPES.heal,
                    side: result.side,
                    pokemon: result.pokemon,
                    amount: healed,
                    currentHp: active.pokemon.currentHp,
                    maxHp,
                    source: BATTLE_SOURCE_IDS.grassyTerrain,
                  });
                }
              }
              if (result.message) {
                host.emit({ type: BATTLE_EVENT_TYPES.message, text: result.message });
              }
            }
          }
        }
        break;
      }
      default:
        // Remaining effects not yet implemented
        break;
    }

    host.checkMidTurnFaints();
    if (host.state.ended) return;
  }

  for (const side of host.state.sides) {
    for (const active of side.active) {
      if (active) active.turnsOnField++;
    }
  }
}
