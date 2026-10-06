# Contributing

Use the runtime versions in `.nvmrc` and `docs/INSTALLATION.md`. Install with `npm ci` and run `npm run check`. Git comparison tests require Git 2.47.0 or later. `npm run test:framework` runs independent Next.js builds and HTTP checks; `npm run test:comparison` measures the authored corpus against the other lab tools. Constrained benchmarks use `tests/bench/Dockerfile`.

For an analysis change, add a positive regression, a valid control, and an independent framework check where the behavior can be executed. Author expected truth from source and framework behavior before measuring Guard. Keep fictional secrets out of public reports and logs. Preserve source bytes, line endings, and exact diagnostic locations.

Update the rule documentation and increment the ruleset version for a semantic change. Baselines from another ruleset are incompatible. Test-only and operational changes do not certify a rule. Certification needs the independent quality evidence defined in `docs/VALIDATION.md`.

Submit a pull request describing the concrete behavior and checks performed. Keep generated build output and temporary framework applications out of commits. Release results must match the implementation and corpus hashes of the artifact being evaluated.
