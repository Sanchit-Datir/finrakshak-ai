import { defineConfig } from 'vitest/config';

// Started by `firebase emulators:exec` (root `npm run test:emulators`), which sets FIRESTORE_EMULATOR_HOST.
export default defineConfig({
  test: { include: ['src/**/*.emulator.test.ts'], fileParallelism: false },
});
