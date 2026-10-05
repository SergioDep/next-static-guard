# Next Static Guard Implementation Plan

Required deliverables for v0.1, in dependency order. [Product](PRODUCT.md) owns scope, [Architecture](ARCHITECTURE.md) owns behavior, and [Validation](VALIDATION.md) owns acceptance. A deliverable is complete when its listed artifacts and checks pass. This file defines implementation work; measured outcomes belong in `docs/RESULTS.md`.

## Delivery contract

| Artifact | Required behavior | Acceptance |
| --- | --- | --- |
| Development MVP: `next-static-guard-0.1.0-dev.0.tgz` | Six warning rules, local scan and PR comparison, three report formats, explicit partial coverage, no source edits or network calls. | Deliverables 1–5, install test, controlled corpus, framework checks, comparison results, and measured performance. No quality or platform result is inferred from an unexecuted check. |
| Beta: `next-static-guard-0.1.0-beta.1.tgz` | Same scope; uncertified rules retain warnings. | Development acceptance plus the independent quality sample and every CI job specified in Validation. |
| Blocking-enabled ruleset | Only individually certified NSG001–NSG005 rules default to `error`; NSG006 remains `warn`. | Per-rule certification predicate and a ruleset version increment. |

The development artifact does not require registry publication. Missing beta or certification evidence keeps the corresponding artifact or rule ineligible; it is not a configuration choice.

## 1. Package, contracts, and snapshots

Artifacts:

- One ESM package named `next-static-guard`, version `0.1.0-dev.0`, and MIT LICENSE attributed to Next Static Guard contributors.
- Exact dependencies from [Stack and layout](ARCHITECTURE.md#stack-and-layout), npm v3 lockfile, `.nvmrc`, `.npmrc`, and the specified TypeScript and Vitest configurations.
- `schemas/config.v1.json`, `schemas/report.v1.json`, and `schemas/case.v1.json`, with closed objects and contract invariants.
- Read-only filesystem snapshot adapter; source inventory, byte hashes, version lookup, safe symlink resolution, and bounded reads.
- GuardLab base and independent case manifests. Installed workspaces are only `tests/fixtures/guardlab/base` and `packages/shared`; case applications are isolated temporary materializations.

Checks: `npm run check` passes; schemas accept valid contracts and reject invalid contracts; snapshot tests cover source changes, excluded inputs, invalid UTF-8, and read budgets. `npm pack --dry-run` lists only package.json, dist, schemas, README, and LICENSE.

## 2. Runtime graph and dependency boundaries

Artifacts:

- `src/project/discover.ts`, `snapshot.ts`, and `resolve.ts`.
- `src/graph/build.ts`, `directives.ts`, and `contexts.ts`.
- `src/rules/NSG001.ts`, terminal/JSON reports, and CLI entry point.
- App-specific runtime resolution, symbol-selected reexports, worklist propagation, directive validation, and Server Function reference edges.

Checks: P01–P04 and N01–N04 pass exact manifest expectations; U03–U05 report the specified limitations. Explicit type-only imports, shared utilities, cycles, and valid Server Function imports do not produce false findings. Next build independently verifies the executable boundary cases. Evidence identifies the boundary import and resolved dependency path.

## 3. Execution phases and values

Artifacts:

- `src/analysis/phases.ts`, `values.ts`, `sensitivity.ts`, and symbol helpers.
- `src/rules/NSG002.ts` through `NSG006.ts`, in that order.
- All P/N/U cases, corrections, language/layout variants, and [cross-cutting controls](VALIDATION.md#cross-cutting-tests).
- Rule documentation at `docs/rules/NSG001.md` through `NSG006.md`: condition, correction, positive case, valid control, evidence, and limitations.

Checks: all 60 semantic expectations and required subvariants pass; corrections remove their findings while preserving functional behavior. The framework lab verifies SSR, serialization, and publication using fictional values. Reports and errors contain zero fictional secret sentinel values. Ruleset `1.0.0` keeps every rule uncertified at `warn`.

## 4. PR comparison and policy

Artifacts:

- `src/project/git-snapshot.ts`, `src/report/markdown.ts`, and `fingerprint.ts`.
- `src/cli/config.ts`, `comparison.ts`, `policy.ts`, and atomic output handling.
- Virtual Git object reads, protected base policy, canonical fingerprints, explicit exceptions, and compatible baseline comparison.
- Tarball installation test in an isolated consumer with only runtime dependencies.

Checks: an import change detects a violation in an unchanged file; novelty, debt, aggravation, suppression, and uncertainty follow the contract. Exit codes and all report formats pass exact assertions. Git analysis leaves checkout/index unchanged, does not fetch missing objects, and does not execute repository scripts. Failed output preserves the previous report. Every rule has an uncertified `error` request control.

## 5. Validation evidence and delivery

Artifacts:

- `docs/RESULTS.md` with tool/framework/runtime versions, corpus identity, TP/FP/FN by rule, denominators, Wilson intervals, limitations, comparison outcomes, performance, and certification status. Unmeasured cells use `not measured`, never inferred values.
- Benchmark JSON with all 20 samples per scenario, source bytes/edges, wall time, external peak RSS, total PR time and Git IO breakdown, and observed container limits.
- Installation guide, changelog, and issue templates for false positives, false negatives, and compatibility.
- Installable development tarball. Beta tarball version is `0.1.0-beta.1` only after the beta predicate below passes.

The development workflow uses `pull_request` and `push` to main, `contents: read`, and the action SHAs in [S26](RESEARCH.md#s26). Checkout uses `persist-credentials: false` and `fetch-depth: 0`. Jobs:

| Job | Environment | Required commands |
| --- | --- | --- |
| Core matrix | ubuntu-24.04, macos-15, windows-2025; Node 24.21.0/npm 11.19.0; Git >=2.47.0 | `npm ci`, Git version preflight, `npm run check` |
| Framework | ubuntu-24.04; pinned lab profile | `npm ci`, `npm run build`, `npm run test:framework`, `npm run test:comparison` |
| Performance | ubuntu-24.04; Linux Docker with 2 CPU and 4 GiB | Build the benchmark image and run `npm run bench` inside it |

Cache only development npm downloads. Validation artifacts contain no sources or secrets and have 7-day retention. PR source execution uses `pull_request`; `pull_request_target` is excluded.

Beta acceptance is the conjunction of: all required fixture and contract checks pass; observed overall precision >=95%; supported-pattern recall >=90%; all performance budgets pass; the tarball installation test passes; and every required platform/framework/performance job passes. Missing evidence fails the corresponding gate. Certification is evaluated separately per rule using the exact predicate in [Validation](VALIDATION.md#measurement-and-acceptance); an uncertified rule remains `warn` and does not prevent an otherwise qualifying warning-only beta. Certification/default changes increment rulesetVersion. Registry publication is outside MVP delivery.
