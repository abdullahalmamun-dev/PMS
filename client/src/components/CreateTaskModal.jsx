import { useState } from 'react';
import { api } from '../api.js';
import { useData } from '../store.jsx';
import { PRIORITIES, STATUSES } from '../utils.js';
import { AssigneePicker, Field, Modal } from './ui.jsx';
import TagInput from './TagInput.jsx';

export default function CreateTaskModal() {
  const { createDefaults: d, closeCreate, spaces, projects, toast, bumpTasks, openTask } = useData();
  const usable = projects.filter((p) => p.status !== 'archived');
  const [form, setForm] = useState({
    title: '',
    description: '',
    project_id: d.project_id || (d.space_id ? usable.find((p) => p.space_id === d.space_id)?.id : null) || usable[0]?.id || '',
    status: d.status || 'todo',
    priority: d.priority || 'normal',
    assignee_ids: d.assignee_ids || [],
    start_date: d.start_date || '',
    due_date: d.due_date || '',
    estimate_hours: '',
    tags: [],
  });
  const [saving, setSaving] = useState(false);
  const [openAfter, setOpenAfter] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const task = await api('/tasks', {
        method: 'POST',
        body: {
          ...form,
          project_id: Number(form.project_id),
          parent_id: d.parent_id || undefined,
          estimate_hours: form.estimate_hours === '' ? null : Number(form.estimate_hours),
        },
      });
      bumpTasks();
      toast('Task created', 'success');
      closeCreate();
      if (openAfter) openTask(task.id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!usable.length) {
    return (
      <Modal title="New task" onClose={closeCreate}>
        <p>Create a project first — tasks live inside projects. Use <b>Add project</b> under a space in the sidebar.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={d.parent_id ? 'New subtask' : 'New task'}
      onClose={closeCreate}
      width={640}
      footer={
        <>
          <label className="checkbox-row grow">
            <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} /> Open task after creating
          </label>
          <button type="button" className="btn" onClick={closeCreate}>Cancel</button>
          <button type="submit" form="create-task" className="btn primary" disabled={saving || !form.title.trim()}>{saving ? 'Creating…' : 'Create task'}</button>
        </>
      }
    >
      <form id="create-task" className="form" onSubmit={submit}>
        <input autoFocus className="title-input" placeholder="Task name" value={form.title} onChange={set('title')} />
        <textarea rows={3} placeholder="Add a description…" value={form.description} onChange={set('description')} />
        <div className="form-row">
          {!d.parent_id && (
            <Field label="Project">
              <select value={form.project_id} onChange={set('project_id')} required>
                {spaces.map((s) => (
                  <optgroup key={s.id} label={s.name}>
                    {usable.filter((p) => p.space_id === s.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
          )}
          <Field label="Assignees">
            <div className="input-like"><AssigneePicker value={form.assignee_ids} onChange={set('assignee_ids')} max={5} placeholder="Assign" /></div>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Status">
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Estimate (hours)">
            <input type="number" min="0" step="0.5" value={form.estimate_hours} onChange={set('estimate_hours')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Start date"><input type="date" value={form.start_date} onChange={set('start_date')} /></Field>
          <Field label="Due date"><input type="date" value={form.due_date} onChange={set('due_date')} /></Field>
        </div>
        <Field label="Tags"><TagInput value={form.tags} onChange={set('tags')} /></Field>
      </form>
    </Modal>
  );
}
