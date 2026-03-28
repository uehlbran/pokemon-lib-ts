# Source Verification (Mandatory)

Before implementing ANY generation-specific mechanic, consult the primary source
for that generation per the source authority hierarchy in CLAUDE.md:

| Gen | Primary Source | Path / Fallback |
|-----|---------------|-----------------|
| 1-2 | pret disassemblies | `references/pokered-master/`, `references/pokecrystal-master/` -> Bulbapedia -> Showdown |
| 3 | pret/pokeemerald | `references/pokeemerald-master/` -> Showdown -> Bulbapedia |
| 4 | pret decompiled (where available) | Showdown -> Bulbapedia -> Smogon |
| 5-9 | Pokemon Showdown | `references/pokemon-showdown/` -> Bulbapedia -> Smogon |

Ground-truth docs (`specs/reference/genN-ground-truth.md`) are authoritative summaries
but can contain errors. Always cross-reference against the primary source above.
If the primary source and ground-truth doc disagree, the primary source wins — file
a bug against the ground-truth doc immediately.

## Source Comments in Tests

Test expectations for formulas must cite the SPECIFIC routine or article:
- Good: `// Source: pokered engine/battle/core.asm ApplyBadgeStatBoosts`
- Good: `// Source: Bulbapedia "Badge boost glitch" - cross-stat compounding`
- Good: `// Source: Showdown sim/battle-actions.ts Gen 4 — Trick item swap`
- Bad: `// Source: pokered`
- Bad: `// Source: Bulbapedia`

## Never

- Implement a mechanic without consulting the primary source for that generation
- Write test expectations without verifying against the primary source or Bulbapedia
- Use vague source citations that don't identify the specific routine or article
