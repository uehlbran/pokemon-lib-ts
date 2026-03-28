# Source Verification (Mandatory)

Before implementing ANY generation-specific mechanic:

1. **Read the relevant pret disassembly** routine in `references/`
   - Gen 1: `references/pokered-master/`
   - Gen 2: `references/pokecrystal-master/`
   - Gen 3: `references/pokeemerald-master/`
2. **Cross-reference with Bulbapedia** article for the mechanic
3. Do NOT rely solely on ground-truth docs (`specs/reference/genN-ground-truth.md`) -- they are summaries that can contain errors

## Source Comments in Tests

Test expectations for formulas must cite the SPECIFIC routine or article:
- Good: `// Source: pokered engine/battle/effects.asm BadgeStatBoosts`
- Good: `// Source: Bulbapedia "Badge boost glitch" - cross-stat compounding`
- Bad: `// Source: pokered`
- Bad: `// Source: Bulbapedia`

## Conflict Resolution

If the disassembly and ground-truth doc disagree, the disassembly wins. File a bug
against the ground-truth doc immediately.

## Never

- Implement a mechanic based solely on the ground-truth summary doc
- Write test expectations without verifying against the disassembly or Bulbapedia
- Use vague source citations that don't identify the specific routine or article
