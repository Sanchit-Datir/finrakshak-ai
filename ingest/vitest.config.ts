import { configDefaults, defineConfig } from 'vitest/config';

// Emulator tests need a running Firestore emulator; they run via `npm run test:emulators` (root).
// The synthetic generator's full 200-customer plan takes about 6 s per check on a loaded machine, so the
// default 5 s timeout failed intermittently; 30 s still ends a real hang.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '**/*.emulator.test.ts'], testTimeout: 30_000 },
});
