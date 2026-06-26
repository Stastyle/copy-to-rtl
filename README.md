# Copy to RTL

I read a lot of Hebrew in Claude, and the desktop app — like most chat apps built
with English in mind — lays text out left-to-right. Mixed Hebrew/English answers
end up scrambled: punctuation lands on the wrong side, lines read backwards, and you
burn more energy untangling the direction than actually reading the answer.

The obvious fix is to "just make Claude render right-to-left" — inject some CSS, patch
the Electron bundle, run a userscript in devtools. I didn't want to go anywhere near
that:

- I'm not cracking open Anthropic's app. I'd rather not poke at its internals, risk
  voiding support, or step on its terms of use.
- Claude updates constantly, and every update would wipe the patch. I'm not signing up
  to re-apply a hack forever.
- One bad injection and I've broken the app I actually depend on.

So **Copy to RTL never touches Claude at all.** It's a small, separate window that just
watches your clipboard. Select an answer in Claude, hit `Ctrl+C`, and it shows up here
laid out properly right-to-left. Nothing injected, nothing patched, nothing to redo
after the next update — and no way for it to break Claude itself.

It isn't Claude-only, either. ChatGPT, Gemini, Copilot, and Grok work the same way out
of the box, and you can add any other app by a keyword from its window title.

> Windows only. It figures out where a copy came from by reading the active window's
> title through a tiny PowerShell call — that's the one OS-specific bit.

## What it does

- Shows whatever you copy **right-to-left**, with proper Hebrew layout.
- Optionally styles common Markdown — `**bold**`/`*bold*`, `_italic_`, `` `code` ``,
  `~~strikethrough~~`, `#`/`##`/`###` headings, `-` lists, and `| pipe | tables |` —
  or shows the raw text if you'd rather. Toggle it with the **Style** button.
- Only reacts to copies from apps you've opted into. Claude is on by default; the
  others are a checkbox away under **Select Monitoring**, and custom apps are matched
  by a window-title keyword you provide.
- Stays out of the way: always-on-top, light/dark themes, one-click copy of what's
  shown, and a pause toggle for when you don't want it watching.
- Opens at 30% of your screen width × 70% of its height and remembers wherever you
  drag or resize it to next time.
- Only ever runs one copy of itself, and closing the window quits it for real — no
  stray process left running in the background.

## Getting it running

You'll need [Node.js](https://nodejs.org/) 18+ on Windows 10/11.

```bash
npm install
npm start
```

If something gets stuck, `npm run stop` kills any running instances.

## Building a standalone .exe

```bash
npm run package
```

That drops an unpacked build in `release/copy-to-rtl-win32-x64/`. Launch it with
`copy-to-rtl.exe`. To move or share it, copy the **whole folder** — it carries the
Electron runtime with it. The packaging setup lives in [build.mjs](build.mjs).

## Using it day to day

Launch it, then copy text in a monitored app (Claude, unless you've changed things).
The window pops up with your text the right way round. The toolbar has the rest:

- **Select Monitoring** — pick which apps trigger it, or add your own by keyword.
- **Always on top** — keep it floating above everything else.
- **📋** — copy the displayed text back to the clipboard.
- **Style** — switch between styled Markdown and raw text.
- **🌙 / ☀️** — dark or light.
- **Clear** — wipe the view.

Click the title (or the tray's **Enable Monitoring** item) to pause and resume. The
dot next to it is green when it's watching, red when it's paused.

## How it decides what to show

Roughly five times a second it checks whether the clipboard changed. When it has, it
reads the foreground window's title and compares it (case-insensitively) against the
keywords of each enabled app. Match found → it shows the text; no match → it ignores
it. That's the whole trick — it never touches the other app, it just notices what's in
front when you copy.

## Where your settings live

Everything's kept out of the app folder, under `%AppData%\copy-to-rtl\`:

- `monitored-apps.json` — your app list and toggles.
- `window-state.json` — the last window size and position.

## Project layout

The interesting files: [`main.js`](main.js) is the Electron main process (window, tray,
clipboard polling, lifecycle); [`renderer.js`](renderer.js) is the viewer UI and the
Markdown renderer; [`apps-store.js`](apps-store.js) handles the monitored-app list and
matching; [`foreground-title.ps1`](foreground-title.ps1) reads the active window title;
and [`build.mjs`](build.mjs) packages the executable. The `monitoring-settings.*` files
are the "Select Monitoring" window, and the `*preload.js` files are the
context-isolated IPC bridges.

## License

MIT — see [LICENSE](LICENSE). © Stas Meirovich
