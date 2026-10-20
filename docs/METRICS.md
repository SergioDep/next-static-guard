# Code metrics `nsg-metrics-1`

Every scan adds a `codeMetrics` object to the JSON report and a summary to the terminal and Markdown reports. The metrics describe the analyzed code; they do not change findings, severities, coverage, or the exit code.

The scope is the set of source files reached by the contextual graphs of the analyzed entries (`app/` routes, layouts, handlers, and the modules they import). JSON modules are excluded. The application is never executed, and no source text or confidential value is written to the report: only counts, ratios, file paths, and function names.

## Definitions

| Id | Metric | Report field | Definition |
| --- | --- | --- | --- |
| M-01 | Lines of code | `loc`, `files[].loc` | Physical lines occupied by at least one syntax token. Comments, JSDoc, blank lines, and whitespace-only JSX text do not count. |
| M-02 | Cyclomatic complexity | `cyclomatic` | Per function: 1 + `if`, loops, `catch`, ternaries, non-default `case`, and each `&&`, `\|\|`, `??`. Per file: sum of its functions plus module-level decisions. Nested functions are measured separately. |
| M-03 | Cognitive complexity | `cognitive` | Adaptation over the TypeScript AST: `if`, ternary, `switch`, loops, and `catch` add 1 + current nesting; `else if` and `else` add 1; each run of equal logical operators adds 1 (parentheses do not break a run); labeled `break`/`continue` add 1. |
| M-04 | Maximum nesting | `nesting.max` | Deepest nesting of `if`, loops, `switch`, and `try`. An `else if` chain stays on the same level; plain blocks add nothing. |
| M-05 | Halstead volume | `halsteadVolume.total` | N × log2(n) per file, where N is the number of leaf tokens and n the number of distinct operators and operands. |
| M-06 | Maintainability index | `maintainability` | max(0, min(100, (171 − 5.2 ln V − 0.23 CC − 16.2 ln LOC) × 100 / 171)) per file; `null` for files without code lines. The report gives the mean and minimum. |
| M-07 | Efferent coupling | `coupling` | Distinct runtime import destinations of a file (static, re-export, and literal dynamic imports). Type-only imports, elided bindings, and resources such as CSS are excluded. |
| M-08 | Independent dependency cycles | `independentCycles` | E − V + 1 for every strongly connected component of the local import graph that contains a cycle (Tarjan). |
| M-09 | Duplication | `duplication` | Lines covered by exact token blocks of at least 50 tokens spanning at least five lines that occur at least twice without overlapping, divided by M-01. The search uses at most 200,000 tokens; beyond that `partial` is `true`. |
| M-10 | Boundary crossings | `boundaryCrossings` | Distinct import edges from a server context to a `'use client'` module, or from a client context to a `'use server'` module. |
| M-11 | Client surface | `clientSurface` | Lines of code in files that execute in `client-browser`, divided by M-01. |
| M-12 | Sensitive exposure | `exposure` | Declared confidential sources (`sensitive.env`, `sensitive.exports`) that appear as the source of an unsuppressed NSG005 finding, divided by the declared sources. `null` without declarations. |
| M-13 | Findings density | `findingsPerKloc` | Unsuppressed findings per 1,000 lines of code, by severity. |

Ratios and averages are rounded to three decimals.

## Interpretation

M-01 to M-09 are conventional size, complexity, and structure measures adapted to TypeScript and JSX; values are comparable between scans of this tool and protocol, not with other tools that use different token or decision rules. M-10 to M-13 are specific to the server–client boundary and depend on the same contexts and declarations used by the rules.

The metrics support comparing a change before and after a correction, or an application before and after an AI-assisted change. They are not quality thresholds and do not decide whether a change is acceptable.
