# Pokemon Library Monorepo

## Project Overview

A TypeScript monorepo producing open-source Pokemon libraries: `@pokemon-lib-ts/core` (entities, shared logic, zero dependencies), `@pokemon-lib-ts/battle` (pluggable battle engine), and `@pokemon-lib-ts/gen1` through `@pokemon-lib-ts/gen9` (per-gen rulesets + complete standalone data). Any consumer (Phaser game, Discord bot, CLI tool) can install only the gens it needs and swap battle systems at runtime.

## Architecture

Turborepo monorepo with npm workspaces. 11 publishable packages under `packages/`. See `specs/core/00-architecture.md` for full details.

```
packages/
  core/       # @pokemon-lib-ts/core — TypeScript interfaces, stat calc, type effectiveness, EXP curves, DataManager, SeededRandom
  battle/     # @pokemon-lib-ts/battle — BattleEngine, GenerationRuleset interface, BaseRuleset, BattleState, BattleEvent stream, AI controllers
  gen1/       # @pokemon-lib-ts/gen1 — Gen1Ruleset (implements GenerationRuleset directly) + complete Gen 1 data
  gen2/       # @pokemon-lib-ts/gen2 — Gen2Ruleset (implements GenerationRuleset directly) + complete Gen 2 data
  gen3/-gen9/ # @pokemon-lib-ts/gen3-gen9 — extend BaseRuleset + complete per-gen data
tools/
  data-importer/  # Build-time scripts that parse Showdown + PokeAPI data into per-gen JSON
  replay-parser/  # Showdown replay validation tool — parses replays and validates structural properties
```

### Dependency Graph
```
core ← battle ← genN ← consumer
```
Core has zero runtime dependencies. Battle depends on core. Each gen package depends on core + battle. Consumers install the gen packages they need.

### Key Design Patterns
- **GenerationRuleset interface**: ~20 methods (damage calc, stat calc, type chart, turn order, accuracy, move effects, etc.). Each gen implements this. The battle engine delegates all gen-specific behavior to it.
- **BaseRuleset abstract class**: Default Gen 3+ implementations. Gen 3-9 extend it. Gen 1-2 implement the interface directly (too mechanically different).
- **Event-driven battles**: BattleEngine emits a BattleEvent[] stream. No UI coupling. Consumers render events however they want.
- **Seeded PRNG**: Mulberry32. Deterministic battles for testing and replay.
- **Fully separate per-gen data**: Each gen package bundles complete pokemon.json, moves.json, abilities.json, items.json, type-chart.json, natures.json. No overlays or diffs between gens.

### Key Rules
- **Core has zero runtime dependencies.** This is a hard rule. If you need an external library, it doesn't belong in core.
- **The battle engine delegates ALL generation-specific behavior to the GenerationRuleset.** The engine never contains damage formulas, type charts, accuracy checks, or any mechanic that varies between generations. If you're tempted to add a gen-specific `if` statement to the engine, it belongs in the ruleset interface instead.
- **Turn flow**: `TURN_START → action selection → priority sort → TURN_RESOLVE (accuracy check → move execution → damage/effects → ability triggers) → TURN_END → weather/status ticks → FAINT_CHECK → next turn or game over`

## Tech Stack

- **Language**: TypeScript 5.4+ with strict mode
- **Build**: tsup (ESM + CJS dual output)
- **Monorepo**: Turborepo + npm workspaces
- **Linting/Formatting**: Biome (NOT ESLint/Prettier)
- **Testing**: Vitest with v8 coverage, 80% thresholds
- **Node**: 20+

## Commands

```bash
npm run build          # Build all packages (turbo)
npm run test           # Test all packages (turbo)
npm run typecheck      # Type check all packages (turbo)
npx @biomejs/biome check --write .   # Lint + format
npx vitest run         # Run tests (from package dir)
npx vitest run --coverage  # Run with coverage
```

## Code Style

- Biome handles all formatting: spaces, indent width 2, line width 100
- Organize imports enabled
- Linter with recommended rules, warn on noExplicitAny
- No semicolons in Biome config (use Biome defaults)
- Prefer readonly interfaces for data. Mutable versions only where needed (runtime stat blocks).
- Use discriminated unions over class hierarchies (MoveEffect, BattleAction, BattleEvent)
- All entity types use lowercase string literals ('fire', 'physical', 'paralysis') not UPPERCASE enums

## Data Sources

**Primary**: Pokemon Showdown data (`@pkmn/data` / `smogon/pokemon-showdown` repo) — battle-tested, already split by generation, MIT licensed.
**Secondary**: PokeAPI `api-data` repo — for species metadata (Pokedex entries, catch rates, egg groups, growth rates, evolution chains) that Showdown doesn't track.

Data pipeline: `tools/data-importer/` transforms raw sources → per-gen JSON in `packages/genN/data/`. Generated JSON is committed to the repo and ships with npm packages.

## Spec Documents

Full architecture specs live in the `specs/` directory (originally created as `pokemon-project-planning/`):

- `specs/core/00-architecture.md` — Monorepo structure, package configs, versioning, design principles
- `specs/core/01-entities.md` — All TypeScript interfaces and types
- `specs/core/02-shared-logic.md` — Stat formulas, type effectiveness, EXP curves, catch rate
- `specs/core/03-data-pipeline.md` — PokeAPI/Showdown → per-gen JSON transformation pipeline
- `specs/battle/00-architecture.md` — GenerationRuleset, BattleState, BattleEvent, engine API
- `specs/battle/01-core-engine.md` — Engine implementation: turn resolution, move execution, end-of-turn
- `specs/battle/02-gen1.md` through `specs/battle/10-gen9.md` — Per-generation mechanics

These specs are reference material. Implementation may deviate where code reveals better approaches.

## Testing Philosophy

- Test against known values from Bulbapedia/Showdown (e.g., "level 50 Charizard with 31 HP IVs and 252 HP EVs = X HP")
- Property-based tests for formulas (stats always positive, type effectiveness in {0, 0.25, 0.5, 1, 2, 4})
- Determinism tests for PRNG (same seed = same sequence)
- Snapshot tests for imported data (correct shapes and counts)
- Validate against Showdown battle logs for battle engine correctness

## PR Review

Every PR gets reviewed by three AI tools plus a human approver:

- **CodeRabbit** — inline comments, PR summary, security scan. Config: `.coderabbit.yaml`
- **Qodo PR-Agent** — structured review with severity categories. GitHub Action, best-effort (soft-fails on rate limit)
- **Claude Code** — deep local review via `pokemon-reviewer` subagent. Runs on push via `git pushreview`. Posts findings to PR as comments
- **Human** — required approval (1 reviewer). Final say on architecture and correctness

AI reviews are advisory (comments only, never formal approvals). See `.github/AI_REVIEWERS.md` for interaction commands.

Local pre-PR review: run `/review` in Claude Code (falcon/kestrel/sentinel agents).

## How to Add a New Generation

1. Create `packages/genN/` with standard package structure
2. Generate data: `npx tsx tools/data-importer/src/import-gen.ts --gen N`
3. Implement the ruleset:
   - Gen 1-2: Implement `GenerationRuleset` directly (too mechanically different from Gen 3+ defaults)
   - Gen 3-9: Extend `BaseRuleset`, override gen-specific methods
4. Read the spec: `specs/battle/` (e.g., `02-gen1.md`, `03-gen2.md`, ... `10-gen9.md`)
5. Write tests for every gen-specific mechanic
6. Export from `packages/genN/src/index.ts`

## Implementation Phases

- **Phase 1**: Core + Battle + Gen 1 (simplest gen — no abilities, no held items, 151 Pokemon, 165 moves, 15-type chart). Ship 0.1.0.
- **Phase 2**: Gen 2 (second simplest — no abilities, adds held items, weather, Dark/Steel types, Special split). Ship 0.2.0.
- **Phase 3**: Gen 9 (most complex — proves architecture scales).
- **Phase 4+**: Remaining gens, community-driven.

## Package Versioning

Independent semantic versioning per package. A Gen 1 bug fix doesn't bump Gen 9. All packages share a minimum compatible core version via peerDependencies.

**Versioning is mandatory on every PR that touches `packages/`.** Use the `/version` skill before creating any PR. Never skip it — missed bumps compound and require retroactive catch-up PRs.

Rules:
- Any `src/` bug fix → patch bump for that package
- Any new export in `src/index.ts` → minor bump
- Any breaking interface change → major bump (pre-1.0: treated as minor)
- Tests, docs, config, `specs/`, `.github/` only → no bump needed
- Data file changes (`data/*.json`) → patch bump

## Agent Work Patterns

### Task Sizing
- Agent tasks should be completable within ~50% of context capacity — if a task needs 15+ file reads, split it into narrower agents
- Explore agents: give specific search targets and file paths, not open-ended "find everything about X"
- Implementation agents: one vertical slice per agent, not multiple features in one dispatch
- Front-load context in agent prompts (file paths, line numbers, method names) to reduce discovery overhead
- If an agent compacts mid-task, the fix is task sizing — break it into smaller agents, not more infrastructure

### Parallelization
- **Default to parallel.** If 2+ tasks have no data dependency between them, dispatch them as concurrent subagents in a single message — never do sequentially what can be done in parallel
- Use subagents aggressively to offload work: research, test writing, independent implementations, file exploration, code review. This protects the main context window from bloat and reduces compaction risk
- Examples of parallelizable work: writing tests for different modules, exploring separate areas of the codebase, implementing independent functions/classes, running build + test + typecheck, reviewing different files
- When implementing a plan with independent steps, dispatch those steps as parallel subagents rather than executing them sequentially in the main context
- Only serialize work when there is a true dependency (e.g., must read output of step 1 to inform step 2)

## PR Workflow

- **Always run `/version` before creating a PR** — mandatory for any branch touching `packages/`. See Package Versioning above.
- Use **`/babysit-pr`** for all PR monitoring (waiting for CI, reviewer comments, following up after fixes). Do NOT use manual polling.
- **Always use `/loop` with `/babysit-pr`** for any PR that needs to wait for CI or reviews: `/loop 5m babysit-pr <number> --auto-merge`. A single `/babysit-pr` invocation runs once and exits — it does not poll.
- **Act autonomously.** When handling a PR, agents should:
  - Push fixes for reviewer feedback without asking permission
  - Fix CI/lint/test failures independently
  - Resolve merge conflicts
  - Re-request reviews after pushing fixes
- **Only escalate when:**
  - A reviewer requests an architectural change that conflicts with existing patterns or specs
  - You've attempted a fix 2+ times and it's still failing
  - The reviewer's feedback is ambiguous and could be interpreted multiple ways
  - A decision requires trade-offs only the user can weigh
