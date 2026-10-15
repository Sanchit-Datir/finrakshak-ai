# Architecture

```
Browser (React) ──Auth/App Check──▶ Callable Functions ──▶ Firestore
                                          │
                                          └──▶ Vertex AI (Gemini, via ADC)
```

- The browser reads/writes Firestore only where security rules allow (owner-scoped); privileged and AI operations go through callables.
- `packages/shared` is the contract: zod schemas used for client validation, callable I/O, and Firestore read validation.
- Environments: `default` project is a placeholder; create separate `dev` / `prod` projects and alias them in `.firebaserc`.
