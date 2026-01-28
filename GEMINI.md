This is a mono-repo for my PWA projects.

mono/ is a note taking app
readium/ is a reading app
ui/ is a shared UI that I reuse across projects

We use:
- SolidJS and TypeScript
- Regular .css files for styling
- Biome for code formatting and linting
- Vite for building
- Dexie for offline first data persistence
- Google and Dropbox for cloud sync

The apps are meant to work mostly on mobile safari in fullscreen mode (PWA).
But on desktop via Chrome as well.

When I ask you to make changes, please:
- Don't run dev server, assume it's already running (mono runs on 3000, readium on 3001)
- Go for minimal amount of code
- Don't add comments just to comment what's going on
