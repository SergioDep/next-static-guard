# Evidence for 0.1.1-beta.1 (code metrics)

Ruleset 1.1.0. These files complement the 0.1.0-beta.1 acceptance evidence in `artifacts/`; they are not release-gate evidence.

## Engine hash

The engine hash (`implementationHash`) is the SHA-256 of the `.js` and `.json` files under `dist/` and `schemas/`. Two values belong to 0.1.1-beta.1:

| Build | Commit | Engine |
| --- | --- | --- |
| Build that generated the files recorded in this folder on 2026-10-20 | `29907ef` | `f6bc75e7add7dc29578909e56794c68326353ce38fc09a9b2dbadb7443a5e129` |
| Tag `v0.1.1-beta.1` | `f959d55` | `423474f092ddaa1a3f3fbef79661311dcff1cd897fb857ba96541bb3afee80cf` |

`f959d55` changed one comment in `src/metrics/code.ts` after those files were generated. The compiler keeps that comment in `dist/metrics/code.js`, so the hash differs and the behaviour does not. `quality-results-tag.json` repeats the reserved-sample measurement with the tagged build to confirm it.

## Files

| File | Content |
| --- | --- |
| `quality-results.json` | Reserved sample (corpus `ada75fdb…`) measured with 0.1.1-beta.1 (build of `29907ef`) against the recorded oracles: 120 TP, 0 FP, 0 FN. |
| `quality-results-tag.json` | The same measurement repeated on 2026-11-10 with a clean build of the tagged tree (`npm ci`, `tsc -p tsconfig.build.json`, `npm run test:quality` on Linux with Node 24.21.0): 120 TP, 0 FP, 0 FN. It differs from `quality-results.json` only in `implementationHash` and the per-case `wallMs`. |
| `check-summary.txt` | `npm run check` on Linux with Git 2.47.0: 394 passed, 1 skipped (Windows-only), 0 failed. |
| `guardlab-metrics.json` | `codeMetrics` summary for the 60 GuardLab base cases and their 24 corrected cases, with findings and coverage. Variants are not included. |
| `demo-main.json`, `demo-cambios-ia.json`, `demo-cambios-ia-base-main.json` | Reports for the demonstration store app: base branch, changed branch, and changed branch compared with `--base main`. Both branches declare the same two confidential variables. |
| `benchmark-same-host-0.1.0.json`, `benchmark-same-host-0.1.1.json` | `NSG_BENCH_RUNS=5` on the same unconstrained Linux host (2 CPUs) to estimate the relative cost of the metrics. Not eligible for acceptance: no container limits. |
| `demo-tienda.bundle` | Git bundle of the demonstration store app with its two branches (`main`, `cambios-ia`). Restore it with `git clone -b cambios-ia demo-tienda.bundle demo-tienda`, then run `npm install` and `npx next-static-guard scan --base main` inside it. |

`guardlab-metrics.json` is produced by `scripts/guardlab-metrics.mjs` after `npm run build`:

```sh
node scripts/guardlab-metrics.mjs . guardlab-metrics.json
```
