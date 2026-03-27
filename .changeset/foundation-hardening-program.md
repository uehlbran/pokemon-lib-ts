---
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/battle": patch
---

Harden core and battle foundation seams by locking DataManager replacement semantics, normalizing experience growth identifiers across runtime and importer, rejecting invalid battle input before initialization, and enforcing caller-input non-mutation with explicit invariant coverage. Also adds CI-backed invariant checks and corrects status docs that overstated correctness guarantees.
