# Next Static Guard Validation

Acceptance tests, fixture truth, quality gates, and measurement protocol for v0.1.

## GuardLab fixture project

GuardLab is a small store with an RSC catalog, client cart, profile panel, `server-only` data access, and update functions. Use fictional data and secrets, in-memory storage, and loopback HTTP for render checks. No credentials, real database, or external runtime services are required. Build independent variants of the same skeleton so one error does not hide another.

Base structure: `app/page.tsx`, `app/layout.tsx`, `app/ui/cart.tsx`, `app/profile/page.tsx`, `app/actions.ts`, `lib/server/data.ts`, and `lib/shared/format.ts` under `tests/fixtures/guardlab/base`; shared workspace sources live in `packages/shared/src`. Variants reproduce src/app, JS/JSX, aliases, barrels, cycles, and workspaces. Each source has a minimal functional purpose.

Each case has an independent manifest with its ID, variant, context preconditions, finding/clean/partial result, rule, location, severity/confidence, trace, limits, and correction. Author exact ranges from the fixture source; never generate expected truth using Guard. P/N/U IDs describe semantic cases; language, layout, and contract subvariants retain the parent ID.

`preconditions.contexts` lists the source uses required by the case, rather than every entry in its application. A client-referenced Server Function case lists both its client use and server-function execution. A configuration-only publication case uses an empty array because its policy violation does not require an executed client consumer. Corrected manifests describe the corrected contexts.

## Positive cases

Require one primary finding per case; secondary evidence is grouped into that finding. Expected severity/confidence follows the [rule table](PRODUCT.md#rules). NSG006 is a positive functional warning, not a leak. Each P01–P24 fixture uses the smallest error required by its rule. P17–P20 explicitly configure sensitivity; other cases do not infer confidentiality from names.

| Case | Rule | Known error |
| --- | --- | --- |
| P01 | NSG001 | Client directly imports a `server-only` module. |
| P02 | NSG001 | Client uses a `server-only` dependency through an alias and barrel. |
| P03 | NSG001 | A client-reachable helper calls `headers` imported under an alias. |
| P04 | NSG001 | Client uses `readFile` from `node:fs` through a local package. |
| P05 | NSG002 | Server Component calls `useState`. |
| P06 | NSG002 | A helper used during server rendering calls React's `useEffect`. |
| P07 | NSG002 | Server Component reaches a `client-only` module. |
| P08 | NSG002 | Server Component calls `useRouter` imported through a reexport. |
| P09 | NSG003 | Client reads `window` during module evaluation with SSR enabled. |
| P10 | NSG003 | Client render reads `document` without a guard. |
| P11 | NSG003 | Lazy state initializer reads `localStorage`. |
| P12 | NSG003 | A `useMemo` callback reads `window` during render. |
| P13 | NSG004 | Server sends an ordinary handler to a client prop. |
| P14 | NSG004 | Server sends a custom class instance inside an object. |
| P15 | NSG004 | Server sends a null-prototype object. |
| P16 | NSG004 | Server sends a local `Symbol()` inside an array. |
| P17 | NSG005 | A key declared secret reaches a client prop through a local alias. |
| P18 | NSG005 | A client-referenced Server Function returns a declared secret field. |
| P19 | NSG005 | A literal configuration `env` object publishes a key declared secret. |
| P20 | NSG005 | An exported value declared secret is used by the client through a reexport. |
| P21 | NSG006 | Client reads a static private `process.env` key. |
| P22 | NSG006 | A client-imported utility reads a private key. |
| P23 | NSG006 | A shared helper reads a private key in its client use. |
| P24 | NSG006 | A client-reachable local package reads a private key. |

## Valid controls

Each control must emit zero violations and no unnecessary limitations for the supported pattern. Subvalues within a row are checked separately when the test runs.

| Case | Rule contrasted | Valid pattern |
| --- | --- | --- |
| N01 | NSG001 | Client imports only types from a server module. |
| N02 | NSG001 | Client imports a module-level Server Function with a `server-only` DAL. |
| N03 | NSG001 | A pure utility is used in both graphs with a resolvable local cycle. |
| N04 | NSG001 | Server renders a `server-only` component as children of a client component. |
| N05 | NSG002 | `useState` in a transitive dependency of a `use client` entry. |
| N06 | NSG002 | Client uses `useEffect` and a `client-only` module. |
| N07 | NSG002 | Server Component uses React's `use` with an allowed resource. |
| N08 | NSG002 | A user-defined function named `useRouter`, without a Next symbol. |
| N09 | NSG003 | Reading `window` within a client effect callback. |
| N10 | NSG003 | Reading `document` within a client event handler. |
| N11 | NSG003 | A read dominated by a local `typeof window` guard. |
| N12 | NSG003 | A local object named `window`, without access to the global. |
| N13 | NSG004 | A module-level Server Function passed as a prop. |
| N14 | NSG004 | A valid inline Server Function passed as a prop. |
| N15 | NSG004 | Date, Map, and Set with supported contents. |
| N16 | NSG004 | A React element, Promise of allowed data, and `Symbol.for()` as props. |
| N17 | NSG005 | A declared secret used only on the server. |
| N18 | NSG005 | A literal DTO excludes the secret field before being sent to the client. |
| N19 | NSG005 | Configuration publishes explicitly public, nonconfidential data. |
| N20 | NSG005 | A referenced Server Function returns a DTO without declared private fields. |
| N21 | NSG006 | A private read only on the server. |
| N22 | NSG006 | A client read of nonconfidential `NEXT_PUBLIC_`. |
| N23 | NSG006 | A client read of a public key recognized in `next.config.env`. |
| N24 | NSG006 | A shared public constant without an environment read. |

## Partial coverage cases

These cases must emit a limitation with a location and affected rules, without blocking for an invented violation. `--strict-coverage` returns 2. Do not count them as security true positives.

| Case | Deliberate limitation |
| --- | --- |
| U01 | A dynamic import whose specifier is not a string literal; local constant propagation for import specifiers is outside the resolver profile. |
| U02 | A bundler alias defined by a configuration function. |
| U03 | An external package without a summary or analyzed source. |
| U04 | Conditional exports with divergent browser/react-server destinations that are not modeled. |
| U05 | Two required subvariants: Next 15.0.0/React and React DOM 18.3.1 (`unsupported-version`), and the supported profile with an unterminated string in a reached `.ts` source (`unsupported-syntax`). An older project TypeScript alone is valid. |
| U06 | JSX with a props spread of unknown origin. |
| U07 | Confidential data passes through an unknown transformation. |
| U08 | A browser read in a library callback with unknown phase semantics. |
| U09 | Two required subvariants: a reached dependency matched by an explicit exclude glob, and a reached source symlink outside the scan root. Both emit `source-excluded`. |
| U10 | Next env configuration with an unknown wrapper or spread. |
| U11 | A reached source of 2 MiB + 1 byte emits `source-budget`. Adapter controls separately simulate a read failure and require `source-excluded`. |
| U12 | Data flow with recursion or more than two local call hops. |

## Cross-cutting tests

In addition to the 60 semantic cases, test contracts: deterministic formats and locations; exit codes 0/1/2; invalid configuration; a project without Git using `--base`; an inaccessible base; a partial clone with a missing object and no download; an incompatible baseline; exceptions with reasons and stale exceptions; line changes preserving identity; collisions; lost coverage in the base; an untested version; special error/global-error entries; a mixed project; effect arguments evaluated during render; a helper shared between effect and render; a client component loaded through literal `next/dynamic` with `ssr: false`; client calls to `revalidatePath` and `cookies`; server `useReducer`; a `NEXT_PUBLIC_` key declared secret; a substituted private client read without a false leak diagnostic.

For PRs, build fictional Git history: a valid base, a PR that changes an import and breaks an unchanged file, preexisting debt, aggravation, and reappearance of a resolved problem. It must block only new/aggravated findings according to policy. Also test rule/exclusion changes and protected policy.

For privacy, use a fictional sentinel literal as a secret and search for it in stdout, stderr, JSON, Markdown, errors, and every emitted file: zero occurrences. Include secret literals in invalid files and configuration too. Demonstrate that `.env` and confidential environment values are not read as analysis inputs, and that the process does not make network requests or execute application scripts.

Module-retention controls independently build a consumed pure export beside an unconsumed `server-only` star reexport, an unconsumed named reexport, and an uncalled API wrapper reached through a barrel: these retain incompatible dependencies and Next rejects them. TypeScript unused ordinary imports and imports used only in a type annotation require both configuration variants: `verbatimModuleSyntax: true` retains the restricted dependency and fails; false elides it and passes. An explicit type import passes in both configurations. Guard checks use the same app configuration as the independent Next build. Guard reports the module/import restriction without claiming execution of an uncalled function or publication of an unused value.

Resolver controls include explicit `.js` resolving literally in bundler mode and to `.ts`/`.tsx` before `.js` in NodeNext mode; `.mjs` selecting unsupported `.mts`; app-root config taking precedence over nested configs; different consuming apps resolving the same helper differently; baseUrl runtime lookup; missing export subpaths; local workspace transpilePackages; and fs/promises imports. Add missing-directive error entries, use strict before a valid boundary directive, invalid parenthesized/template directives, exported client function references passed as props, encrypted action captures without an explicit leak, dynamic env keys/aliases/destructuring as limitations, and NODE_ENV without NSG006. Verify status, affected rules, and location for each control.

Policy/report controls cover React DOM versions, policy hashes/changedFields/effectiveRules, suppressionStatus, snapshot-labelled limits, unresolved current coverage preventing a resolved finding, base versions independent of current node_modules, Git --config inside the worktree rejected, source changes during reading, output symlinks, and failed output preserving the previous report. Every rule has an uncertified error request control; certification/default transitions use isolated synthetic ruleset metadata in tests without certifying the shipped ruleset.

## Measurement and acceptance

Measure TP, FP, and FN by rule and family: TP is a real problem correctly reported; FP is a nonexistent violation; FN is a supported known error that is not detected. A duplicate diagnostic does not count as another TP. Record out-of-scope cases separately; if the product promises a pattern, it cannot be reclassified as out of scope to hide an FN.

Precision = TP / (TP + FP). Recall = TP / (TP + FN). Do not confuse the proportion of false alerts with the false positive rate, whose denominator includes true negatives. A zero denominator produces `not evaluable`; it never produces 100%. Report counts, coverage, and sample uncertainty. Evaluate each supported known positive exactly once for recall; an unexpected limitation on that positive is an FN and a coverage failure. Count known partial/out-of-scope cases separately, outside the precision/recall denominators.

Fixed gates: at least 98% precision for blocking rules, at least 95% overall finding precision, and at least 90% recall for supported patterns. GuardLab must pass all 60 expectations before expanding pilots. These cases are initial regression coverage; they do not establish percentages in real repositories.

A rule is blocking-eligible exactly when all its required controls pass, no known blocking FP remains unresolved, its independent reserved corpus contains at least 50 reviewed emitted findings and at least 20 supported known positives, observed precision is >=98%, and observed recall is >=90%. The 50 findings provide the TP+FP precision denominator; the known positives provide the TP+FN recall denominator. The same independent case can contribute to both denominators, but duplicate diagnostics cannot enlarge either sample. Compute a 95% Wilson interval with z=1.96; the gate uses the observed estimate, does not require a 98% lower bound, and does not announce a statistical guarantee. Any missing sample, failed gate, or unsupported profile sets eligibility to false and the enabled level to `warn`. Certification applies only to patterns and versions actually evaluated.

The expanded corpus contains reproducible issues from open or authorized projects and independently authored variations of supported patterns. Its manifest fixes case IDs, source hashes, framework versions, expected results, and reviewer judgments before measurement. Each judgment records an independently checked dependency, SSR failure, rejected transfer, publication destination, or valid control; it cannot cite Guard output as its oracle. Development and reserved sets are disjoint. Cases used to fix a rule move to the development set; a repeated certification evaluation uses a new reserved set. Origin from an AI tool is recorded only with provenance evidence and is not an eligibility condition.

## Comparison and release gates

Required comparison: Next 16.3.8 build with Turbopack, TypeScript 6.0.3, ESLint 9.39.5/config Next 16.3.8, and Guard on the same variants. Add dependency-cruiser 18.5.0 for P01/P02/P04/N01/N03, with equivalent declared restrictions. Semgrep remains a product reference, not a dependency or executable benchmark in v0.1. For each tool/case, record exit status, detected rule/problem, primary location, dependency/value path availability, correction availability, wall time, and failure stage (static review, build, or runtime). Classify unrelated lint/type failures separately; they do not count as detection of the boundary error. Next build is the oracle for P01–P08 dependency/API rejection and P09–P16 SSR/serialization rejection. When a build does not exercise the failing route, start Next on loopback and request that route. P17–P20 additionally require fictional-value inspection at the client/publication destination; P18 exercises the actual referenced function return. P19 verifies the declared publication capability with a minimal client consumer without claiming an unused value was served. P21–P24 require an independent client-bundle check that the fictional private environment value is absent; their expected finding is functional incompatibility. Next build and TypeScript must accept N01–N24. Execution belongs to the lab, not the CLI.

Required budgets: local p95 <10 s for 1,000 sources, local p95 <30 s for 5,000, and PR p95 <60 s for two 5,000-source snapshots, on Linux with 2 vCPU and 4 GiB RAM. Peak process RSS must be <1 GiB in each scenario. Exclude installation, include parsing and reporting, and report bytes/edges. Take 20 runs per size with a cold engine cache. PRs analyze both full states, with the same process and budgets used in production. PR timing includes Git IO, with a separate breakdown; do not exclude it from the gate. If the budget is missed, profile and fix. v0.1 still uses no persistent cache.

Beta release requires the 60-case corpus, required subvariants and cross-cutting controls, overall observed precision >=95%, supported-pattern recall >=90%, all performance budgets, an installable tarball, and passing platform, framework, and benchmark jobs. Overall quality gates use an independent reserved corpus with at least 20 known positives per rule and at least 50 reviewed emitted findings across the six rules; publish per-rule counts even when an individual rule has insufficient findings for blocking certification. Rules that do not meet individual certification retain warn. Record build/lint overlap, unique confirmed detections, and trace/recommendation completeness; commercial adoption is not a release gate.

## Lab matrix and protocol

Semantic matrix: Next 16.3.8/React 19.3.0, Node 24.21.0, npm 11.19.0, and Turbopack. The main corpus uses TS/TSX in app. The src/app matrix repeats P01/P05/P09/P13/P17/P21 and N01/N05/N09/N13/N17/N21. The JS/JSX matrix repeats the same IDs; N01 uses a JSDoc import type in its JSX entry and retains the TypeScript server helper; it has no runtime import. P22 also has an `.mjs` helper variant. U05 has the two exact subvariants specified above.

Each fixture has a case.json conforming to case.v1. Required fields: schemaVersion 1, id from the P/N/U catalog, nullable ruleId, nonempty description, projectVariant (relative variant path), preconditions, expectedStatus finding/clean/partial, expectedFindings, expectedLimits, and nullable correctedCase (relative corrected-variant path). preconditions is `{nextVersion, reactVersion, reactDomVersion, typescriptVersion, contexts}`; versions are exact strings, contexts uses the Architecture enum. expectedFindings entries are `{ruleId, severity, confidence, location, symbol, traceSymbols}`; location uses the report location shape, symbol identifies the enclosing lexical owner of the primary location (`<module>` outside a function; otherwise slash-separated function/class names). traceSymbols is a nonempty ordered subsequence required in the emitted evidence; additional evidence steps are permitted. Manifest locations and symbols come from the fixture source, independently of Guard output. expectedLimits entries are `{code, location, affectedRules}` with nullable location and the report enums. No unknown fields are valid. A positive has one primary expected finding and a correctedCase; clean/partial have no findings. Clean requires no limits; partial requires at least one. Corrections use a clean manifest and require no limits for the corrected supported pattern.

Materialize each mutation in an isolated temporary directory from a fixed base, with its own exact manifests/lockfile and shared workspace symlinks that remain inside the temporary scan root; do not use 60 simultaneously invalid routes in one app. For each positive, check the manifest and diagnostic, apply its correction, and verify disappearance while preserving functional behavior. For valid controls, Next build and tsc must accept the variant; ESLint is advisory and must not define semantic fixture truth. For compilation errors, record the exit code and location independently of Next's exact message. For render errors, execute Next only in the lab and request the route using loopback fetch. For explicit leaks, confirm the path with fictional source/value and observe the destination when executable; never use the engine result as the sole oracle.

Corrections retain the operation being demonstrated. Removing the reached dependency or replacing the page with an unrelated constant is insufficient. Each corrected variant must have complete Guard coverage, build successfully, and serve its route with HTTP 200. The correction matrix is:

| Cases | Required corrected behavior |
| --- | --- |
| P01–P04 | Read the dependency in a Server Component; preserve the data render or server API operation. |
| P05–P08 | Execute the original hook or client-only dependency behind a valid client boundary. |
| P09–P12 | Keep the browser read in an effect, with an SSR-safe initial value. |
| P13–P16 | Keep the Client Component and replace the rejected prop with a real Server Function, DTO, plain object, or registered symbol. |
| P17–P20 | Keep the client view or action, transmit a public DTO, and remove the confidential publication entry. The corrected P18 function returns the public DTO when invoked. |
| P21–P24 | Evaluate private configuration on the server and render or transfer only a derived public configuration status. |

Apply these corrections to every required language/layout variant. Check expected rendered content and absence of the fictional secret in the HTTP response. Browser interaction is a separate behavior check; an HTTP response alone does not prove effect execution or button interaction in a browser.

Reserved corpus for certifying each blocking rule: at least 50 independent reviewed findings for that rule and at least 20 known positives to estimate recall, outside the 60 development cases. Include variations of aliases, types, contexts, and fields, not 50 copies differing only in names. Reserved cases are not used to tune rules; a correction requires reserving new cases for the repeated evaluation. Save TP/FP/FN and Wilson intervals per rule. Certification is mechanical: all controls pass, no unresolved known blocking FP, observed precision >=98%, recall >=90%, and minimum sample sizes met; otherwise warn.

Benchmark: generate two deterministic datasets with seed 42, 1,000/5,000 sources averaging 4 KiB, up to three imports per source, two RSC roots and two client roots, 10% shared modules, and zero errors. Also create Git history with 5,000 sources in each input state. Change one import destination in the first `floor(0.01 * (5000 - 4)) = 49` nonentry sources, retaining all source files in both inventories. Report reached source counts separately; an import edit can make a helper unreachable. Run 20 times after one uncounted warmup; use a new process without engine cache on each run. For p95, sort ascending and select the one-based element ceil(0.95*n), which is sample 19 of 20; measure peak RSS externally, not heapUsed. Run on Linux with Docker limits of 2 CPU/4 GiB and save system and Git versions. Missing container constraints or fewer than 20 measured runs marks the result ineligible for acceptance. The one uncounted warmup is followed by 20 new processes; no parsed state survives between samples. The benchmark runner writes counts, bytes, edge counts, wall times, peak RSS, platform/runtime/Git versions, and exit status to JSON for RESULTS.md.
