# Next Static Guard Product and Rules

The required behavior of v0.1. [Architecture](ARCHITECTURE.md) defines interfaces and algorithms; [Validation](VALIDATION.md) defines acceptance tests. These contracts apply to every implementation deliverable in [Plan](PLAN.md).

## User and expected outcome

The primary user is a developer who uses AI in Next.js projects and reviews pull requests. They want to detect changes that mix server and client responsibilities before merging them.

**Next Static Guard detects supported server–client boundary violations in Next.js pull requests and reports the dependency or data path and a correction.** Its first release adds an automated warning check before merging. It evaluates the resulting code regardless of author or AI provenance.

Each finding includes its rule, location, severity, confidence, comparison status, ordered evidence path, and a specific correction. Evidence uses file paths and symbolic names. A correction preserves the component's intended interaction or server operation. Every report states analyzed scope and limitations, including reports with no findings. The CLI recommends changes without modifying source files.

## MVP scope

v0.1 detects three classes of boundary errors:

1. Server-exclusive dependencies reached from client code.
2. APIs used in an incompatible context or execution phase.
3. Unsupported values or sensitive data sent across the boundary.

The v0.1 matrix is **Next.js 16.3.8, React and React DOM 19.3.0, App Router, and standard Turbopack**. Supported sources are `.js`, `.jsx`, `.ts`, `.tsx`, and ESM `.mjs` helpers; `app`/`src/app`, tsconfig/jsconfig aliases, reexports, and npm workspaces with accessible sources. Supported conditions are listed in [Architecture](ARCHITECTURE.md#resolution-and-context). Any different, prerelease, or unknown version produces `unsupported-version` and partial coverage; the entire 16.x branch is not automatically treated as equivalent. [S8](RESEARCH.md#s8), [S20](RESEARCH.md#s20)

Pages Router, MDX, CommonJS, custom resolution, complete analysis of external packages, Edge rules, general authorization, complexity, duplication, CVEs, autofix, IDE integration, and a hosted service are outside v0.1. A mixed project has its App Router analyzed and its exclusions listed. Coverage is complete only within the supported scope.

## Context model

Classification depends on the path from entry points and the specific use. A shared module can be valid in both graphs. Importing code, transmitting props, and passing a Server Function reference are distinct edges. Client Components can also render on the server; their effects and events have separate execution phases. [S1](RESEARCH.md#s1), [S2](RESEARCH.md#s2), [S3](RESEARCH.md#s3)

`use server` identifies Server Functions; it is not a generic label for every server file. A prop name, function type, or `Action` suffix does not establish that condition. Transitive client dependencies do not require their own `use client` directive.

## Rules

IDs are stable. Each rule must have documentation, a positive case, a valid control, and an explanation of its analysis limits. Blocking requires the certification predicate in [Validation](VALIDATION.md).

| ID | Detection condition | Result and correction |
| --- | --- | --- |
| [NSG001](rules/NSG001.md) | A runtime dependency path from a client entry reaches `server-only`, a retained import or use of `headers`/`cookies` from `next/headers` or `revalidatePath` from `next/cache`, or a file-system entry point (`fs`, `node:fs`, or either `/promises` form). | `high/high`: separate server access and UI; use a DTO or Server Function. Keep a small, versioned API table; do not prohibit all of `next/*` or every Node module. |
| [NSG002](rules/NSG002.md) | A Server Component path without a client boundary reaches `client-only`, retains an import of React's `useState`/`useEffect`/`useReducer` or Next's `useRouter`, or uses one of those resolved APIs. | `high/high`: move interaction into a small Client Component. Identify the imported symbol, including aliases; do not infer a hook from its name. |
| [NSG003](rules/NSG003.md) | A direct read of the unshadowed identifier `window`, `document`, or `localStorage` occurs without protection during module evaluation or rendering with confirmed server execution. Includes state initializers and `useMemo` callbacks executed during render. | `high/high`: move the read to an effect/event or add a dominating `typeof window` guard. Adding `use client` alone does not necessarily fix the problem. |
| [NSG004](rules/NSG004.md) | A prop from a Server Component to a Client Component contains an ordinary server-created function, custom class instance, null-prototype object, or local symbol with a known origin. | `high/high`: pass supported data, create the handler on the client, or use an actual Server Function. Check nested properties; do not apply JSON-only criteria. |
| [NSG005](rules/NSG005.md) | Declared confidential data has a verified path to client props, the return value of a client-referenced Server Function, a value export toward the client, or a recognized public configuration entry. | `critical/high` for secrets; `high/high` for private data. Reduce the DTO, keep the secret on the server, and review previous exposure. Never print values. |
| [NSG006](rules/NSG006.md) | Client-reachable code reads a static `process.env` key without `NEXT_PUBLIC_` and without recognized publication in configuration. | `medium/high`, functional warning: move the read to the server. Do not claim the value leaked; substitution of private variables can break logic. |

In the table, `severity/confidence` assumes all required evidence is available. NSG006 with unresolved environment publication is the only medium-confidence finding in v0.1: retain its medium severity and report the configuration limitation. For every other rule, missing required evidence produces a coverage limitation and no finding.

Module restrictions follow retained runtime imports and reexports, including unconsumed barrel exports. Explicit `import type`, `export type`, and type-only specifiers do not create runtime edges. In TypeScript, unused bindings and bindings used only in types are elided when the effective `verbatimModuleSyntax` is false; true preserves ordinary imports. JavaScript imports retain their module dependencies. The consuming app configuration determines this behavior. Value-export selection is tracked separately from module reachability. Next rejects the listed incompatible API imports before their functions are called; ordinary function bodies remain subject to execution-phase analysis. Unknown export identity produces `uncertain-runtime`. Valid Server Function references stop client propagation into their implementation, even if that implementation uses `server-only`. [S30](RESEARCH.md#s30)

NSG003 excludes reads inside effect or event callbacks that execute only in the browser, or branches guarded by `typeof window !== 'undefined'`. It checks arguments evaluated before the callback is registered. General hydration differences are outside this rule. API and phase basis: [S9](RESEARCH.md#s9), [S10](RESEARCH.md#s10).

NSG004 accepts React-supported types and references when their contents are valid; Date, Map, Set, Promise, and React elements are not errors by themselves. A handler created and used within the client does not cross the boundary either. [S2](RESEARCH.md#s2)

NSG004 checks Server Component props sent to Client Components. Server Function arguments and return-value serialization checks are outside this rule. NSG005 checks the confidentiality of explicit returns from client-referenced Server Functions. Passing a Server Function reference does not itself transmit its implementation or prove a disclosure. [S3](RESEARCH.md#s3), [S4](RESEARCH.md#s4)

NSG005 uses only declarations of environment keys, exported symbols, and field paths. Sensitivity comes from explicit declarations; names and regular expressions do not establish it. An unknown transformation produces a limitation; it is not assumed safe or unsafe. Data flow and its limits are fixed in [Architecture](ARCHITECTURE.md). Data minimization and public configuration: [S4](RESEARCH.md#s4), [S5](RESEARCH.md#s5), [S6](RESEARCH.md#s6).

Importing a helper that reads private environment variables does not prove exposure of the value: distinguish actual server evaluation and transmission of its result from evaluation in the client bundle with environment substitution. Only server-evaluated transmission or a recognized publication sink supports NSG005. A declared confidential key in `next.config.env` is a publication-policy finding even when no consuming client read is known; the message identifies that configuration sink and does not claim an observed runtime disclosure. NSG006 has high confidence only when the publication policy is resolved; unknown dynamic configuration lowers confidence and adds a limitation.

## Severity and confidence

Severity describes impact: `critical` for transmitting declared secrets or configuring them for publication, `high` for confirmed breakage, transmitting declared private data, or configuring it for publication, `medium` for NSG006 functional errors. `info` is reserved in the report schema; none of the six rules emits it. Partial coverage is a limitation, not a severity. Confidence describes evidence: `high` requires resolved context, origin, destination, and path; `medium` is reserved for NSG006 when configuration leaves publication unresolved. Do not report numerical confidence.

Coverage limitations are separate records. An untested version, unknown import, or unreadable source prevents presenting the analysis as complete. List the file, reason, and affected rules; `--strict-coverage` returns 2 for any in-scope limitation, including comparison uncertainty. Without it, limitations are reported without independently failing the scan.

## Usage and CI policy

Install the CLI as a development dependency, run `next-static-guard scan`, review evidence, fix issues, and add PR comparison to CI as specified in [Installation](INSTALLATION.md#github-actions-integration). Commands and exit codes are defined in [Architecture](ARCHITECTURE.md#cli-contract).

Local analysis shows all findings. PR analysis compares both complete graphs: a new import can introduce a violation in an unchanged file. CI blocks new or aggravated findings with `high`/`critical` severity, `high` confidence, and a rule enabled for blocking. Existing debt and warnings remain visible without blocking on them. Execution or configuration errors must never be presented as a clean result.

Ruleset 1.1.0 defaults every rule to `warn`. An NSG001–NSG005 rule becomes blocking-eligible only when its certification predicate passes; its next released ruleset defaults it to `error`. Explicit `off` or `warn` overrides remain available. Certification follows [Validation](VALIDATION.md#measurement-and-acceptance). NSG006 defaults to `warn` and cannot block. Explicit `off` disables its findings. Certification and default changes require a ruleset version increment; a user flag cannot certify a rule. PRs use the base policy unless an explicit protected config is supplied. Findings whose novelty cannot be determined are `unverified`, produce a warning, and do not automatically block. Strict coverage does return 2 for that uncertainty.

Exceptions are entries in next-static-guard.json, keyed by rule and finding, with a required reason and `false-positive` or `accepted-risk` status. Remove stale entries explicitly. Runs do not create exceptions or accept new debt. References for gradual adoption: [S13](RESEARCH.md#s13), [S14](RESEARCH.md#s14).

## Privacy and maintenance

The engine runs locally, without an LLM, telemetry, or source transmission. It reads required sources and metadata; `.env` values are excluded, and application code, scripts, and repository configuration are not executed. Reports and logs contain names and locations, never confidential literals or code snippets.

Distribution: one installable npm tarball, open source under MIT. Support uses repository issues and contributions, without an SLA. Every rule contribution includes evidence, negative controls, and declared compatibility. Registry publication, hosted reports, accounts, and billing are outside v0.1.

## Authorization scope

General authorization is outside v0.1. A boundary finding does not determine who is allowed to call an endpoint or access a resource. Authorization requires application-specific permissions and can reside in the data access layer. The presence of `auth()` does not establish authorization; its local absence does not prove a vulnerability either. Server Function analysis covers boundary references and explicit returns. [S4](RESEARCH.md#s4)
