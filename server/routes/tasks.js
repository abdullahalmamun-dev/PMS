import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { isManager } from '../auth.js';
import { getTask, queryTasks } from '../taskQuery.js';
import {
  PRIORITIES, STATUSES, badRequest, dateOrNull, forbidden, idList, idParam, localDate, logActivity,
  notFound, notify, numberOrNull, oneOf, setClause, text,
} from '../util.js';

const router = Router();

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', review: 'In Review', blocked: 'Blocked', done: 'Done' };
const csv = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

function normalizeTags(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('tags must be a list');
  return [...new Set(value.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40));
}

function userNames(ids) {
  if (!ids.length) return [];
  return all(`SELECT name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids).map((u) => u.name);
}

function assertUsersExist(ids) {
  for (const id of ids) if (!get('SELECT id FROM users WHERE id = ?', id)) throw badRequest(`User ${id} does not exist`);
}

function requireTask(id) {
  const task = get('SELECT * FROM tasks WHERE id = ?', id);
  if (!task) throw notFound('Task');
  return task;
}

// ---- List & search -------------------------------------------------------

router.get('/', (req, res) => {
  const q = req.query;
  const where = [];
  const params = [];
  const today = localDate();

  if (q.project_id) { where.push('t.project_id = ?'); params.push(idParam(q.project_id, 'project_id')); }
  if (q.space_id) { where.push('p.space_id = ?'); params.push(idParam(q.space_id, 'space_id')); }
  if (q.parent_id) { where.push('t.parent_id = ?'); params.push(idParam(q.parent_id, 'parent_id')); }
  else if (!q.include_subtasks) where.push('t.parent_id IS NULL');
  if (q.assignee) {
    where.push('EXISTS (SELECT 1 FROM task_assignees x WHERE x.task_id = t.id AND x.user_id = ?)');
    params.push(q.assignee === 'me' ? req.user.id : idParam(q.assignee, 'assignee'));
  }
  if (q.status) {
    const list = csv(q.status).filter((s) => STATUSES.includes(s));
    if (list.length) { where.push(`t.status IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  }
  if (q.priority) {
    const list = csv(q.priority).filter((s) => PRIORITIES.includes(s));
    if (list.length) { where.push(`t.priority IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  }
  if (q.open) where.push("t.status != 'done'");
  if (q.due_from) { where.push('t.due_date >= ?'); params.push(dateOrNull(q.due_from, 'due_from')); }
  if (q.due_to) { where.push('t.due_date <= ?'); params.push(dateOrNull(q.due_to, 'due_to')); }
  if (q.overdue) { where.push("t.status != 'done' AND t.due_date < ?"); params.push(today); }
  if (q.tag) { where.push('EXISTS (SELECT 1 FROM task_tags tg WHERE tg.task_id = t.id AND tg.tag = ?)'); params.push(String(q.tag).toLowerCase()); }
  if (q.q) {
    where.push('(t.title LIKE ? OR t.description LIKE ?)');
    const like = `%${String(q.q).replace(/[%_]/g, '')}%`;
    params.push(like, like);
  }

  const order = q.sort === 'due'
    ? 't.due_date IS NULL, t.due_date, t.id'
    : q.sort === 'updated' ? 't.updated_at DESC' : 't.position, t.id';
  const limit = Math.min(Number(q.limit) || 2000, 2000);
  res.json(queryTasks({ where, params, order, limit }));
});

router.get('/tags', (req, res) => {
  res.json(all('SELECT tag, COUNT(*) AS count FROM task_tags GROUP BY tag ORDER BY count DESC, tag LIMIT 200'));
});

router.get('/:id', (req, res) => {
  const id = idParam(req.params.id);
  const task = getTask(id);
  if (!task) throw notFound('Task');
  task.subtasks = queryTasks({ where: ['t.parent_id = ?'], params: [id] });
  task.checklist = all('SELECT * FROM checklist_items WHERE task_id = ? ORDER BY position, id', id).map((c) => ({ ...c, done: !!c.done }));
  task.comments = all(
    `SELECT c.*, u.name AS user_name, u.color AS user_color FROM comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.task_id = ? ORDER BY c.id`, id,
  );
  task.activity = all(
    `SELECT a.*, u.name AS user_name, u.color AS user_color FROM activity a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.task_id = ? ORDER BY a.id`, id,
  );
  task.time_entries = all(
    `SELECT te.*, u.name AS user_name, u.color AS user_color FROM time_entries te LEFT JOIN users u ON u.id = te.user_id
     WHERE te.task_id = ? ORDER BY te.date DESC, te.id DESC`, id,
  );
  res.json(task);
});

// ---- Create / update / delete -------------------------------------------

router.post('/', (req, res) => {
  const b = req.body || {};
  let projectId = b.project_id ? idParam(b.project_id, 'project_id') : null;
  let parentId = null;
  if (b.parent_id) {
    const parent = requireTask(idParam(b.parent_id, 'parent_id'));
    parentId = parent.id;
    projectId = parent.project_id;
  }
  if (!projectId) throw badRequest('Choose a project for this task');
  const project = get('SELECT id, name FROM projects WHERE id = ?', projectId);
  if (!project) throw badRequest('Project does not exist');

  const title = text(b.title, 'Title', { required: true, max: 300 });
  const status = oneOf(b.status ?? 'todo', STATUSES, 'Status');
  const assigneeIds = idList(b.assignee_ids, 'assignee_ids') || [];
  assertUsersExist(assigneeIds);
  const tags = normalizeTags(b.tags) || [];

  const id = tx(() => {
    const position = get('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM tasks WHERE project_id = ?', projectId).p;
    const { lastInsertRowid } = run(
      `INSERT INTO tasks (project_id, parent_id, title, description, status, priority, start_date, due_date, estimate_hours, position, created_by, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      projectId, parentId, title, text(b.description, 'Description', { max: 20000 }) || '', status,
      oneOf(b.priority ?? 'normal', PRIORITIES, 'Priority'), dateOrNull(b.start_date, 'Start date'), dateOrNull(b.due_date, 'Due date'),
      numberOrNull(b.estimate_hours, 'Estimate'), position, req.user.id, status === 'done' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
    );
    const taskId = Number(lastInsertRowid);
    for (const uid of assigneeIds) run('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)', taskId, uid);
    for (const tag of tags) run('INSERT INTO task_tags (task_id, tag) VALUES (?, ?)', taskId, tag);
    logActivity({ taskId, projectId, userId: req.user.id, action: parentId ? 'created this subtask' : 'created this task' });
    notify(assigneeIds, req.user.id, taskId, `${req.user.name} assigned you to "${title}"`);
    return taskId;
  });
  res.status(201).json(getTask(id));
});

router.patch('/:id', (req, res) => {
  const id = idParam(req.params.id);
  const before = requireTask(id);
  const b = req.body || {};
  const me = req.user;

  const fields = {
    title: text(b.title, 'Title', { required: b.title !== undefined, max: 300 }),
    description: b.description === undefined ? undefined : text(b.description, 'Description', { max: 20000 }) || '',
    status: oneOf(b.status, STATUSES, 'Status'),
    priority: oneOf(b.priority, PRIORITIES, 'Priority'),
    start_date: dateOrNull(b.start_date, 'Start date'),
    due_date: dateOrNull(b.due_date, 'Due date'),
    estimate_hours: numberOrNull(b.estimate_hours, 'Estimate'),
    position: numberOrNull(b.position, 'Position', { min: -1e9, max: 1e9 }),
  };
  let newProject = null;
  if (b.project_id !== undefined && Number(b.project_id) !== before.project_id) {
    if (before.parent_id) throw badRequest('Subtasks follow their parent task; move the parent instead');
    newProject = get('SELECT id, name FROM projects WHERE id = ?', idParam(b.project_id, 'project_id'));
    if (!newProject) throw badRequest('Project does not exist');
    fields.project_id = newProject.id;
  }
  const assigneeIds = idList(b.assignee_ids, 'assignee_ids');
  if (assigneeIds) assertUsersExist(assigneeIds);
  const tags = normalizeTags(b.tags);

  tx(() => {
    const log = (action) => logActivity({ taskId: id, projectId: fields.project_id || before.project_id, userId: me.id, action });
    const title = fields.title || before.title;

    if (fields.status && fields.status !== before.status) {
      fields.completed_at = fields.status === 'done' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
      log(`changed status from ${STATUS_LABELS[before.status]} to ${STATUS_LABELS[fields.status]}`);
      const watchers = all('SELECT user_id FROM task_assignees WHERE task_id = ?', id).map((r) => r.user_id);
      if (fields.status === 'done' || fields.status === 'review' || fields.status === 'blocked') {
        notify([...watchers, before.created_by], me.id, id, `${me.name} moved "${title}" to ${STATUS_LABELS[fields.status]}`);
      }
    }
    if (fields.priority && fields.priority !== before.priority) log(`set priority to ${fields.priority}`);
    if (fields.due_date !== undefined && fields.due_date !== before.due_date) log(fields.due_date ? `set due date to ${fields.due_date}` : 'removed the due date');
    if (fields.start_date !== undefined && fields.start_date !== before.start_date) log(fields.start_date ? `set start date to ${fields.start_date}` : 'removed the start date');
    if (fields.title && fields.title !== before.title) log(`renamed the task from "${before.title}"`);
    if (fields.description !== undefined && fields.description !== before.description) log('updated the description');
    if (fields.estimate_hours !== undefined && fields.estimate_hours !== before.estimate_hours) log(fields.estimate_hours ? `set estimate to ${fields.estimate_hours}h` : 'removed the estimate');
    if (newProject) {
      log(`moved the task to ${newProject.name}`);
      run(
        `WITH RECURSIVE sub(id) AS (SELECT id FROM tasks WHERE parent_id = ? UNION ALL SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id)
         UPDATE tasks SET project_id = ? WHERE id IN (SELECT id FROM sub)`, id, newProject.id,
      );
    }

    const { sql, values, keys } = setClause(fields);
    if (keys.length) run(`UPDATE tasks SET ${sql}, updated_at = datetime('now') WHERE id = ?`, ...values, id);

    if (assigneeIds) {
      const current = all('SELECT user_id FROM task_assignees WHERE task_id = ?', id).map((r) => r.user_id);
      const added = assigneeIds.filter((u) => !current.includes(u));
      const removed = current.filter((u) => !assigneeIds.includes(u));
      for (const u of removed) run('DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?', id, u);
      for (const u of added) run('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)', id, u);
      if (added.length) log(`assigned ${userNames(added).join(', ')}`);
      if (removed.length) log(`unassigned ${userNames(removed).join(', ')}`);
      notify(added, me.id, id, `${me.name} assigned you to "${title}"`);
      if (added.length || removed.length) run("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?", id);
    }
    if (tags) {
      run('DELETE FROM task_tags WHERE task_id = ?', id);
      for (const tag of tags) run('INSERT INTO task_tags (task_id, tag) VALUES (?, ?)', id, tag);
    }
  });
  res.json(getTask(id));
});

router.delete('/:id', (req, res) => {
  const task = requireTask(idParam(req.params.id));
  if (!isManager(req.user) && task.created_by !== req.user.id) throw forbidden();
  tx(() => {
    run('DELETE FROM tasks WHERE id = ?', task.id);
    logActivity({ projectId: task.project_id, userId: req.user.id, action: `deleted task "${task.title}"` });
  });
  res.status(204).end();
});

// ---- Comments ------------------------------------------------------------

router.post('/:id/comments', (req, res) => {
  const task = requireTask(idParam(req.params.id));
  const body = text(req.body?.body, 'Comment', { required: true, max: 10000 });
  const { lastInsertRowid } = run('INSERT INTO comments (task_id, user_id, body) VALUES (?, ?, ?)', task.id, req.user.id, body);
  const watchers = all('SELECT user_id FROM task_assignees WHERE task_id = ?', task.id).map((r) => r.user_id);
  // Anyone mentioned as @Firstname or @"Full Name" also gets notified.
  const mentioned = all('SELECT id, name FROM users WHERE active = 1').filter((u) => {
    const lower = body.toLowerCase();
    return lower.includes(`@${u.name.toLowerCase()}`) || lower.includes(`@${u.name.split(' ')[0].toLowerCase()}`);
  }).map((u) => u.id);
  notify([...watchers, task.created_by, ...mentioned], req.user.id, task.id, `${req.user.name} commented on "${task.title}"`);
  run("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?", task.id);
  res.status(201).json(get(
    'SELECT c.*, u.name AS user_name, u.color AS user_color FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?',
    Number(lastInsertRowid),
  ));
});

router.delete('/comments/:cid', (req, res) => {
  const comment = get('SELECT * FROM comments WHERE id = ?', idParam(req.params.cid));
  if (!comment) throw notFound('Comment');
  if (comment.user_id !== req.user.id && req.user.role !== 'admin') throw forbidden();
  run('DELETE FROM comments WHERE id = ?', comment.id);
  res.status(204).end();
});

// ---- Checklist -----------------------------------------------------------

router.post('/:id/checklist', (req, res) => {
  const task = requireTask(idParam(req.params.id));
  const itemText = text(req.body?.text, 'Checklist item', { required: true, max: 500 });
  const position = get('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM checklist_items WHERE task_id = ?', task.id).p;
  const { lastInsertRowid } = run('INSERT INTO checklist_items (task_id, text, position) VALUES (?, ?, ?)', task.id, itemText, position);
  res.status(201).json(get('SELECT * FROM checklist_items WHERE id = ?', Number(lastInsertRowid)));
});

router.patch('/checklist/:cid', (req, res) => {
  const id = idParam(req.params.cid);
  const item = get('SELECT * FROM checklist_items WHERE id = ?', id);
  if (!item) throw notFound('Checklist item');
  const { sql, values, keys } = setClause({
    text: text(req.body?.text, 'Checklist item', { required: req.body?.text !== undefined, max: 500 }),
    done: req.body?.done === undefined ? undefined : req.body.done ? 1 : 0,
  });
  if (keys.length) run(`UPDATE checklist_items SET ${sql} WHERE id = ?`, ...values, id);
  res.json(get('SELECT * FROM checklist_items WHERE id = ?', id));
});

router.delete('/checklist/:cid', (req, res) => {
  const { changes } = run('DELETE FROM checklist_items WHERE id = ?', idParam(req.params.cid));
  if (!changes) throw notFound('Checklist item');
  res.status(204).end();
});

// ---- Time tracking -------------------------------------------------------

router.post('/:id/time', (req, res) => {
  const task = requireTask(idParam(req.params.id));
  const hours = numberOrNull(req.body?.hours, 'Hours', { min: 0.05, max: 24 });
  if (!hours) throw badRequest('Hours is required');
  const date = dateOrNull(req.body?.date, 'Date') || localDate();
  const { lastInsertRowid } = run(
    'INSERT INTO time_entries (task_id, user_id, hours, note, date) VALUES (?, ?, ?, ?, ?)',
    task.id, req.user.id, hours, text(req.body?.note, 'Note', { max: 500 }), date,
  );
  logActivity({ taskId: task.id, projectId: task.project_id, userId: req.user.id, action: `logged ${hours}h` });
  res.status(201).json(get('SELECT * FROM time_entries WHERE id = ?', Number(lastInsertRowid)));
});

router.delete('/time/:eid', (req, res) => {
  const entry = get('SELECT * FROM time_entries WHERE id = ?', idParam(req.params.eid));
  if (!entry) throw notFound('Time entry');
  if (entry.user_id !== req.user.id && !isManager(req.user)) throw forbidden();
  run('DELETE FROM time_entries WHERE id = ?', entry.id);
  res.status(204).end();
});

export default router;
