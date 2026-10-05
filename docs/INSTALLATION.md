# Installation and CI

Use Node 24.21.0 and npm 11.19.0. Git comparison additionally requires Git 2.47.0 or later. `.nvmrc` selects the development runtime.

## From source

```sh
npm ci
npm run check
node dist/cli/main.js scan /path/to/application
```

The scanner does not run project configuration or application scripts. Framework tests execute only the fictional GuardLab applications.

## Install the package

Create a tarball from the source checkout:

```sh
npm run build
npm pack
```

Install that tarball in an application:

```sh
npm install --save-dev /path/to/next-static-guard-0.1.0-dev.0.tgz
npx next-static-guard scan
```

The development package uses ruleset 1.0.0. All rules are uncertified and run as warnings; setting `error` cannot certify a rule. Exit 0 can include findings or partial coverage. Review the report's coverage and use `--strict-coverage` when complete coverage is required.

## Configuration

Save `next-static-guard.json` at the scan root:

```json
{
  "schemaVersion": 1,
  "sensitive": {
    "env": [{ "name": "PAYMENT_TOKEN", "category": "secret" }]
  }
}
```

Declare confidential keys and exports explicitly. Environment values and `.env` files are not inputs. Configuration is closed JSON; unsupported fields fail with exit 2.

## Reports and comparison

```sh
npx next-static-guard scan --format json --output guard-report.json
npx next-static-guard scan --format markdown
npx next-static-guard scan --baseline guard-report.json
npx next-static-guard scan --base origin/main
```

`--base` reads existing local Git objects and includes uncommitted changes. Fetch the base through the CI checkout step before scanning. In Git mode, policy and exceptions come from the merge-base. An explicit `--config` must be outside the worktree and applies to both snapshots. A saved baseline must match the policy, ruleset, fingerprint format, scope, and complete coverage.

The CLI writes the selected report to stdout unless --output is supplied; operational messages go to stderr. Exit codes: 0 for no blocking findings, 1 for blocking findings, 2 for operational errors or strict partial coverage. A report is written after successful analysis even when findings or strict coverage change the exit code. Output targets must be new files or existing Guard reports; input files and symlinks cannot be overwritten.

## GitHub Actions integration

Use this PR job after installing the package as a development dependency and committing the application lockfile:

```yaml
name: Boundary review
on: pull_request
permissions:
  contents: read
jobs:
  boundaries:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: 24.21.0
      - run: npm ci
      - name: Review server-client boundaries
        env:
          GUARD_BASE_REF: ${{ github.event.pull_request.base.sha }}
        run: node node_modules/next-static-guard/dist/cli/main.js scan --base "$GUARD_BASE_REF"
```

The v0.1 PR job uses the default warning policy and omits `--strict-coverage`. It fails for operational errors and reports findings and partial coverage for review. A repository can explicitly enable `--strict-coverage` to require complete supported coverage; that fails with exit 2 when analysis is partial. Rule certification controls eligibility for exit 1; configuration cannot certify a rule.

The repository's development workflow defines separate Linux/macOS/Windows, framework, and constrained benchmark jobs. Their required checks are specified in [Implementation](PLAN.md#5-validation-evidence-and-delivery).
