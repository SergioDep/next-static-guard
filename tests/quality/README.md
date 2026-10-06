# Reserved supported-pattern sample

This synthetic sample is separate from GuardLab and the cases used to repair the engine. It has 20 supported known positives and six valid controls for each of the six rules. It varies import forms, dependency paths, execution phases, value containers, declarations, and publication destinations. Families remain correlated; these counts do not estimate accuracy or error prevalence in production repositories. There is no human-review claim.

`cases.mjs` fixes expectations from the linked React/Next contracts. `run.mjs` writes every case ID, source SHA-256, framework version, expectation, and reference to `quality-results/manifest.json` before invoking Guard. It first builds every independent Next application. Rejection must concern the expected boundary problem, not an unrelated type error. Accepted transfer cases inspect the generated browser bundle or RSC/HTML payload using fictional data. An action-return case executes the actual exported function on a loopback route. Private environment reads require the key in the browser bundle and absence of the fictional server value.

Only after all independent observations agree with the fixed expectations does the harness run Guard on fresh copies of the original sources. Next's generated configuration and oracle probe routes are excluded from those copies. A supported positive with a limitation remains an FN when undetected and fails the coverage gate. Duplicate evidence cannot increase the TP sample. Unexpected rule findings and findings on valid controls count as FP. The result records TP/FP/FN, observed rates, Wilson intervals, coverage failures, and engine/corpus hashes.

Run with the pinned development environment:

```sh
npm run build
npm run test:quality
```

The phases can be separated with `node tests/quality/run.mjs oracle` and `node tests/quality/run.mjs measure`. Oracle authoring can resume interrupted builds from the same immutable source manifest. A measured sample must not be used to tune the engine and then advertised as reserved. Move any case used for a repair into development and author a new reserved sample for a new certification evaluation. The initial sample is insufficient to certify any individual rule (fewer than 50 reviewed findings per rule); all shipped rules remain warnings.

The output directory is ignored by Git. CI publishes the redacted observations, manifest, and quality report as run artifacts. Reported quality applies only to this declared synthetic sample and exact supported profile.
