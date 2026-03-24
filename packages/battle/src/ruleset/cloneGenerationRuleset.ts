import { DataManager } from "@pokemon-lib-ts/core";
import type { GenerationRuleset } from "./GenerationRuleset";

function cloneValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof DataManager) {
    return value;
  }

  const cached = seen.get(value);
  if (cached) {
    return cached as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = new Array(value.length);
    seen.set(value, clone);
    for (let index = 0; index < value.length; index++) {
      if (index in value) {
        clone[index] = cloneValue(value[index], seen);
      }
    }
    return clone as T;
  }

  if (value instanceof Map) {
    const clone = new Map();
    seen.set(value, clone);
    for (const [key, entry] of value) {
      clone.set(cloneValue(key, seen), cloneValue(entry, seen));
    }
    return clone as T;
  }

  if (value instanceof Set) {
    const clone = new Set();
    seen.set(value, clone);
    for (const entry of value) {
      clone.add(cloneValue(entry, seen));
    }
    return clone as T;
  }

  const prototype = Object.getPrototypeOf(value);
  const clone = Object.create(prototype);
  seen.set(value, clone);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;

    if ("value" in descriptor) {
      descriptor.value = cloneValue(descriptor.value, seen);
    }

    Object.defineProperty(clone, key, descriptor);
  }

  return clone;
}

/**
 * Clone a ruleset instance so each BattleEngine gets its own battle-local state.
 *
 * Shared immutable data like DataManager stays shared; mutable per-battle
 * gimmick state is copied so overlapping battles cannot interfere with each
 * other through a singleton ruleset reference.
 */
export function cloneGenerationRuleset<T extends GenerationRuleset>(ruleset: T): T {
  return cloneValue(ruleset, new WeakMap());
}
