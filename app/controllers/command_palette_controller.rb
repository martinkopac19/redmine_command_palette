class CommandPaletteController < ApplicationController
  before_action :require_login
  accept_api_auth :search, :options

  # anglické + sk/cz stopwords (parita s Linear + naše jazyky)
  STOPWORDS = %w[
    a an and are as at be but by for if in into is it no not of on or such that the
    their then there these they this to was will with
    the úkol úloha task issue ticket tiket redmine
    som si sa na do od po pre za the a v vo zo ku ktor ktorý kde ako
    je som sme ste su sú bol bola boli menili zmenili nastavili robili
    kde kdy kde section sekcii sekcia
  ].freeze

  def search
    q = params[:q].to_s.strip
    scope = params[:scope].to_s
    # stav úlohy je vlastná os, nezávislá od `scope` (ten hovorí TYP: issue/projekt/človek/pohľad)
    state = params[:state].to_s # '', 'open', 'closed'
    groups = []
    if q.present?
      groups << group('issues',   find_issues(q, state)) unless scope.present? && scope != 'i'
      groups << group('projects', find_projects(q)) unless scope.present? && scope != 'p'
      groups << group('users',    find_users(q))    unless scope.present? && scope != 'u'
      groups << group('queries',  find_queries(q))  unless scope.present? && scope != 'f'
    end
    render json: { groups: groups.reject { |g| g[:items].empty? } }
  end

  # Možnosti pre kontextové sub-pickery (status/priority/assignee)
  def options
    issue = params[:issue_id].present? ? Issue.visible.find_by_id(params[:issue_id]) : nil
    items =
      case params[:kind]
      when 'status'
        if issue
          ([issue.status] + issue.new_statuses_allowed_to(User.current)).compact.uniq
                                                                        .map { |s| { id: s.id, label: s.name } }
        else
          IssueStatus.sorted.map { |s| { id: s.id, label: s.name } }
        end
      when 'priority'
        IssuePriority.active.map { |p| { id: p.id, label: p.name } }
      when 'assignee'
        users = issue ? issue.assignable_users : []
        [{ id: '', label: "(#{l(:label_none)})" }] + users.map { |u| { id: u.id, label: u.name } }
      else
        []
      end
    render json: { items: items }
  end

  # Friendly pre-filled create: /command_palette/new?title=&priority=High&assignee=me&project=&tracker=&version=&category=&parent=
  def new_issue
    project = resolve_project(params[:project]) ||
              Project.allowed_to(User.current, :add_issues).order(:lft).first
    return render_404 unless project

    ip = {}
    ip[:subject]          = params[:title]       if params[:title].present?
    ip[:description]      = params[:description] if params[:description].present?
    ip[:priority_id]      = resolve_priority(params[:priority]) if params[:priority].present?
    ip[:assigned_to_id]   = resolve_user_id(params[:assignee]) if params[:assignee].present?
    ip[:tracker_id]       = resolve_tracker(project, params[:tracker]) if params[:tracker].present?
    ip[:fixed_version_id] = resolve_version(project, params[:version]) if params[:version].present?
    ip[:category_id]      = resolve_category(project, params[:category]) if params[:category].present?
    ip[:parent_issue_id]  = params[:parent] if params[:parent].present?

    redirect_to new_project_issue_path(project, issue: ip.compact)
  end

  private

  def group(key, items)
    { key: key, title: l("label_cp_group_#{key}", default: key.capitalize), items: items }
  end

  def tokens(q)
    q.downcase.scan(/[\p{L}\p{N}]+/u)
     .reject { |t| t.length <= 1 || STOPWORDS.include?(t) }
     .uniq.first(12)
  end

  # state: '' = všetko, 'open' = len otvorené, 'closed' = len uzavreté.
  # „Uzavreté" = issue_statuses.is_closed (u nás Closed / Resolved / Rejected) — nie zoznam
  # názvov natvrdo, takže nový stav sa zaradí sám. issues.closed_on sa použiť NEDÁ: pri
  # znovuotvorení úlohy sa nenuluje.
  def find_issues(q, state = nil)
    state = state.to_s
    out = []
    seen = {}
    push = lambda do |i|
      return if i.nil? || seen[i.id]
      seen[i.id] = true
      out << issue_item(i)
    end
    # ID alebo PROJ-123 / proj123 → koncové číslice = globálne issue id
    if (m = q.match(/(\d+)\s*\z/))
      found = Issue.visible.find_by_id(m[1].to_i)
      # prefix o/c platí aj na priamu zhodu ID — používateľ ho napísal výslovne
      found = nil if found && state.present? && found.closed? != (state == 'closed')
      push.call(found)
    end
    toks = tokens(q)
    if toks.any?
      it = Issue.table_name
      st = IssueStatus.table_name
      # tokeny sú len [alfanum] (viď #tokens) → bezpečné inline do SQL
      conds = toks.map do |t|
        "(LOWER(#{it}.subject) LIKE '%#{t}%' OR LOWER(#{it}.description) LIKE '%#{t}%')"
      end
      base_scope = Issue.visible.joins(:status)
      # podmienka ide na UŽ existujúci join — Issue.open by pridal druhý joins(:status)
      base_scope = base_scope.where(issue_statuses: { is_closed: state == 'closed' }) if state.present?
      rows = base_scope.where(conds.join(' AND '))
                       .reorder(Arel.sql("#{st}.is_closed ASC, #{it}.updated_on DESC"))
                       .limit(15).to_a
      # AND nič nenašiel → OR fallback, ranking podľa počtu zhodných tokenov
      if rows.empty? && toks.size > 1
        score = conds.map { |c| "(CASE WHEN #{c} THEN 1 ELSE 0 END)" }.join(' + ')
        rows = base_scope.where(conds.join(' OR '))
                         .select("#{it}.*, (#{score}) AS rcp_score")
                         .reorder(Arel.sql("rcp_score DESC, #{st}.is_closed ASC, #{it}.updated_on DESC"))
                         .limit(15).to_a
      end
      rows.each { |i| push.call(i) }
    end
    out.first(15)
  end

  def issue_item(i)
    pident = i.project.identifier
    { type: 'nav',
      label: "#{pident}-#{i.id}  #{i.subject}",
      sub: "#{i.status.name} · #{i.project.name}#{i.assigned_to ? " · #{i.assigned_to.name}" : ''}",
      url: "#{base}/issues/#{i.id}",
      issue_id: i.id,
      # strojový príznak pre klienta (zošednutie) — status.name je len text a je preložený
      closed: i.closed? }
  end

  def find_projects(q)
    pt = Project.table_name
    Project.visible.active
           .where("LOWER(#{pt}.name) LIKE ? OR LOWER(#{pt}.identifier) LIKE ?", "%#{q.downcase}%", "%#{q.downcase}%")
           .order("#{pt}.name").limit(6)
           .map { |p| { type: 'nav', label: p.name, sub: p.identifier, url: "#{base}/projects/#{p.identifier}" } }
  end

  def find_users(q)
    User.active.where(type: 'User').like(q).order(:lastname).limit(6)
        .map { |u| { type: 'nav', label: u.name, sub: u.login, url: "#{base}/users/#{u.id}" } }
  end

  def find_queries(q)
    qt = Query.table_name
    IssueQuery.visible.where("LOWER(#{qt}.name) LIKE ?", "%#{q.downcase}%").order("#{qt}.name").limit(6).map do |query|
      pid = query.project_id
      url = pid ? "#{base}/projects/#{query.project.identifier}/issues?query_id=#{query.id}" :
                  "#{base}/issues?query_id=#{query.id}"
      { type: 'nav', label: query.name, sub: l(:label_cp_saved_view), url: url }
    end
  end

  # ---- resolvers pre pre-filled create ----
  def resolve_project(v)
    return nil if v.blank?
    Project.visible.where("id = ? OR LOWER(identifier) = ? OR LOWER(name) = ?",
                          v.to_i, v.downcase, v.downcase).first
  end

  def resolve_priority(v)
    IssuePriority.active.detect { |p| p.name.casecmp?(v.to_s) }&.id
  end

  def resolve_user_id(v)
    return User.current.id if v.to_s.casecmp?('me')
    User.active.where(type: 'User').like(v).first&.id
  end

  def resolve_tracker(project, v)
    project.trackers.detect { |t| t.name.casecmp?(v.to_s) }&.id
  end

  def resolve_version(project, v)
    project.shared_versions.detect { |ver| ver.name.casecmp?(v.to_s) }&.id
  end

  def resolve_category(project, v)
    project.issue_categories.detect { |c| c.name.casecmp?(v.to_s) }&.id
  end

  def base
    Redmine::Utils.relative_url_root.to_s
  end
end
