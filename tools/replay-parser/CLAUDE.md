# replay-parser

## Purpose

Tool for downloading Showdown battle replays and validating our Gen 1 battle engine against them. Not published to npm — `private: true`.

## Commands

```bash
# Download replays
npx tsx tools/replay-parser/src/index.ts download --format gen1ou --count 15

# Parse a single replay log
npx tsx tools/replay-parser/src/index.ts parse replays/gen1/some-replay.log

# Validate a single replay
npx tsx tools/replay-parser/src/index.ts validate replays/gen1/some-replay.log

# Validate all replays in a directory
npx tsx tools/replay-parser/src/index.ts validate-all replays/gen1/
```

## What This Does

1. Downloads real Gen 1 OU battle replays from replay.pokemonshowdown.com
2. Parses Showdown protocol log format into structured data
3. Validates deterministic properties (type effectiveness, status legality) against our battle engine
4. Reports mismatches as errors/warnings

## Why Structural Validation (Not Exact Replay)

We cannot replicate Showdown's RNG seed, so exact damage won't match. Instead we validate deterministic properties:
- Type effectiveness (super-effective, resisted, immune) — always deterministic
- Status infliction legality (Fire can't burn, etc.) — always deterministic
- These serve as a permanent regression suite

## Source Layout

```
src/
  replay-types.ts  # All TypeScript types
  parser.ts        # Parse Showdown log → ParsedReplay
  downloader.ts    # Fetch replays from replay.pokemonshowdown.com
  validator.ts     # Compare replay events vs our engine's rules
  report.ts        # Generate mismatch reports
  index.ts         # CLI entry point
replays/gen1/      # Committed .log fixtures
tests/             # Unit tests
```
