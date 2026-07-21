# Changelog

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
