# Security

Next Static Guard analyzes supported Next.js server/client boundaries locally. It reads source and package metadata, parses repository configuration as data, and reports names and locations. It does not execute application code, read `.env` values, send source to services, or provide a general authorization or vulnerability audit.

Use Node 24.21.0 or a later Node 24 release and Git 2.47.0 or later for comparisons. Supported Next.js and React versions, excluded features, and analysis limits are recorded in every report. Partial coverage requires review; `--strict-coverage` makes that state fail a CI check.

The published CLI contains only its runtime dependencies. Run `npm audit --omit=dev` to check that dependency surface. The development comparison lab currently inherits the unpatched [braces stack exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) through ESLint's Next plugin. It is absent from the packed CLI and the lab uses fixed, authored patterns. Reevaluate that development dependency when an upstream fix is published.

Report ordinary false positives, false negatives, and compatibility failures using the repository's issue templates, with a minimal example containing fictional data. For a security vulnerability, use GitHub private reporting when available or request a private contact channel from the maintainer before sharing sensitive details. Include the tool version, ruleset, platform, and a minimal reproduction.
