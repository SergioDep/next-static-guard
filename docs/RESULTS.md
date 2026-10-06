# Next Static Guard Validation Results

The source is being promoted to `0.1.0-beta.1`. The evidence below belongs to the accepted development candidate; beta delivery requires fresh engine and package identities.

The accepted development candidate is `0.1.0-dev.1`, ruleset `1.1.0`. Its compiled engine identity is `cdf9d0530d046c4103a9126f54a8332b1ed8f7d4a2129b813bf590b64ab36515`. The quality sample, tool comparison, and constrained benchmark identify this same engine. The tested source commit is `1917fa9bf8965cc5a0b8577453cf89db406ccf41`; [all six CI jobs passed](https://github.com/eng-aesr/next-static-guard/actions/runs/37438819253).

The candidate is prepared in the workspace and fork. Applying the changes to `SergioDep/next-static-guard` main remains pending because the connected GitHub account has read permission there. [Release evidence index](../artifacts/release-candidate.json) records artifact readiness separately from that publication status.

## Executed checks

| Check | Result |
| --- | --- |
| Core checks, ubuntu-24.04 | 382 passed; 1 platform-specific skips; typecheck and build passed. |
| Core checks, macos-15 | 382 passed; 1 platform-specific skips; typecheck and build passed. |
| Core checks, windows-2025 | 383 passed; 0 platform-specific skips; typecheck and build passed. |
| Independent framework controls | 141 passed. |
| GuardLab | All 87 authored manifests, including 37 positives, 36 clean controls, and 14 deliberate partial cases, remain regression checks. |
| Tool comparison | All 73 original positive/clean variants passed the complete comparison matrix. |
| Reserved quality sample | All 156 independent Next oracles verified; measured rates and coverage passed the beta gate. |
| Constrained performance | Three scenarios, each with one uncounted warmup and 20 new-process measurements; all budgets passed. |
| Exact delivered tarball | Installed with runtime dependencies only; all six rule smoke checks passed with complete coverage and exit 0. |
| Runtime audit | No high or critical advisories in the installed CLI dependencies. |

The native cross-drive Windows check is intentionally skipped on Linux/macOS. The framework controls include dependency retention, confidential payloads, real Server Function returns, private helper controls, namespace boundaries, and constructor coercion. Building or fetching a route does not establish general browser behavior.

## Reserved quality evidence

Sample identity: `ada75fdbde741aa429d2cede563ac6e2a21bbceeb1c4991e5571d890165ab8b8`. The v1 sample was moved to development after three misses informed fixes. In v2, two shorthand-property cases exposed partial value tracking; those cases were moved to development. The current v3 sample retains 154 v2 cases that were not used to tune rules and adds two fresh cases. Its source and expectation hashes were frozen before execution. Expected outcomes come from independent Next compilation, rendered payload/bundle observations, and real function-return probes using fictional data. Guard output does not define fixture truth.

| Rule | TP | FP | FN | Known positives | Precision | Recall |
| --- | --- | --- | --- | --- | --- | --- |
| NSG001 | 20 | 0 | 0 | 20 | 100.0% | 100.0% |
| NSG002 | 20 | 0 | 0 | 20 | 100.0% | 100.0% |
| NSG003 | 20 | 0 | 0 | 20 | 100.0% | 100.0% |
| NSG004 | 20 | 0 | 0 | 20 | 100.0% | 100.0% |
| NSG005 | 20 | 0 | 0 | 20 | 100.0% | 100.0% |
| NSG006 | 20 | 0 | 0 | 20 | 100.0% | 100.0% |

Overall: 120 TP, 0 FP, 0 FN; precision 100.00% and recall 100.00%. Coverage is complete for every supported sampled case. The 95% Wilson intervals are 96.90%–100.00% for precision and 96.90%–100.00% for recall. Each rule's 20-positive interval remains wide; no rule meets the separate minimum of 50 reviewed findings for blocking certification.

These synthetic examples include correlated families and partially reused untuned controls. They do not estimate production-repository accuracy, prevalence, or AI error rates. All six rules remain uncertified warnings, including when configured as errors. NSG006 records private environment substitution problems, not proof of a leaked value. [Measured cases and intervals](../artifacts/quality-results-current.json), [frozen source hashes](../artifacts/quality-manifest-current.json), [independent observations](../artifacts/quality-oracles-current.json).

## Performance

Linux container with observed 2 CPU and 4 GiB constraints, pinned Node 24.21.0, and Git >=2.47. Each scenario uses seed 42, one uncounted warmup, and 20 new processes. Wall time includes parsing, reporting, and Git IO. p95 selects sorted sample 19 of 20; maximum peak RSS is measured externally.

| Scenario | Wall p95 | Maximum peak RSS | Gate |
| --- | --- | --- | --- |
| local, 1,000 input sources per snapshot | 1.821 s | 240.4 MiB | Passed |
| local, 5,000 input sources per snapshot | 6.138 s | 412.7 MiB | Passed |
| git, 5,000 input sources per snapshot | 9.855 s | 562.8 MiB | Passed |

Budgets are <10 s for local 1,000 inputs, <30 s for local 5,000 inputs, <60 s for Git comparison, and <1 GiB peak RSS for each. [All samples and observed limits](../artifacts/benchmark-results-current.json). These synthetic workloads do not prove performance for every repository.

## Package and reproduction

Tarball: `next-static-guard-0.1.0-dev.1.tgz`, 85,437 bytes. SHA-256: `de223d821a1aa059a719d0eaa241ba66d0ce4125556d911c14183383509f7eec`. [Exact installation verification](../artifacts/package-validation-current.json). Package contents are limited to package metadata, compiled CLI, schemas, README, and LICENSE. Install from the local tarball as described in [Installation](INSTALLATION.md); registry publication is outside this MVP.

Use the pinned Node/npm and supported Git version:

```sh
npm ci
npm run check
npm run test:framework
npm run test:comparison
npm run test:quality
docker build -f tests/bench/Dockerfile -t next-static-guard-bench .
mkdir -p bench-results
docker run --rm --cpus 2 --memory 4g --user "$(id -u):$(id -g)" -v "$PWD/bench-results:/work/bench-results" next-static-guard-bench
npm pack --pack-destination artifacts
npm run verify:package -- artifacts/next-static-guard-0.1.0-dev.1.tgz
npm run release:check
```

`release:check` verifies the current compiled hash, frozen inputs, observed quality, complete comparison, exact tarball identity, platform CI, and constrained benchmark. It rejects missing or stale evidence. A successful artifact check does not imply the target main branch has been updated.

Baseline commit `515ff4417ca80b8c9537a87c809720c91bfef5ac` / ruleset `1.0.0` results are historical: [original results document](https://github.com/SergioDep/next-static-guard/blob/515ff4417ca80b8c9537a87c809720c91bfef5ac/docs/RESULTS.md), [original validation summary](../artifacts/validation-summary.json). They do not certify this engine.
