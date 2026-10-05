import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { projects: ['unit', 'integration', 'framework'].map(name => ({ test: { name, globalSetup: name === 'integration' ? ['tests/integration/setup.ts'] : [], environment: 'node', include: [`tests/${name}/**/*.test.ts`], testTimeout: name === 'framework' ? 120_000 : 20_000 } })) } });
