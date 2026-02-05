# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Monorepo for PWA projects targeting Mobile Safari (fullscreen PWA) and Desktop Chrome.

- **mono/** - Note taking app
- **readium/** - Reading app
- **ui/** - Shared UI library

## Tech Stack

- SolidJS + TypeScript
- Regular .css files for styling
- Biome for formatting and linting
- Vite for building
- Dexie for offline-first data persistence
- Google and Dropbox for cloud sync

## Commands

```bash
npm run check              # Run Biome linting/formatting (with auto-fix)
npm run build:mono         # Build mono app
npm run build:readium      # Build readium app

# Workspace-specific (run from workspace directory)
npm run dev                # Start dev server
npm run build              # Build for production
```

## Development

Dev servers run on:
- mono: http://localhost:3000
- readium: http://localhost:3001

Assume the dev server is already running - don't start it.

## Code Style

- Minimal code, no explanatory comments
- When testing the Mono editor, remember the first line is always the note name - add a second line to test other content
