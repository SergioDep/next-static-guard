# Changelog

## 0.1.0-dev.1

- Treat a Client Function called from server execution as an unknown result, without inventing server evaluation of its client implementation or a prop disclosure.

- Fix Git comparisons through symlinked roots on macOS and Windows.
- Preserve authored fixture line endings and use portable ESM test preloads.
- Reject cross-drive and cross-share paths outside Windows scan roots.
- Detect retained filesystem namespace imports, reexports, and literal dynamic imports.
- Track confidential data in React element props, children, and rendered Server Component results.
- Preserve declared sensitivity through default exports and reexport aliases.
- Resolve namespace reexports and explicit exports before star reexports.
- Add independent Next framework regressions and package repository metadata.

Ruleset 1.1.0 changes analysis semantics; baselines from ruleset 1.0.0 must be regenerated after review. Rules remain uncertified warnings.

## 0.1.0-dev.0

- Local App Router analysis for Next 16.3.8 and React/React DOM 19.3.0.
- Six deterministic boundary rules with recommendations and source locations.
- Terminal, JSON, and Markdown reports; strict coverage; exceptions.
- Baseline and merge-base comparison with protected policy.
- GuardLab positive, negative, partial, and correction cases.

Ruleset 1.0.0 retains warning levels until independent certification is complete. This development version is not a certified beta release.
