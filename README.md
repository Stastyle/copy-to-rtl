# Copy to RTL

A lightweight Windows clipboard monitor that shows copied text **right-to-left**, so
mixed Hebrew/English content pasted from LTR apps (Claude, ChatGPT, Gemini, …) is
readable. Optionally renders common Markdown as styled HTML.

> Built with [Electron](https://www.electronjs.org/). Windows only — it reads the
> active window title via PowerShell to decide whether a copy came from a monitored app.

## Features

- **RTL viewer** — copied text is displayed right-to-left with proper Hebrew layout.
- **Markdown styling** — toggle between raw text and a styled view supporting
  `**bold**` / `*bold*`, `_italic_`, `` `code` ``, `~~strikethrough~~`, `#`/`##`/`###`
  headers, `-` lists, and `| pipe | tables |`.
- **App filtering** — only copies made while a *monitored* app is in focus open the
  viewer. Claude is enabled by default; Gemini, ChatGPT, Copilot, and Grok are built in
  and toggleable, and you can add custom apps by window-title keyword.
- **Always on top**, light/dark theme, one-click copy, and a clipboard pause toggle.
- **Single instance** — launching again focuses the existing window instead of opening
  a second one.
- **Remembers its window size and position** between launches (default size is 30% of
  your screen width × 70% of its height).
- **System tray** — quick access to Show Window, Select Monitoring, Enable Monitoring,
  and Quit.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 18+ and npm (for development / building)

## Run from source

```bash
npm install
npm start
```

To stop any running instances:

```bash
npm run stop
```

## Build a Windows executable

```bash
npm run package
```

This produces an unpacked build at `release/copy-to-rtl-win32-x64/`. Run it via
`copy-to-rtl.exe` — to move or share it, copy the **whole folder** (it bundles the
Electron runtime). See [build.mjs](build.mjs) for the packaging config.

## Usage

1. Launch the app. The RTL viewer window opens and starts watching the clipboard.
2. Copy text in a monitored app (Claude by default). The viewer shows it right-to-left.
3. Toolbar controls:
   - **Select Monitoring** — choose which apps trigger the viewer, or add your own by
     window-title keyword.
   - **Always on top** — keep the window above other apps.
   - **📋** — copy the displayed text back to the clipboard.
   - **Style** — toggle Markdown styling on/off.
   - **🌙 / ☀️** — toggle dark/light theme.
   - **Clear** — empty the viewer.
   - Click the **title** (or the tray "Enable Monitoring" item) to pause/resume
     clipboard monitoring. A green dot means active, red means paused.
4. Closing the window quits the app completely.

## How monitoring works

Every 200 ms the app checks the clipboard. When the text changes, it reads the
foreground window title and matches it (case-insensitively) against the keyword list of
each **enabled** app. If a keyword matches, the copy is shown; otherwise it's ignored.

## Data & settings

User settings live outside the app folder, under `%AppData%\copy-to-rtl\`:

- `monitored-apps.json` — your monitored-app list and toggles.
- `window-state.json` — last window size/position.

## Project structure

| File | Purpose |
| --- | --- |
| `main.js` | Electron main process — window, tray, clipboard polling, lifecycle. |
| `preload.js` / `monitoring-preload.js` | Context-isolated IPC bridges. |
| `renderer.js` | Viewer UI logic and the Markdown renderer. |
| `index.html` / `styles.css` | Viewer window markup and styling. |
| `apps-store.js` | Monitored-app storage and matching. |
| `monitoring-settings.*` | "Select Monitoring" settings window. |
| `foreground-title.ps1` | Reads the active window title (Win32 via PowerShell). |
| `build.mjs` | Packages the Windows executable. |

## License

[MIT](LICENSE) © Stas Meirovich
