import type ts from 'typescript';
export const RULE_IDS = ['NSG001', 'NSG002', 'NSG003', 'NSG004', 'NSG005', 'NSG006'] as const;
export type RuleId = typeof RULE_IDS[number];
export type Context = 'rsc' | 'client-ssr' | 'client-browser' | 'server-function' | 'server-handler' | 'unreachable' | 'unknown';
export type RuleLevel = 'off' | 'warn' | 'error';
export type Category = 'secret' | 'private';
export type Severity = 'critical' | 'high' | 'medium' | 'info';
export type LimitCode = 'unsupported-version' | 'unresolved-import' | 'conditional-resolution' | 'dynamic-config' | 'unsupported-syntax' | 'unknown-value' | 'unknown-phase' | 'source-excluded' | 'source-budget' | 'uncertain-runtime' | 'comparison-incomplete' | 'fingerprint-collision';
export interface Point { line: number; column: number; offset: number }
export interface Location { file: string; start: Point; end: Point }
export interface Limit { code: LimitCode; location: Location | null; affectedRules: RuleId[]; snapshot: 'current' | 'base'; projectRoot: string | null }
export interface Evidence { kind: 'import' | 'reference' | 'api' | 'phase' | 'value' | 'source' | 'sink'; location: Location | null; symbol: string | null }
export interface Finding { ruleId: RuleId; message: string; severity: Severity; confidence: 'high' | 'medium'; location: Location; contexts: Context[]; evidence: Evidence[]; recommendation: string; fingerprint: string; status: 'new' | 'existing' | 'aggravated' | 'unverified'; suppressed: boolean; suppressionStatus: 'false-positive' | 'accepted-risk' | null; blocking: boolean }
export interface SensitiveExport { file: string; export: string; field: string[]; category: Category }
export interface Exception { ruleId: RuleId; fingerprint: string; status: 'false-positive' | 'accepted-risk'; reason: string }
export interface Policy { schemaVersion: 1; projectRoots: string[]; exclude: string[]; rules: Record<RuleId, RuleLevel>; sensitive: { env: {name: string; category: Category}[]; exports: SensitiveExport[] }; exceptions: Exception[] }
export interface ProjectVersions { root: string; nextVersion: string | null; reactVersion: string | null; reactDomVersion: string | null; typescriptVersion: string | null }
export interface SnapshotFile { path: string; text: string; hash: string; bytes: number }
export interface ProjectSnapshot { root: string; files: ReadonlyMap<string, SnapshotFile>; inventory: ReadonlySet<string>; aliases: ReadonlyMap<string, string>; limits: readonly Limit[]; failures: ReadonlyMap<string, LimitCode>; versions: ReadonlyMap<string, ProjectVersions>; kind: 'current' | 'base' }
export interface Unsupported { file: string; feature: 'pages-router' | 'metadata' | 'proxy' | 'instrumentation' | 'edge' | 'mdx' | 'commonjs' }
export interface RuleState { requested: RuleLevel; effective: RuleLevel; certified: boolean }
export interface Report { schemaVersion: 1; toolVersion: string; rulesetVersion: string; fingerprintVersion: 1; policyHash: string; policy: {source: 'default' | 'current' | 'base' | 'explicit'; currentPolicyHash: string | null; changedFields: string[]; ignoredCurrentConfig: boolean; effectiveRules: Record<RuleId, RuleState>}; projects: ProjectVersions[]; scope: { roots: string[]; exclusions: string[]; unsupported: Unsupported[] }; sensitivityConfigured: boolean; coverage: {status: 'complete' | 'partial'; limits: Limit[]}; comparison: {mode: 'none' | 'git' | 'baseline'; baseCommit: string | null; status: 'complete' | 'partial' | 'not-applicable'}; findings: Finding[]; summary: {total: number; new: number; existing: number; aggravated: number; unverified: number; suppressed: number; blocking: number; resolved: string[]}; metrics: {durationMs: number; sourceCount: number; edgeCount: number; sourceBytes: number} }
export interface SourceNode { file: SnapshotFile; ast: ts.SourceFile; directive: 'client' | 'server' | null; invalidDirective: boolean }
