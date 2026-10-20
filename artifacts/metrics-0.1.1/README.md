# Evidence for 0.1.1-beta.1 (code metrics)

Engine `f6bc75e7add7dc29578909e56794c68326353ce38fc09a9b2dbadb7443a5e129`, ruleset 1.1.0. These files complement the 0.1.0-beta.1 acceptance evidence in `artifacts/`; they are not release-gate evidence.

| File | Content |
| --- | --- |
| `quality-results.json` | Reserved sample (corpus `ada75fdb…`) measured with 0.1.1-beta.1 against the recorded oracles: 120 TP, 0 FP, 0 FN. |
| `check-summary.txt` | `npm run check` on Linux with Git 2.47.0: 394 passed, 1 skipped (Windows-only), 0 failed. |
| `guardlab-metrics.json` | `codeMetrics` summary for the 60 GuardLab base cases and their 24 corrected cases, with findings and coverage. Variants are not included. |
| `demo-main.json`, `demo-cambios-ia.json`, `demo-cambios-ia-base-main.json` | Reports for the demonstration store app: base branch, changed branch, and changed branch compared with `--base main`. Both branches declare the same two confidential variables. |
| `benchmark-same-host-0.1.0.json`, `benchmark-same-host-0.1.1.json` | `NSG_BENCH_RUNS=5` on the same unconstrained Linux host (2 CPUs) to estimate the relative cost of the metrics. Not eligible for acceptance: no container limits. |
| `demo-tienda.bundle` | Git bundle of the demonstration store app with its two branches (`main`, `cambios-ia`). Restore it with `git clone -b cambios-ia demo-tienda.bundle demo-tienda`, then run `npm install` and `npx next-static-guard scan --base main` inside it. |

`guardlab-metrics.json` is produced by `scripts/guardlab-metrics.mjs` after `npm run build`:

```sh
node scripts/guardlab-metrics.mjs . guardlab-metrics.json
```
