import type { DataManager, PrimaryStatus, VolatileStatus } from "@pokemon-lib-ts/core";
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
    const result = host.ruleset.applyAbility("on-turn-end", {
      pokemon: active,
      opponent: opponent ?? undefined,
      state: host.state,
      rng: host.state.rng,
      trigger: "on-turn-end",
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

    const itemResult = host.ruleset.applyHeldItem("end-of-turn", {
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
    type: "volatile-end",
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
    const yawnState = active.volatileStatuses.get("yawn");
    if (!yawnState) return;

    if (yawnState.turnsLeft > 0) {
      yawnState.turnsLeft -= 1;
    }
    if (yawnState.turnsLeft > 0) return;

    endVolatileStatus(host, active, sideIndex, "yawn");
    if (active.pokemon.status === null) {
      host.applyPrimaryStatus(active, "sleep", sideIndex);
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
  host.emit({ type: "message", text: expirationMessage });
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
      case "weather-damage":
        host.processWeatherDamage();
        break;
      case "weather-countdown":
        host.processWeatherCountdown();
        break;
      case "terrain-countdown":
        host.processTerrainCountdown();
        break;
      case "status-damage":
        host.processStatusDamage();
        break;
      case "screen-countdown":
        host.processScreenCountdown();
        break;
      case "tailwind-countdown":
        host.processTailwindCountdown();
        break;
      case "trick-room-countdown":
        host.processTrickRoomCountdown();
        break;
      case "leftovers":
        host.processHeldItemEndOfTurn();
        break;
      case "leech-seed":
        host.processLeechSeed();
        break;
      case "perish-song":
        host.processPerishSong();
        break;
      case "curse":
        host.processCurse();
        break;
      case "nightmare":
        host.processNightmare();
        break;
      case "bind":
        host.processBindDamage();
        break;
      case "salt-cure":
        host.processSaltCureEoT();
        break;
      case "defrost":
        host.processDefrost();
        break;
      case "safeguard-countdown":
        host.processSafeguardCountdown();
        break;
      case "mystery-berry":
        host.processMysteryBerry();
        break;
      case "stat-boosting-items":
        host.processStatBoostingItems();
        break;
      case "healing-items":
        host.processHealingItems();
        break;
      case "encore-countdown":
        host.processEncoreCountdown();
        break;
      case "weather-healing":
      case "shed-skin":
      case "poison-heal":
      case "bad-dreams":
      case "speed-boost":
      case "moody":
      case "harvest":
      case "pickup":
        processOnTurnEndAbilities(host, abilityEndOfTurnFired);
        break;
      case "slow-start-countdown":
        // Slow Start: decrement turnsLeft on the slow-start volatile each EoT.
        // No ability check: the volatile should tick down even if the ability was
        // temporarily changed (e.g., by Skill Swap). The stat-halving in damage/speed
        // calcs already requires both the ability AND the volatile to be present.
        // Source: Pokemon Showdown Gen 4 mod — Slow Start countdown ticks volatile
        // When turnsLeft reaches 0, remove the volatile so the Attack/Speed halving stops.
        // Source: Pokemon Showdown Gen 4 mod — Slow Start countdown
        // Source: Bulbapedia — Slow Start: halves Attack and Speed for 5 turns
        processSimpleVolatileCountdown(host, "slow-start", (active) => {
          const pokeName = active.pokemon.nickname ?? String(active.pokemon.speciesId);
          host.emit({
            type: "message",
            text: `${pokeName}'s Slow Start wore off!`,
          });
        });
        break;
      case "toxic-orb-activation":
        processSpecificHeldItemEndOfTurn(host, "toxic-orb");
        break;
      case "flame-orb-activation":
        processSpecificHeldItemEndOfTurn(host, "flame-orb");
        break;
      case "black-sludge":
        if (!host.ruleset.hasHeldItems()) break;
        processSpecificHeldItemEndOfTurn(host, "black-sludge");
        break;
      case "aqua-ring":
        for (const side of host.state.sides) {
          const active = side.active[0];
          if (!active || active.pokemon.currentHp <= 0) continue;
          if (!active.volatileStatuses.has("aqua-ring")) continue;
          const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
          const healAmount = Math.max(1, Math.floor(maxHp / 16));
          const oldHp = active.pokemon.currentHp;
          active.pokemon.currentHp = Math.min(maxHp, oldHp + healAmount);
          const healed = active.pokemon.currentHp - oldHp;
          if (healed > 0) {
            host.emit({
              type: "heal",
              side: side.index,
              pokemon: getPokemonName(active),
              amount: healed,
              currentHp: active.pokemon.currentHp,
              maxHp,
              source: "aqua-ring",
            });
          }
        }
        break;
      case "ingrain":
        // Source: Bulbapedia — Ingrain heals 1/16 max HP per turn
        for (const side of host.state.sides) {
          const active = side.active[0];
          if (!active || active.pokemon.currentHp <= 0) continue;
          if (!active.volatileStatuses.has("ingrain")) continue;
          const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
          const healAmount = Math.max(1, Math.floor(maxHp / 16));
          const oldHp = active.pokemon.currentHp;
          active.pokemon.currentHp = Math.min(maxHp, oldHp + healAmount);
          const healed = active.pokemon.currentHp - oldHp;
          if (healed > 0) {
            host.emit({
              type: "heal",
              side: side.index,
              pokemon: getPokemonName(active),
              amount: healed,
              currentHp: active.pokemon.currentHp,
              maxHp,
              source: "ingrain",
            });
          }
        }
        break;
      case "wish":
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
                  type: "heal",
                  side: side.index,
                  pokemon: getPokemonName(active),
                  amount: healAmount,
                  currentHp: active.pokemon.currentHp,
                  maxHp,
                  source: "wish",
                });
              }
            }
            side.wish = null;
          }
        }
        break;
      case "future-attack":
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
                      type: "engine-warning",
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
                type: "damage",
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
      case "taunt-countdown":
        // Taunt volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — "Taunt lasts for 3 turns in Gen 4"
        processSimpleVolatileCountdown(host, "taunt");
        break;
      case "disable-countdown":
        // Disable volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — "Disable lasts for 4-7 turns in Gen 4"
        processSimpleVolatileCountdown(host, "disable");
        break;
      case "gravity-countdown":
        // Gravity field countdown — deactivate when turnsLeft reaches 0
        // Source: Showdown Gen 4 mod — Gravity lasts 5 turns
        processFieldCountdown(host, "gravity", "Gravity returned to normal!");
        break;
      case "magic-room-countdown":
        // Magic Room field countdown — deactivate when turnsLeft reaches 0
        // Source: Showdown magicroom condition — duration: 5
        processFieldCountdown(host, "magicRoom", "The area returned to normal!");
        break;
      case "wonder-room-countdown":
        // Wonder Room field countdown — deactivate when turnsLeft reaches 0
        // Source: Showdown wonderroom condition — duration: 5
        processFieldCountdown(
          host,
          "wonderRoom",
          "Wonder Room wore off, and Defense and Sp. Def stats returned to normal!",
        );
        break;
      case "yawn-countdown":
        // Yawn volatile countdown — inflict sleep when turnsLeft reaches 0
        // Source: Bulbapedia — Yawn: "causes drowsiness; the target falls asleep at
        //   the end of the next turn"
        // Source: Showdown Gen 4 mod — Yawn sets a 1-turn drowsy volatile
        processYawnCountdown(host);
        break;
      case "heal-block-countdown":
        // Heal Block volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — Heal Block prevents HP recovery for 5 turns
        // Source: Showdown Gen 4 mod — Heal Block lasts 5 turns
        processSimpleVolatileCountdown(host, "heal-block");
        break;
      case "embargo-countdown":
        // Embargo volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — Embargo prevents use of held items for 5 turns
        // Source: Showdown Gen 4 mod — Embargo lasts 5 turns
        processSimpleVolatileCountdown(host, "embargo");
        break;
      case "magnet-rise-countdown":
        // Magnet Rise volatile countdown — remove when turnsLeft reaches 0
        // Source: Bulbapedia — Magnet Rise: "The user levitates for five turns."
        // Source: Showdown Gen 4 mod — Magnet Rise lasts 5 turns
        processSimpleVolatileCountdown(host, "magnet-rise");
        break;
      case "uproar": {
        // Source: pret/pokeemerald -- Uproar: countdown duration, wake sleeping Pokemon
        // Source: Bulbapedia — Uproar prevents sleep while the user is in uproar
        // Note: "uproar" is added to VolatileStatus in core/entities/status.ts
        //
        // Bug #494 fix: first decrement all uproar counters, THEN check if any Pokemon
        // still has the uproar volatile. Only wake sleepers if uproar is still active.
        // Previously, the wake check ran inside the same loop as the decrement, so
        // sleepers were woken even when the uproar expired on that turn.
        const uproarVolatile = "uproar" as import("@pokemon-lib-ts/core").VolatileStatus;

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
                  type: "volatile-end",
                  side: side.index,
                  pokemon: getPokemonName(active),
                  volatile: uproarVolatile,
                });
                host.emit({
                  type: "message",
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
            if (active.pokemon.status === "sleep") {
              // Soundproof blocks Uproar wake-up (Uproar is a sound-based move/effect)
              // Source: Bulbapedia — Soundproof protects from sound-based effects including Uproar
              // Source: Showdown sim/battle-actions.ts — Soundproof immunity to Uproar
              if (host.ruleset.hasAbilities() && active.ability === "soundproof") {
                continue;
              }
              active.pokemon.status = null;
              host.emit({
                type: "status-cure",
                side: side.index,
                pokemon: getPokemonName(active),
                status: "sleep",
              });
              host.emit({
                type: "message",
                text: `${getPokemonName(active)} woke up due to the uproar!`,
              });
            }
          }
        }
        break;
      }
      case "grassy-terrain-heal": {
        // Gen 6+ terrain: heals grounded Pokemon for 1/16 max HP at EoT.
        // Source: Showdown sim/field.ts — Grassy Terrain heals at residual phase
        if (host.state.terrain?.type === "grassy") {
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
                    type: "heal",
                    side: result.side,
                    pokemon: result.pokemon,
                    amount: healed,
                    currentHp: active.pokemon.currentHp,
                    maxHp,
                    source: "grassy-terrain",
                  });
                }
              }
              if (result.message) {
                host.emit({ type: "message", text: result.message });
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
