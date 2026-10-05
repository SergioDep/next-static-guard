# Next Static Guard Source References

Primary sources for the framework behavior, dependency constraints, and comparison tools used by v0.1. Requirements are defined in [Product](PRODUCT.md), [Architecture](ARCHITECTURE.md), and [Validation](VALIDATION.md).

## Comparison tools

| Tool | Documented behavior | Comparison scope |
| --- | --- | --- |
| ESLint with Next configuration | React/Next lint rules, including no-async-client-component. [S11](#s11) | Run Next core-web-vitals and TypeScript configurations on the same fixtures. Record rule IDs and locations. |
| dependency-cruiser | Declarative dependency restrictions and graph reports. [S12](#s12) | Run declared client-to-server restrictions for P01/P02/P04/N01/N03. Record dependency paths. |
| Semgrep | Base-reference scans for new findings. [S13](#s13) | Product reference for PR comparison. Semgrep is not an MVP dependency or a required executed comparison. |

Quality thresholds, sample sizes, and operating budgets in Validation are fixed product requirements. Measured detection quality and tool overlap belong in `docs/RESULTS.md`. The sources below establish framework behavior and package constraints; they do not measure the prevalence of AI-authored errors.

## Semantics and security sources

### S1

[Next.js Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary). Imports determine code boundaries; props transmit data; Server Functions cross as references. Client code can participate in server rendering. Function types and `Action` prop names do not establish Server Function identity.

### S2

[React use client](https://react.dev/reference/rsc/use-client). Defines transitive client dependencies, shared-module uses, and supported serialized prop types, including built-ins, references, elements, and promises.

### S3

[React use server](https://react.dev/reference/rsc/use-server). Server Functions are async; module-level directives permit client imports. Arguments and returns cross the network through serialization. Return values use the supported Client Component prop types.

### S4

[Next.js Data Security](https://nextjs.org/docs/app/guides/data-security). Documents minimal DTOs, action returns, authorization in the data access layer, and encrypted inline-action captures. An encrypted capture alone does not establish plaintext disclosure.

### S5

[Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components). Documents `server-only`/`client-only` markers and substitution of private environment variables in client code.

### S6

[Next.js next.config env](https://nextjs.org/docs/app/api-reference/config/next-config-js/env). A configured `env` key is eligible for build-time public substitution regardless of its prefix. The API remains supported for backward compatibility; its declaration is a publication-policy sink.

### S7

[Next.js TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript) and [Microsoft Using the Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API). Microsoft documents the JavaScript Compiler API used by TypeScript 6. Next's TypeScript 7 integration uses the project-local CLI; it does not provide that API to this engine.

### S8

[Next.js security release](https://nextjs.org/blog/september-2026-security-release). Identifies 16.3.8 as a supported security update. The [Next 16.3.8 manifest](https://github.com/vercel/next.js/blob/v16.3.8/packages/next/package.json) allows React/React DOM 19.x in its peer dependencies. The pinned profile uses Next 16.3.8 and React/React DOM 19.3.0. Peer compatibility and executed compatibility tests are distinct.

### S9

[Next.js headers](https://nextjs.org/docs/app/api-reference/functions/headers), [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [useRouter](https://nextjs.org/docs/app/api-reference/functions/use-router), and [revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath). Establish the contexts of these APIs. The restriction applies to the documented symbols.

### S10

[React useEffect](https://react.dev/reference/react/useEffect). Effect callbacks do not run during server rendering.

## Tool and runtime sources

### S11

[Next.js ESLint](https://nextjs.org/docs/app/api-reference/config/eslint). Linter catalog and configuration; comparison baseline.

### S12

[dependency-cruiser rules reference, v18.5.0](https://github.com/sverweij/dependency-cruiser/blob/v18.5.0/doc/rules-reference.md). Defines declarative restrictions over resolved dependency graphs and violation severity.

### S13

[Semgrep diff aware scans](https://docs.semgrep.dev/kb/semgrep-ci/trigger-diff-scans-env-var). Base-reference configuration for incremental review.

### S14

[ESLint Bulk Suppressions](https://eslint.org/docs/latest/use/suppressions). Documents explicit suppression files and pruning entries after problems disappear.

### S15

[ESLint Exit Codes](https://eslint.org/docs/latest/use/command-line-interface#exit-codes). Distinguishes results containing errors from operational failures; reference for exit codes 0/1/2.

### S16

[Node.js Releases](https://nodejs.org/en/about/previous-releases). Node 24 is the LTS runtime used by the tool. S20 identifies the exact runtime and bundled npm.

### S17

[Vitest Getting Started](https://vitest.dev/guide/). Runtime and Vite requirements are specified by the versioned metadata in S20. CLI tests use the Node environment.

### S18

[TypeScript Modules Reference](https://www.typescriptlang.org/docs/handbook/modules/reference). Defines paths, bundler resolution, package exports, and type-information lookup. Type lookup and runtime destination lookup are distinct operations.

### S19

[Next.js error convention](https://nextjs.org/docs/app/api-reference/file-conventions/error). `error` and `global-error` are Client Component entry points.

### S20

Versioned npm metadata provides engines and peer constraints for the pinned stack. Source for runtime and bundled npm: [Node index](https://nodejs.org/dist/index.json).

Exact engine versions: [TypeScript 6.0.3](https://registry.npmjs.org/typescript/6.0.3), [Ajv 8.20.0](https://registry.npmjs.org/ajv/8.20.0), [picomatch 4.0.7](https://registry.npmjs.org/picomatch/4.0.7), [semver 7.8.5](https://registry.npmjs.org/semver/7.8.5). TypeScript 6 supplies the JavaScript Compiler API used by the engine.

Development: [npm 11.19.0](https://registry.npmjs.org/npm/11.19.0), [Vitest 5.0.3](https://registry.npmjs.org/vitest/5.0.3), [Vite 8.3.2](https://registry.npmjs.org/vite/8.3.2), [Node types 24.19.1](https://registry.npmjs.org/@types/node/24.19.1), [picomatch types 4.0.3](https://registry.npmjs.org/@types/picomatch/4.0.3), [semver types 7.8.0](https://registry.npmjs.org/@types/semver/7.8.0).

Lab: [Next 16.3.8](https://registry.npmjs.org/next/16.3.8), [React 19.3.0](https://registry.npmjs.org/react/19.3.0), [React DOM 19.3.0](https://registry.npmjs.org/react-dom/19.3.0), [React types 19.3.0](https://registry.npmjs.org/@types/react/19.3.0), [React DOM types 19.3.0](https://registry.npmjs.org/@types/react-dom/19.3.0), [ESLint 9.39.5](https://registry.npmjs.org/eslint/9.39.5), [Next config 16.3.8](https://registry.npmjs.org/eslint-config-next/16.3.8), [dependency-cruiser 18.5.0](https://registry.npmjs.org/dependency-cruiser/18.5.0).

Next configuration declares ESLint >=9, but its [react 7.37.5](https://registry.npmjs.org/eslint-plugin-react/7.37.5), [import 2.32.0](https://registry.npmjs.org/eslint-plugin-import/2.32.0), and [jsx-a11y 6.10.2](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2) plugins support 9, not 10. The comparison uses ESLint 9.39.5 and a lockfile that pins transitive dependencies.

Lab markers: [server-only 0.0.1](https://registry.npmjs.org/server-only/0.0.1) and [client-only 0.0.1](https://registry.npmjs.org/client-only/0.0.1). The engine interprets their known semantics without evaluating their package conditions.

### S21

[Node parseArgs](https://nodejs.org/docs/latest-v24.x/api/util.html#utilparseargsconfig), [execFile](https://nodejs.org/docs/latest-v24.x/api/child_process.html#child_processexecfilefile-args-options-callback), [Ajv JSON Schema](https://ajv.js.org/json-schema.html#draft-2020-12), and [picomatch](https://github.com/micromatch/picomatch). Define native argument parsing, subprocess invocation without a shell, draft 2020-12 validation, and glob matching.

### S22

[npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/), [TypeScript NodeNext](https://www.typescriptlang.org/tsconfig/module.html), and [verbatimModuleSyntax](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html). Define package entries, ESM compilation, lockfile installation, and separation of type imports.

### S23

[Turbopack 16.3.8 source](https://github.com/vercel/next.js/blob/v16.3.8/turbopack/crates/turbopack-resolve/src/resolve.rs), with [raw source](https://raw.githubusercontent.com/vercel/next.js/v16.3.8/turbopack/crates/turbopack-resolve/src/resolve.rs); [Turbopack configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack), [pageExtensions](https://nextjs.org/docs/app/api-reference/config/next-config-js/pageExtensions), and [Webpack 16.3.8 configuration](https://github.com/vercel/next.js/blob/v16.3.8/packages/next/src/build/webpack-config.ts). Supplies the default extension order. NodeNext substitutions and app-specific config handling are detailed in S27. Unmodeled resolver customizations produce coverage limitations.

### S24

[Git merge-base](https://git-scm.com/docs/git-merge-base), [cat-file](https://git-scm.com/docs/git-cat-file), and [rev-parse](https://git-scm.com/docs/git-rev-parse). Support a common base and reading objects without checkout. The [Git 2.47.0 source](https://github.com/git/git/blob/v2.47.0/git.c) verifies availability of `--no-lazy-fetch`: the minimum required to prevent implicit downloads of missing objects. [Git environment controls](https://git-scm.com/docs/git) define suppression of global/system config and inherited transport variables. Compare through a virtual snapshot with one merge-base and the base policy.

### S25

[Next.js Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading). Documents ssr false in Client Components, without permitting it in Server Components. Only the literal pattern with resolved client context suppresses that dynamic component's SSR use; another static import can still make it server-reachable.

### S26

CI actions and commit pins:

| Action | Release | Commit |
| --- | --- | --- |
| [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1) | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| [setup-node](https://github.com/actions/setup-node/releases/tag/v7.0.0) | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| [upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.1) | v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |

### S27

[Next client resolver context](https://github.com/vercel/next.js/blob/v16.3.8/crates/next-core/src/next_client/context.rs), [Next server resolver context](https://github.com/vercel/next.js/blob/v16.3.8/crates/next-core/src/next_server/context.rs), [Turbopack tsconfig handling](https://github.com/vercel/next.js/blob/v16.3.8/turbopack/crates/turbopack-resolve/src/typescript.rs), and [runtime resolution and its tests](https://github.com/vercel/next.js/blob/v16.3.8/turbopack/crates/turbopack-core/src/resolve/mod.rs). The app fixes its tsconfig path. The resolver retains baseUrl behavior and enables output-extension substitution only for an explicit NodeNext moduleResolution. `verbatimModuleSyntax` controls TypeScript import elision; module dependencies and selected value exports are separate facts. With NodeNext moduleResolution, `.js` tries `.ts`, `.tsx`, `.js`; `.mjs` tries `.mts`, `.mjs`. [TypeScript 6 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) describe checker changes to baseUrl; those do not replace the bundler's runtime behavior.

### S28

[Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables). Public variable substitution applies to direct static reads, not variable keys or aliases of process.env. Client reads and server-to-client transmission therefore use different evidence. NODE_ENV is framework-defined and is not a private application variable.

### S29

[Node file-system API](https://nodejs.org/docs/latest-v24.x/api/fs.html). Identifies callback/synchronous fs exports and the fs/promises entry point. The NSG001 summary covers both forms with and without the node: prefix.

### S30

[Next RSC directive parser](https://github.com/vercel/next.js/blob/v16.3.8/crates/next-custom-transforms/src/transforms/react_server_components.rs). Recognizes use client/use server within an initial string-literal directive sequence, permits earlier string directives, rejects conflicting boundaries, and distinguishes parenthesized strings from directives. Its import checks reject incompatible named React/Next APIs at module analysis, independently of function invocation. Runtime barrel and unused-import controls are defined in Validation.

## Version changes

Framework, dependency, API-summary, and CI-action updates require an explicit version change, compatibility checks, and affected regression tests. Keep exact package and source-tag references; never substitute latest automatically.
