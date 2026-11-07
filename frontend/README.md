# CodeCrew frontend

A responsive collaborative coding UI built with React, Vite, CSS, Monaco Editor, and Lucide icons.

## Run locally

From this folder:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd install` and `npm.cmd run dev`.

```sh
npm run build     # Production output in dist/
npm run preview   # Serve the production build
```

## Try the UI

- Enter a username and create a room to generate a local room ID.
- Enter a username and any nonempty room ID to join a simulated room.
- Use **Explore the editor** for a quick demo.
- Copy the room ID, view your mock crew, and switch between Python and JavaScript using the language selector or Explorer.
- Edit each language independently. Drafts and editor view states are preserved when switching languages within a session.
- Use **Run code**, Ctrl+Enter, or Cmd+Enter to display an execution placeholder in the terminal.
- Clear or collapse the terminal; on smaller screens, use the sidebar button to view collaborators and files.
- Leave the room to return home. Your username is retained until the page reloads.

All session data lives in React state. Leaving a room resets its drafts. Reloading resets the app. Rooms, connected users, and collaboration are simulated; no backend requests, synchronization, or remote execution are implemented. Monaco and its workers are bundled locally. Google Fonts enhance the typography, with system font fallbacks.

## Components

```text
src/
  App.jsx                       Local view and session state
  components/
    Brand.jsx                   Shared branding
    HomePage.jsx                Welcome screen and validated room form
    RoomPage.jsx                Workspace state and actions
    CodeEditor.jsx              Monaco theme, workers, models, and shortcuts
    UserSidebar.jsx             Mock collaborators and language files
    TerminalPanel.jsx           Placeholder output and terminal controls
  data/editor.js                Language metadata and starter drafts
  App.css                       Responsive page and workspace styles
  index.css                     Shared styles and fonts
```

## Browser checks

```sh
npm run test:e2e
```

Playwright starts the Vite dev server automatically. On Windows it uses the installed Microsoft Edge browser; elsewhere it uses Playwright Chromium (`npx playwright install chromium` if needed). Set `PLAYWRIGHT_CHANNEL` to select another installed browser, such as `chrome`.

The checks cover input validation, creating/joining/leaving rooms, clipboard copying, actual editor typing, separate language drafts, placeholder output, keyboard shortcuts, terminal controls, and layouts at 320px, 390px, and 768px.

The package override updates Monaco's pinned DOMPurify dependency to a patched compatible release.
