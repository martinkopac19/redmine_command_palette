# Changelog

## 0.5.0

- **Closed issues are struck through and greyed** in the results, the same way
  Redmine shows them everywhere else. Until now the only clue was the status
  buried in the grey second line, so an archived issue looked exactly like a live
  one. *Closed* follows Redmine's own closed-status flag, so a new status is
  classified automatically.
- **Two new prefixes: `o ` (open issues only) and `c ` (closed issues only)**,
  alongside the existing `i`/`p`/`u`/`f`. Closed issues used to only sink to the
  bottom of the list, which on a real backlog is not enough — searching
  *"webhook"* here matches 3 open issues and 15 closed ones, and the list holds
  15 results. The prefixes apply to searching by issue number too: `o 55310`
  will not find an issue that is closed.
- **The prefix hint fits on one line.** With six prefixes the old wording
  ("Search only one type — type the letter, space, then the query…") wrapped onto
  three lines and shouted louder than the shortcut line above it; it is now
  shorter and set in a smaller, lighter type.

## 0.4.2

- **The `i/p/u/f` prefixes now explain themselves.** The footer said
  *"prefixes: i/p/u/f + space"*, which told you nothing about what the letters do —
  they narrow the search to a single type. It now spells it out: *i = issues,
  p = projects, u = users, f = saved filters*, with an example. The behaviour is
  unchanged; only the hint is.

## 0.4.1

- **`Cmd/Ctrl + K` is now contextual** (like Linear): with text selected in the
  rich editor it goes to the editor and inserts a link — the shortcut most people
  expect there. Without a selection, or outside the editor, it opens the palette.
- **`Cmd/Ctrl + Shift + K`** always opens the palette, whatever the context.

## 0.4.0

- **Opens from the native header search** — clicking or focusing Redmine's
  top-right search box now opens the command palette, and any text already
  typed there is carried straight over.
- **Show old search results** — a link at the bottom of the palette jumps to
  Redmine's classic full-text search (`/search?q=…`) for the current text, so
  the old search is always one click away.

## 0.3.0

- **Sub-issue / parent management** as context actions on the open issue:
  - *Add sub-issue* — opens a pre-filled *New issue* form parented to the current
    issue (use Redmine's native *Create and add another* to add several in a row).
  - *Set parent…* — search and pick an issue to make it the parent (applied via
    Redmine's bulk-update).
  - *Remove parent* — shown only when the issue has a parent; clears it.
  - Shown only when the user has the matching permission (`add_issues` /
    `manage_subtasks`); all writes go through Redmine so authorization is enforced.

## 0.2.0

- **Context actions** for the open issue (or ticked issues in a list): change
  status / assignee / priority via a quick sub-picker, applied through Redmine's
  native bulk-update (respects workflow and permissions).
- **Save as View** — `Alt + V` (and the *Save current view…* command) saves the
  current issue-list filters as a Redmine saved query via the native save flow.
- **Quick filter** — `F` (and the *Add filter…* command) focuses Redmine's
  native *Add filter* selector on issue lists.
- Hardened the `Cmd/Ctrl + K` binding (single capture-phase handler) so it
  overrides the browser's built-in `Ctrl + K` more reliably.

## 0.1.0

- Initial release: `Cmd/Ctrl + K` / `/` command palette with fuzzy search across
  visible issues, projects, people and saved views (ID, label and phrase
  matching; scope prefixes; open-first / relevance ranking), quick navigation
  commands, pre-filled quick create (`C`) and recent issues.
