# Redmine Command Palette (Previo)
# Linear-style command line (Cmd/Ctrl+K) + fuzzy search + quick actions.
# JS overlay injektovaný na každú stránku + malý backend controller.
# Lokálne, cez session + CSRF (žiadny externý servis). Bez zásahu do jadra.

require_relative 'lib/command_palette/hooks'

Redmine::Plugin.register :redmine_command_palette do
  name 'Redmine Command Palette (Previo)'
  author 'Martin Kopáč'
  description 'Linear-style command palette (Cmd/Ctrl+K): fuzzy search across visible projects, quick navigation, context actions and quick create.'
  version '0.4.0'
  url 'https://github.com/martinkopac19/redmine_command_palette'
  requires_redmine version_or_higher: '5.0'
end
