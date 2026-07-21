# Redmine Command Palette

A [Linear](https://linear.app)-style **command palette** for Redmine. Press
`Cmd/Ctrl + K` from any page to search across everything you can see, jump
around, and act on issues — without leaving the keyboard.

Everything runs **inside your Redmine**: the palette talks to Redmine over your
existing session (cookie + CSRF token), so it never uses a personal API key and
**nothing is sent to any external service**. It touches **no core files** — it's
a plain plugin (a bit of JavaScript injected via view hooks plus one small
controller), so upgrades stay clean.

## Features

- **Cmd/Ctrl + K** (or `/`) opens the palette from any page; `Esc` closes it.
- **Fuzzy search across all projects you can see** — issues, projects, people
  and saved views, grouped and ranked (open issues first, most-relevant first).
  - Find an issue by **ID** (`55310`, `#55310` or the `proj-55310` style label)
    or by **words from its subject/description** — even a whole phrase.
  - Optional **scope prefixes**: `i ` issues · `p ` projects · `u ` people ·
    `f ` saved views (e.g. `p crm`).
- **Context actions** on the open issue (or the issues you've ticked in a list):
  change **status**, **assignee** or **priority** from a quick sub-picker. These
  go through Redmine's own bulk-update, so they fully respect workflow and
  permissions.
- **Sub-issue / parent management** on the open issue:
  - **Add sub-issue** — opens a pre-filled *New issue* form parented to the
    current issue (Redmine's native *Create and add another* adds several fast).
  - **Set parent…** — search and pick an issue to become the parent.
  - **Remove parent** — shown only when the issue has one.

  These appear only when you have the matching permission (`add_issues` /
  `manage_subtasks`).
- **Quick create** — `C` opens a pre-filled *New issue* form (carries the
  current project); the palette's *Create issue* command does the same.
- **Save as View** — `Alt + V` (or the *Save current view…* command) saves the
  current issue-list filters as a Redmine saved query, reusing Redmine's native
  save flow. Saved views then show up in the palette (`f` prefix).
- **Quick filter** — `F` (or the *Add filter…* command) jumps to Redmine's
  native *Add filter* selector on an issue list.
- **Recent issues** appear when the palette is empty.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Cmd/Ctrl + K` | Open / close the palette |
| `/` | Open the palette |
| `↑` / `↓` | Move selection |
| `Enter` | Open / run the selected item |
| `Esc` | Back (from a sub-picker) or close |
| `C` | New issue (pre-filled) |
| `Alt + V` | Save current issue-list filters as a view |
| `F` | Add filter (on issue lists) |

Shortcuts are ignored while you're typing in an input, textarea or editor.

> **Note on `Cmd/Ctrl + K` in a browser:** `Ctrl + K` is also a built-in
> browser shortcut (focus the address bar). The plugin overrides it while the
> page has focus. If you press it right after switching tabs — before clicking
> into the page — the browser may still grab it; just click into the page once,
> or use `/`.

## Requirements

- Redmine **5.0+** (developed and tested on **6.1.3**).
- **REST API enabled** (*Administration → Settings → API*).

## Installation

```bash
cd /path/to/redmine/plugins
git clone https://github.com/martinkopac19/redmine_command_palette.git
# restart Redmine (e.g. `touch tmp/restart.txt`, or restart the app server/container)
```

No database migrations. To update, `git pull` and restart Redmine.

## How it works

- A view hook (`view_layouts_base_html_head` / `view_layouts_base_body_bottom`)
  injects the palette's CSS/JS and a tiny `RCP_CONFIG` (current project / open
  issue id) on every page — only for logged-in users.
- A small `command_palette` controller provides:
  - `search` — grouped JSON results (issues / projects / people / saved views),
    scoped to what the current user may see (`Issue.visible`, `Project.visible`,
    …), with stopword filtering and relevance ranking.
  - `options` — workflow-aware statuses / assignable users / active priorities
    for the context sub-pickers.
  - `new` — a friendly pre-filled *New issue* redirect (resolves names → ids).
- All writes reuse Redmine's own endpoints (`/issues/bulk_update`,
  `/queries/new`) over the browser session with the CSRF token, so **existing
  authorization is never bypassed**.

## Privacy

Search and every action stay inside your Redmine instance over your own
session. No data leaves the server and no third-party service is involved.

## License

GPL-2.0 — see [LICENSE](LICENSE).
