import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ProjectModal } from '../components/EntityModals.jsx';
import Icon from '../components/Icon.jsx';
import { ProjectProgress } from '../components/Layout.jsx';
import TaskWorkspace from '../components/TaskWorkspace.jsx';
import { Avatar, EmptyState, ProgressBar } from '../components/ui.jsx';
import { useData } from '../store.jsx';
import { PROJECT_STATUSES, fmtDate, pct } from '../utils.js';

export function MyTasks() {
  const { me } = useData();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My Tasks</h1>
          <p className="muted">Everything assigned to you across all spaces.</p>
        </div>
      </div>
      <TaskWorkspace
        query={{ assignee: me.id }}
        showProject
        spaceFilter
        hideAssigneeFilter
        defaultGroup="due"
        defaultSubtasks
        defaults={{ assignee_ids: [me.id] }}
        storageKey="my-tasks"
      />
    </div>
  );
}

export function AllTasks({ calendar = false }) {
  const [params] = useSearchParams();
  const assignee = params.get('assignee') || '';
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{calendar ? 'Calendar' : 'All Tasks'}</h1>
          <p className="muted">{calendar ? 'Deadlines across every space. Drag to reschedule.' : 'Every task across Software, SEO, Marketing and Operations.'}</p>
        </div>
      </div>
      <TaskWorkspace
        key={assignee}
        query={{}}
        showProject
        spaceFilter
        initialAssignee={assignee}
        defaultView={calendar ? 'calendar' : 'list'}
        storageKey={calendar ? 'calendar' : 'all-tasks'}
        defaultSubtasks={calendar}
      />
    </div>
  );
}

export function SpacePage() {
  const { id } = useParams();
  const { spaces, projects, isManager, users } = useData();
  const [modal, setModal] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const space = spaces.find((s) => s.id === Number(id));
  if (!space) return <div className="page"><EmptyState icon="folder" title="Space not found" /></div>;
  const all = projects.filter((p) => p.space_id === space.id);
  const list = all.filter((p) => showArchived || p.status !== 'archived');

  return (
    <div className="page">
      <div className="page-head">
        <div className="title-with-icon">
          <span className="space-icon large" style={{ background: space.color }}>{space.name[0]}</span>
          <div>
            <h1>{space.name}</h1>
            <p className="muted">{space.description || 'No description'}</p>
          </div>
        </div>
        <div className="row-gap">
          <span className="muted small">{space.done_count}/{space.task_count} tasks done</span>
          {isManager && <button type="button" className="btn" onClick={() => setModal({ space_id: space.id })}><Icon name="plus" size={14} /> Project</button>}
        </div>
      </div>

      <div className="section-head">
        <h2>Projects</h2>
        {all.some((p) => p.status === 'archived') && (
          <label className="toggle"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        )}
      </div>
      {list.length ? (
        <div className="project-grid">
          {list.map((p) => {
            const st = PROJECT_STATUSES.find((s) => s.key === p.status);
            const owner = users.find((u) => u.id === p.owner_id);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="project-card" style={{ '--c': p.color }}>
                <div className="row-between">
                  <b className="ellipsis">{p.name}</b>
                  <span className="pill" style={{ '--c': st.color }}>{st.label}</span>
                </div>
                <p className="muted small clamp-2">{p.description || 'No description'}</p>
                <ProgressBar value={pct(p.done_count, p.task_count)} color={p.color} />
                <div className="row-between small">
                  <span>{pct(p.done_count, p.task_count)}% · {p.done_count}/{p.task_count} tasks</span>
                  {p.overdue_count > 0 && <span className="text-red">{p.overdue_count} overdue</span>}
                </div>
                <div className="row-between small muted">
                  <span className="row-gap">{owner && <Avatar user={owner} size={18} />}{owner?.name || 'No owner'}</span>
                  <span>{p.due_date ? `Due ${fmtDate(p.due_date)}` : 'No deadline'}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="folder" title="No projects yet">
          {isManager ? 'Create a project to start adding tasks.' : 'Ask a manager to create a project in this space.'}
        </EmptyState>
      )}

      <div className="section-head"><h2>All tasks in {space.name}</h2></div>
      <TaskWorkspace key={space.id} query={{ space_id: space.id }} showProject storageKey={`space-${space.id}`} defaults={{ space_id: space.id }} />

      {modal && <ProjectModal defaults={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

export function ProjectPage() {
  const { id } = useParams();
  const { projects, isManager, users } = useData();
  const [editing, setEditing] = useState(false);
  const project = projects.find((p) => p.id === Number(id));
  if (!project) return <div className="page"><EmptyState icon="folder" title="Project not found" /></div>;
  const st = PROJECT_STATUSES.find((s) => s.key === project.status);
  const owner = users.find((u) => u.id === project.owner_id);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs">
            <Link to={`/spaces/${project.space_id}`} className="crumb"><span className="space-icon tiny" style={{ background: project.space_color }}>{project.space_name[0]}</span>{project.space_name}</Link>
          </div>
          <h1 className="row-gap"><span className="dot big" style={{ background: project.color }} />{project.name}</h1>
          {project.description && <p className="muted">{project.description}</p>}
        </div>
        <div className="project-facts">
          <span className="pill" style={{ '--c': st.color }}>{st.label}</span>
          <ProjectProgress project={project} />
          {owner && <span className="row-gap small"><Avatar user={owner} size={20} />{owner.name}</span>}
          {project.due_date && <span className="small muted"><Icon name="calendar" size={13} /> Due {fmtDate(project.due_date)}</span>}
          {isManager && <button type="button" className="btn small" onClick={() => setEditing(true)}><Icon name="edit" size={13} /> Edit</button>}
        </div>
      </div>
      <TaskWorkspace key={project.id} query={{ project_id: project.id }} defaults={{ project_id: project.id }} storageKey={`project-${project.id}`} />
      {editing && <ProjectModal project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}
