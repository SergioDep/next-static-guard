# Next Static Guard

Static analysis of server–client boundaries in Next.js, designed for teams developing with AI.

The CLI reviews pull requests for dependencies, APIs, and data that cross these boundaries incorrectly. Each finding identifies the location, explains the path, and recommends a correction.

It checks server-only dependencies reached by client code, client hooks reached by Server Components, browser globals used during server rendering, unsupported prop values, declared confidential data sent to the client, and private environment reads in client code. Reports include source locations, the dependency or data path, and a recommended change.

Confidentiality checks use your explicit declarations in `next-static-guard.json`. A minimal declaration is:

```json
{
  "schemaVersion": 1,
  "sensitive": {
    "env": [{ "name": "PAYMENT_TOKEN", "category": "secret" }]
  }
}
```

The engine runs locally without an LLM, telemetry, or application execution. It reports partial coverage when a required import, value, or framework profile cannot be established.

## Product contract

The warning-only beta candidate is `0.1.0-beta.1`, with ruleset `1.1.0`. Its six rules run as warnings. Blocking eligibility and beta acceptance are defined in [Validation](https://github.com/SergioDep/next-static-guard/blob/main/docs/VALIDATION.md).

v0.1 is a local CLI for Next.js **16.3.8**, React/React DOM **19.3.0**, App Router, and standard Turbopack. It provides six deterministic rules and terminal, JSON, and Markdown reports. It analyzes runtime dependencies, execution phases, and declared data transfers. Other framework versions receive partial coverage. It checks code from any author; identifying AI-generated code is outside scope. Analysis does not execute the application or send its contents to external services.

## Development documentation

| Document | What it defines |
| --- | --- |
| [Product and rules](https://github.com/SergioDep/next-static-guard/blob/main/docs/PRODUCT.md) | Target user, scope, six rules, severity, and CI behavior. |
| [Architecture and contracts](https://github.com/SergioDep/next-static-guard/blob/main/docs/ARCHITECTURE.md) | Exact versions, algorithms, CLI, configuration, and reports. |
| [Validation](https://github.com/SergioDep/next-static-guard/blob/main/docs/VALIDATION.md) | GuardLab's 60 semantic cases, required variants, quality samples, and acceptance criteria. |
| [Installation and CI](https://github.com/SergioDep/next-static-guard/blob/main/docs/INSTALLATION.md) | Build, package, configuration, reports, and CI usage. |
| [Development plan](https://github.com/SergioDep/next-static-guard/blob/main/docs/PLAN.md) | Implementation deliverables and required checks. |
| [Research](https://github.com/SergioDep/next-static-guard/blob/main/docs/RESEARCH.md) | Technical sources supporting the specification. |
| [Validation results](https://github.com/SergioDep/next-static-guard/blob/main/docs/RESULTS.md) | Executed checks, corpus measurements, performance, and release eligibility. |

Read Product, Architecture, Validation, then the implementation deliverables. Research is the source catalog.

## Run from source

Use Node 24.21.0/npm 11.19.0; Git comparison requires Git >=2.47.0.

```sh
npm ci
npm run check
node dist/cli/main.js scan /path/to/application
node dist/cli/main.js scan /path/to/application --base main --format json
```

Ruleset 1.1.0 uses warnings until rules pass independent certification. Exit 0 can include warnings or partial coverage; `--strict-coverage` requires complete coverage. Reports explain each finding and its correction without printing confidential values.

Generate an installable package with `npm pack` after building. See [Installation and CI](https://github.com/SergioDep/next-static-guard/blob/main/docs/INSTALLATION.md) for configuration, baseline use, and package installation.
