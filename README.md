# Next Static Guard

Static analysis of server–client boundaries in Next.js, designed for teams developing with AI.

The CLI reviews pull requests for dependencies, APIs, and data that cross these boundaries incorrectly. Each finding identifies the location, explains the path, and recommends a correction.

## Product contract

The development package is `0.1.0-dev.0`, with ruleset `1.0.0`. Its six rules run as warnings. Blocking eligibility and beta acceptance are defined in [Validation](docs/VALIDATION.md).

v0.1 is a local CLI for Next.js **16.3.8**, React/React DOM **19.3.0**, App Router, and standard Turbopack. It provides six deterministic rules and terminal, JSON, and Markdown reports. It analyzes runtime dependencies, execution phases, and declared data transfers. Other framework versions receive partial coverage. It checks code from any author; identifying AI-generated code is outside scope. Analysis does not execute the application or send its contents to external services.

## Development documentation

| Document | What it defines |
| --- | --- |
| [Product and rules](docs/PRODUCT.md) | Target user, scope, six rules, severity, and CI behavior. |
| [Architecture and contracts](docs/ARCHITECTURE.md) | Exact versions, algorithms, CLI, configuration, and reports. |
| [Validation](docs/VALIDATION.md) | GuardLab's 60 semantic cases, required variants, quality samples, and acceptance criteria. |
| [Installation and CI](docs/INSTALLATION.md) | Build, package, configuration, reports, and CI usage. |
| [Development plan](docs/PLAN.md) | Implementation deliverables and required checks. |
| [Research](docs/RESEARCH.md) | Technical sources supporting the specification. |
| [Validation results](docs/RESULTS.md) | Executed checks, corpus measurements, performance, and release eligibility. |

Read Product, Architecture, Validation, then the implementation deliverables. Research is the source catalog.

## Run from source

Use Node 24.21.0/npm 11.19.0; Git comparison requires Git >=2.47.0.

```sh
npm ci
npm run check
node dist/cli/main.js scan /path/to/application
node dist/cli/main.js scan /path/to/application --base main --format json
```

Ruleset 1.0.0 uses warnings until rules pass independent certification. Exit 0 can include warnings or partial coverage; `--strict-coverage` requires complete coverage. Reports explain each finding and its correction without printing confidential values.

Generate an installable package with `npm pack` after building. See [Installation and CI](docs/INSTALLATION.md) for configuration, baseline use, and package installation.
