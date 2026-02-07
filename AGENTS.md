# Repository Guidelines

## Project Structure & Module Organization
- `mono/` – notes PWA (SolidJS + TypeScript)
- `readium/` – reading PWA
- `ui/` – shared UI library consumed by the apps
- Source code lives in `*/src`. Static assets are in `*/public`. Build outputs go to `*/dist` (generated).
- Shared styles live in `ui/src/` (e.g., `theme.css`, `typography.css`, `reset.css`).

## Build, Test, and Development Commands
Run workspace commands from the workspace directory (`mono/` or `readium/`).

```bash
npm install            # install workspace deps at repo root
npm run check          # format + lint via Biome
npm run build:mono     # production build for mono
npm run build:readium  # production build for readium

# workspace-local (run inside mono/ or readium/)
npm run dev            # start Vite dev server (mono: 3000, readium: 3001)
npm run build          # build for production
npm run serve          # mono only: preview production build
npm run preview        # readium only: preview production build
```

## Coding Style & Naming Conventions
- TypeScript + SolidJS; keep code minimal and avoid explanatory comments.
- Styling uses plain `*.css` files; prefer shared tokens from `ui/src/theme.css`.
- Formatting/linting is enforced by Biome (`biome.json`): spaces, 120-column lines, double quotes, organized imports. Run `npm run check` before committing.
- Components use `PascalCase` (e.g., `Header.tsx`), hooks use `useX` (e.g., `useModalStack.ts`).

## Testing Guidelines
- No automated test framework is configured today. If you add tests, co-locate them under `src/` and use a clear naming pattern like `*.test.ts(x)` or `*.spec.ts(x)`, then document the new test command in `package.json`.

## Commit & Pull Request Guidelines
- Commit messages are short and imperative; sentence case is common. Conventional prefixes like `fix:` or `style:` appear in history but are optional.
- PRs should explain what/why, link relevant issues, and include screenshots for UI changes. Note any manual testing (e.g., `mono` on `http://localhost:3000`, `readium` on `http://localhost:3001`).

## Configuration & Secrets
- `mono/.env.example` documents required Google OAuth vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). Keep secrets out of git.

## Agent-Specific Instructions
- Do not start dev servers; assume they are already running.
- When testing the Mono editor, remember the first line is always the note title—use a second line for content checks.
