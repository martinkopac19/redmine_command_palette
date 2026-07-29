# Changelog

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
