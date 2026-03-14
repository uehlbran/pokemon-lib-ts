import type { Generation } from "@pokemon-lib/core";
import type { GenerationRuleset } from "./GenerationRuleset";

/**
 * Registry of all available generation rulesets.
 * Consumers import only the generations they need — tree-shakeable.
 */
export class GenerationRegistry {
  private rulesets: Map<Generation, GenerationRuleset> = new Map();

  register(ruleset: GenerationRuleset): void {
    this.rulesets.set(ruleset.generation, ruleset);
  }

  get(gen: Generation): GenerationRuleset {
    const ruleset = this.rulesets.get(gen);
    if (!ruleset) {
      throw new Error(`Generation ${gen} ruleset not registered. Import and register it first.`);
    }
    return ruleset;
  }

  has(gen: Generation): boolean {
    return this.rulesets.has(gen);
  }

  getAll(): GenerationRuleset[] {
    return [...this.rulesets.values()].sort((a, b) => a.generation - b.generation);
  }
}

/** Singleton registry */
export const generations = new GenerationRegistry();
