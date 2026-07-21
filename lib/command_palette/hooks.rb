module CommandPalette
  class Hooks < Redmine::Hook::ViewListener
    # CSS + konfigurácia (kontext stránky) do <head>
    def view_layouts_base_html_head(context = {})
      return '' unless User.current.logged?

      project = context[:project]
      issue   = safe_current_issue(context)
      cfg = {
        base:              Redmine::Utils.relative_url_root.to_s,
        projectId:         (project && project.persisted? ? project.id : nil),
        projectIdentifier: (project && project.persisted? ? project.identifier : nil),
        issueId:           (issue ? issue.id : nil),
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
      javascript_include_tag('command_palette', plugin: 'redmine_command_palette').html_safe
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
