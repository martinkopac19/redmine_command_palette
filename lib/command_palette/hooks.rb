module CommandPalette
  class Hooks < Redmine::Hook::ViewListener
    # CSS + konfigurácia (kontext stránky) do <head>
    def view_layouts_base_html_head(context = {})
      return '' unless User.current.logged?

      project = context[:project]
      issue   = safe_current_issue(context)
      iproj   = issue ? issue.project : nil
      eff_project = (project && project.persisted? ? project : iproj)
      cfg = {
        base:              Redmine::Utils.relative_url_root.to_s,
        projectId:         (eff_project ? eff_project.id : nil),
        projectIdentifier: (eff_project ? eff_project.identifier : nil),
        issueId:           (issue ? issue.id : nil),
        parentIssueId:     (issue ? issue.parent_id : nil),
        canManageSubtasks: (iproj ? User.current.allowed_to?(:manage_subtasks, iproj) : false),
        canAddIssues:      (iproj ? User.current.allowed_to?(:add_issues, iproj) : false),
        meId:              User.current.id
      }
      out = +''
      out << stylesheet_link_tag('command_palette', plugin: 'redmine_command_palette')
      out << javascript_tag("window.RCP_CONFIG=#{cfg.to_json};")
      out.html_safe
    end

    # JS na koniec <body>
    def view_layouts_base_body_bottom(context = {})
      return '' unless User.current.logged?
      # filter_flow musí byť PRED paletou — paleta si ho pri otvorení hľadá.
      # Oba sú na konci <body>, takže natívne `availableFilters` zo zoznamu úloh
      # sú v tej chvíli už definované.
      out = +''
      out << javascript_include_tag('filter_flow', plugin: 'redmine_command_palette')
      out << javascript_include_tag('command_palette', plugin: 'redmine_command_palette')
      out.html_safe
    end

    private

    def safe_current_issue(context)
      c = context[:controller]
      iss = c && c.instance_variable_get(:@issue)
      iss.is_a?(Issue) && iss.persisted? ? iss : nil
    rescue StandardError
      nil
    end
  end
end
