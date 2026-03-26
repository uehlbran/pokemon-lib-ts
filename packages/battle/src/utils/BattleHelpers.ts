import type { BattleStat, Generation, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createMoveSlot,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import type { PokemonSnapshot } from "../events";
import type { ActivePokemon, BattleFormat, BattlePhase, BattleSide, BattleState } from "../state";

let testPokemonUidCounter = 0;

const DEFAULT_TEST_POKEMON_CURRENT_HP = 200;
const DEFAULT_TEST_POKEMON_FRIENDSHIP = createFriendship(70);
const DEFAULT_TEST_POKEMON_STATS = Object.freeze({
  hp: 200,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
});

/** Create a PokemonSnapshot from an ActivePokemon (public-facing info only) */
export function createPokemonSnapshot(active: ActivePokemon): PokemonSnapshot {
  return {
    speciesId: active.pokemon.speciesId,
    nickname: active.pokemon.nickname,
    level: active.pokemon.level,
    currentHp: active.pokemon.currentHp,
    maxHp: active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp,
    status: active.pokemon.status,
    gender: active.pokemon.gender,
    isShiny: active.pokemon.isShiny,
  };
}

/** Create default stat stages (all 0) */
export function createDefaultStatStages(): Record<BattleStat, number> {
  return {
    hp: 0,
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

/** Create an on-field battle wrapper from a PokemonInstance. */
export function createOnFieldPokemon(
  pokemon: PokemonInstance,
  teamSlot: number,
  baseTypes: PokemonType[],
): ActivePokemon {
  // If this Pokemon previously mega-evolved (megaTypes and megaAbility are set on the
  // PokemonInstance), restore them. Volatile state (stat stages, etc.) is reset as normal
  // on switch-in, but mega form identity persists because it is stored on the PokemonInstance.
  // Source: Gen 6 game mechanic — Mega Evolution is permanent for the rest of the battle.
  // Source: Showdown sim/battle.ts — formeChange is permanent; forme is restored on sendOut.
  const isMega = !!(pokemon.megaTypes && pokemon.megaAbility);
  const resolvedTypes =
    isMega && pokemon.megaTypes ? ([...pokemon.megaTypes] as PokemonType[]) : baseTypes;
  const resolvedAbility = isMega && pokemon.megaAbility ? pokemon.megaAbility : pokemon.ability;

  // If this Pokemon previously Terastallized (terastallized flag set on the PokemonInstance),
  // restore Tera state. Like Mega Evolution, Terastallization is permanent for the rest of
  // the battle and must persist through switches.
  // Source: Gen 9 game mechanic — Terastallization persists for the entire battle.
  // Source: Showdown sim/pokemon.ts — forme/tera state restored on sendOut.
  const isTerastallized = !!pokemon.terastallized;
  const teraType = isTerastallized ? (pokemon.teraType ?? null) : null;
  // Restore defensive typing for Tera'd Pokemon.
  // Gen9Terastallization.activate() stores resolved defensive types in teraTypes:
  //   - Non-Stellar: [teraType]  (single Tera type is the defensive type)
  //   - Stellar: originalTypes   (Stellar retains original defensive types)
  // Engine reads teraTypes directly — no gen-specific Stellar awareness needed here.
  // Source: Showdown sim/pokemon.ts -- defensive types restored on sendOut
  const teraResolvedTypes: PokemonType[] =
    isTerastallized && pokemon.teraTypes && pokemon.teraTypes.length > 0
      ? ([...pokemon.teraTypes] as PokemonType[])
      : resolvedTypes;

  return {
    pokemon,
    teamSlot,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...teraResolvedTypes],
    ability: resolvedAbility,
    suppressedAbility: null,
    itemKnockedOff: false,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized,
    teraType,
    stellarBoostedTypes: isTerastallized ? [...(pokemon.stellarBoostedTypes ?? [])] : [],
    forcedMove: null,
  };
}

/** Create a battle side fixture with explicit defaults. */
export function createBattleSide(options: {
  index: 0 | 1;
  active?: (ActivePokemon | null)[];
  team?: PokemonInstance[];
  hazards?: BattleSide["hazards"];
  screens?: BattleSide["screens"];
  tailwind?: BattleSide["tailwind"];
  luckyChant?: BattleSide["luckyChant"];
  wish?: BattleSide["wish"];
  futureAttack?: BattleSide["futureAttack"];
  faintCount?: number;
  gimmickUsed?: boolean;
  trainer?: BattleSide["trainer"];
}): BattleSide {
  return {
    index: options.index,
    trainer: options.trainer ?? null,
    team: [...(options.team ?? [])],
    active: [...(options.active ?? [])],
    hazards: [...(options.hazards ?? [])],
    screens: [...(options.screens ?? [])],
    tailwind: options.tailwind ?? { active: false, turnsLeft: 0 },
    luckyChant: options.luckyChant ?? { active: false, turnsLeft: 0 },
    wish: options.wish ?? null,
    futureAttack: options.futureAttack ?? null,
    faintCount: options.faintCount ?? 0,
    gimmickUsed: options.gimmickUsed ?? false,
  };
}

/** Create a battle state fixture with explicit defaults. */
export function createBattleState(options?: {
  phase?: BattlePhase;
  generation?: Generation;
  format?: BattleFormat;
  turnNumber?: number;
  sides?: [BattleSide, BattleSide];
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
  trickRoom?: BattleState["trickRoom"];
  magicRoom?: BattleState["magicRoom"];
  wonderRoom?: BattleState["wonderRoom"];
  gravity?: BattleState["gravity"];
  turnHistory?: BattleState["turnHistory"];
  rng?: SeededRandom;
  isWildBattle?: boolean;
  fleeAttempts?: number;
  ended?: boolean;
  winner?: BattleState["winner"];
}): BattleState {
  return {
    phase: options?.phase ?? "turn-end",
    generation: options?.generation ?? 1,
    format: options?.format ?? "singles",
    turnNumber: options?.turnNumber ?? 1,
    sides: options?.sides ?? [createBattleSide({ index: 0 }), createBattleSide({ index: 1 })],
    weather: options?.weather ?? null,
    terrain: options?.terrain ?? null,
    trickRoom: options?.trickRoom ?? { active: false, turnsLeft: 0 },
    magicRoom: options?.magicRoom ?? { active: false, turnsLeft: 0 },
    wonderRoom: options?.wonderRoom ?? { active: false, turnsLeft: 0 },
    gravity: options?.gravity ?? { active: false, turnsLeft: 0 },
    turnHistory: options?.turnHistory ?? [],
    rng: options?.rng ?? new SeededRandom(1),
    isWildBattle: options?.isWildBattle ?? false,
    fleeAttempts: options?.fleeAttempts ?? 0,
    ended: options?.ended ?? false,
    winner: options?.winner ?? null,
  };
}

/** Clone a PokemonInstance so battle state never aliases caller-owned team data. */
export function clonePokemonInstance(pokemon: PokemonInstance): PokemonInstance {
  return {
    ...pokemon,
    ivs: { ...pokemon.ivs },
    evs: { ...pokemon.evs },
    moves: pokemon.moves.map((move) => ({ ...move })),
    calculatedStats: pokemon.calculatedStats ? { ...pokemon.calculatedStats } : undefined,
    megaTypes: pokemon.megaTypes ? [...pokemon.megaTypes] : undefined,
    teraTypes: pokemon.teraTypes ? [...pokemon.teraTypes] : undefined,
    teraOriginalTypes: pokemon.teraOriginalTypes ? [...pokemon.teraOriginalTypes] : undefined,
    stellarBoostedTypes: pokemon.stellarBoostedTypes ? [...pokemon.stellarBoostedTypes] : undefined,
    rageFistLastHitTurns: pokemon.rageFistLastHitTurns
      ? { ...pokemon.rageFistLastHitTurns }
      : undefined,
  };
}

/** Get the display name for a pokemon */
export function getPokemonName(active: ActivePokemon): string {
  return active.pokemon.nickname ?? `Pokemon #${active.pokemon.speciesId}`;
}

/**
 * Create a minimal test Pokemon with sane defaults.
 * Useful for tests — avoids needing a full DataManager.
 */
function createTestPokemonUid(speciesId: number, level: number): string {
  testPokemonUidCounter += 1;
  return `test-${speciesId}-${level}-${testPokemonUidCounter}`;
}

export function createTestPokemon(
  speciesId: number,
  level: number,
  overrides?: Partial<PokemonInstance>,
): PokemonInstance {
  return {
    uid: createTestPokemonUid(speciesId, level),
    speciesId,
    nickname: null,
    level,
    experience: 0,
    nature: CORE_NATURE_IDS.adamant,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: DEFAULT_TEST_POKEMON_CURRENT_HP,
    moves: [createMoveSlot(CORE_MOVE_IDS.tackle, 35)],
    ability: CORE_ABILITY_IDS.blaze,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: DEFAULT_TEST_POKEMON_FRIENDSHIP,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "test",
    metLevel: level,
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: { ...DEFAULT_TEST_POKEMON_STATS },
    ...overrides,
  };
}
