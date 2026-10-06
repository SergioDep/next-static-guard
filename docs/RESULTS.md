# Next Static Guard Validation Results

The measurements below describe baseline commit `515ff4417ca80b8c9537a87c809720c91bfef5ac` and ruleset `1.0.0`. They are historical evidence, not certification of the current `0.1.0-dev.1` / ruleset `1.1.0` implementation. Current release evidence must identify the new engine and corpus hashes and repeat the applicable checks.

The development MVP is delivered as `0.1.0-dev.0`, ruleset `1.0.0`. All six rules are uncertified warnings. Beta release and blocking certification are ineligible because the independent reserved quality sample and macOS/Windows execution evidence are absent.

## Artifact and identity

- [Installable package](../artifacts/next-static-guard-0.1.0-dev.0.tgz): 81,579 bytes, 117 entries. SHA-256: `e6981399d8a2535c43fb2ae3c83d19f55a834528130152eef721a7c8210e6c61`.
- Engine identity: `f5c3ed4bf0cc60c8c2c20c2746d7d5c3a0e3ad5f5ec8409843aaf55a40342b59`. Benchmark and comparison results identify this same engine. The identity hashes sorted compiled JavaScript and schema JSON paths and bytes, using the runner's `dist/` and `schemas/` prefixes.
- GuardLab identity: `4b7837c77dd1774fb894c935ac7e07eb138a87f31b8469a14ac0edcf4ed343e0`. Hash input is every file under `tests/fixtures/guardlab`, including base, manifests, variants, and corrections; full relative POSIX paths are sorted by Unicode code point and each UTF-8 path precedes its original file bytes.
- Runtime: Node 24.21.0, npm 11.19.0, Git 2.47.0, Linux x64. Framework: Next 16.3.8, React/React DOM 19.3.0, standard Turbopack. Tools: TypeScript 6.0.3, ESLint 9.39.5/config Next 16.3.8, dependency-cruiser 18.5.0.

The package installed into an isolated consumer without development dependencies and produced the expected NSG006 warning with complete coverage and exit 0. Its contents are restricted to package.json, dist, schemas, README, and LICENSE. [Package verification](../artifacts/package-validation.json)

## Executed checks

| Check | Result |
| --- | --- |
| Typecheck, unit/integration tests, build | Passed; 188 tests across 10 files. |
| GuardLab semantic expectations | Passed; 60 semantic parents expanded into 87 manifests. |
| Corrected variants | Passed; 37 clean scans, successful Next builds, and HTTP 200 responses with expected content and no fictional secret value. |
| Framework checks | Passed; 121 distinct controls across originals, layout/language variants, import retention, and corrections. Explicit type imports pass with verbatimModuleSyntax both false and true. |
| Tool comparison | Passed; 73 original positive/clean variants. |
| Delivered tarball installation | Passed with runtime dependencies only. |
| Constrained performance | Passed; 20 measured runs per scenario. |
| Linux source execution | Passed. |
| macOS and Windows execution | Not measured; jobs are defined in CI. |

All 87 manifests match their authored expectations. The framework total counts distinct controls; repeated executions do not enlarge it. HTTP checks prove successful server rendering and the tested action return. Browser effect execution, button interaction, and general application behavior are not measured by an HTTP response.

## Controlled detection measures

The 87 manifests contain 37 known positives, 36 valid controls, and 14 deliberate partial-coverage cases. Guard reported each positive exactly once, reported no violations for valid controls, and produced the authored limitations for partial cases. Every positive has a correction with complete supported coverage. Partial cases and corrected duplicates are excluded from precision/recall denominators.

| Rule | TP | FP | FN | Designated clean controls | Precision | Recall | 95% Wilson interval for each rate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NSG001 | 6 | 0 | 0 | 6 | 100% | 100% | 60.97%–100% |
| NSG002 | 6 | 0 | 0 | 6 | 100% | 100% | 60.97%–100% |
| NSG003 | 6 | 0 | 0 | 6 | 100% | 100% | 60.97%–100% |
| NSG004 | 6 | 0 | 0 | 6 | 100% | 100% | 60.97%–100% |
| NSG005 | 6 | 0 | 0 | 6 | 100% | 100% | 60.97%–100% |
| NSG006 | 7 | 0 | 0 | 6 | 100% | 100% | 64.57%–100% |

Overall: TP=37, FP=0, FN=0; controlled precision and recall are 100%, with a 95% Wilson interval of 90.59%–100% for each rate. These are development regression measures on correlated fixture families, not estimates of real-repository accuracy or AI error prevalence. NSG006 positives are functional incompatibilities, not observed secret leaks. No independent reserved findings or positives have been reviewed; no rule meets certification sample requirements. [Counts and certification state](../artifacts/validation-summary.json)

## Independent framework evidence and comparison

Next rejects P01–P08 for dependency/API restrictions and P09–P16 during SSR or serialization. The required layout/language repetitions behave consistently. Next accepts N01–N24 and their required variants. Retained star/named reexports and an uncalled API wrapper preserve incompatible module restrictions. Unused and implicit-type TypeScript imports fail when retained with verbatimModuleSyntax true and pass when elided with false.

P17's fictional value appears in the client prop payload; P18's actual function returns the fictional confidential field through a loopback probe; P19's additional client consumer verifies configuration publication capability; P20's fictional export appears in the browser bundle. P19 establishes a publication policy finding, without asserting that an unused key was served. P21–P24 and their variants compile, but their private fictional environment value is absent from the client bundle. Corrections retain the demonstrated operation in its proper context and remove the rejected transfer or publication.

| Tool | Observed outcome |
| --- | --- |
| TypeScript | Exit 0 for all 73 variants; no boundary rejection. |
| ESLint/Next config | Exit 1 for 18 variants and exit 0 for 55. Reported rules concern hook naming, unused values, explicit any, unused expressions, or anonymous default exports. These results are separate from the fixture's boundary truth. |
| dependency-cruiser | Declared restrictions report P01/P02/P04 and accept N01/N03. Other cases were outside this comparison's declared graph rules. |
| Guard | 37 expected findings, 36 clean variants, complete supported coverage for all 73. Every finding has evidence and a recommendation. |
| Next | Expected compilation/prerender behavior and the fictional publication/substitution observations pass the independent framework assertions. |

[Comparison data](../artifacts/comparison-results.json) records case input hashes, exit statuses, locations, rule IDs, elapsed time for TypeScript/ESLint/Guard, Guard evidence/recommendation availability, and declared graph violations. Individual Next elapsed times and structured compiler locations were not recorded; framework assertions establish its observed outcomes. These comparisons support this controlled scope, not a general ranking of tools.

## Performance

Linux Docker, observed quota 2 CPU/4 GiB; Node 24.21.0/npm 11.19.0, Git 2.47.0, kernel 7.0.0-38-generic, seed 42. Each scenario has one uncounted warmup and 20 new-process measurements, without a persistent engine cache. p95 is sorted sample 19 of 20. Wall time includes parsing, reporting, and Git IO; peak RSS is measured externally with `/usr/bin/time`.

| Scenario | Reached sources | Analyzed bytes | Edges | Wall p95 | Maximum peak RSS | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| Local, 1,000 inputs | 1,000 | 4,096,000 | 4,893 | 5.35 s | 238.8 MiB | Passed |
| Local, 5,000 inputs | 5,000 | 20,480,000 | 24,692 | 9.13 s | 414.2 MiB | Passed |
| Git, 5,000 inputs per state | 9,997 | 40,947,715 | 49,375 | 7.90 s | 566.3 MiB | Passed |

The Git workload changes one import destination in 49 nonentry source files. Both input inventories retain 5,000 sources; three helpers become unreachable in the current graph, so the combined reached count is 9,997. Mean measured Git IO is 0.592 s and remains included in total time. Gates are <10 s/<30 s for local scenarios, <60 s for Git, and <1 GiB peak RSS for each. All pass. These synthetic workloads do not establish performance for every repository. [All 60 samples and system limits](../artifacts/benchmark-results.json)

## Reproduce

Use the pinned versions and Git minimum from [Installation](INSTALLATION.md).

```sh
npm ci
npm run check
npm run test:framework
npm run test:comparison
docker build -f tests/bench/Dockerfile -t next-static-guard-bench .
mkdir -p bench-results
docker run --rm --cpus 2 --memory 4g --user "$(id -u):$(id -g)" -v "$PWD/bench-results:/work/bench-results" next-static-guard-bench
npm pack --pack-destination artifacts
```

The development artifact passes the controlled corpus, framework, comparison, performance, and installation requirements. The [beta and per-rule gates](VALIDATION.md#measurement-and-acceptance) additionally require independent quality samples and executed platform jobs. Ruleset 1.0.0 retains warn; a configuration change cannot certify a rule.
