# Changesets

This directory contains changesets — small markdown files that declare which packages changed and the semver bump type.

## How it works

Each PR that touches `packages/*/src/` or `packages/*/data/` adds a `.changeset/<name>.md` file here. These files:

- Cannot conflict between branches (each is a new file with a random name)
- Replace manual `package.json` version edits and `CHANGELOG.md` updates

When ready to release, run `npm run version-packages` on `main`. This consumes all changesets, bumps `package.json` versions, and generates `CHANGELOG.md` entries atomically.

## Creating a changeset

Run `/version` in Claude Code or:

```bash
npx changeset
```

## Checking status

```bash
npx changeset status --since=origin/main
```

## Releasing

```bash
npm run version-packages  # Consumes changesets, bumps versions, updates CHANGELOGs
npm run release           # Publishes to npm
```
