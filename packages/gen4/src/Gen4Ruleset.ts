import type { DamageContext, DamageResult } from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type { Generation, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
// TODO: Full implementation by another agent

export class Gen4Ruleset extends BaseRuleset {
  readonly generation: Generation = 4;
  readonly name: string = "Gen 4 (Diamond/Pearl/Platinum)";

  getTypeChart(): TypeChart {
    // Stub -- will be implemented by another agent
    // Return a cast to satisfy the TypeChart type which requires all PokemonType keys
    return {} as TypeChart;
  }

  getAvailableTypes(): readonly PokemonType[] {
    // Stub -- will be implemented by another agent
    return [];
  }

  calculateDamage(_context: DamageContext): DamageResult {
    // Stub -- will be implemented by another agent
    return {
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      randomFactor: 1,
    };
  }
}
