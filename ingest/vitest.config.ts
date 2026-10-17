import { configDefaults, defineConfig } from 'vitest/config';

// Emulator tests need a running Firestore emulator; they run via `npm run test:emulators` (root).
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '**/*.emulator.test.ts'] },
});
