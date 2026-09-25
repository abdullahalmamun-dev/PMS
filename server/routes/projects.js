import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireRole } from '../auth.js';
import { PROJECT_STATUSES, badRequest, color, dateOrNull, idParam, localDate, logActivity, notFound, oneOf, setClause, text } from '../util.js';

const router = Router();

const PROJECT_SELECT = `
SELECT p.*, s.name AS space_name, s.color AS space_color, u.name AS owner_name, u.color AS owner_color,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done' AND t.due_date < ?) AS overdue_count
FROM projects p
JOIN spaces s ON s.id = p.space_id
LEFT JOIN users u ON u.id = p.owner_id`;

const findProject = (id) => get(`${PROJECT_SELECT} WHERE p.id = ?`, localDate(), id);

function fieldsFrom(b) {
  const ownerId = b.owner_id === undefined ? undefined : b.owner_id === null || b.owner_id === '' ? null : idParam(b.owner_id, 'owner_id');
  if (ownerId && !get('SELECT id FROM users WHERE id = ?', ownerId)) throw badRequest('Owner does not exist');
  return {
    name: text(b.name, 'Name', { required: b.name !== undefined, max: 150 }),
    description: text(b.description, 'Description', { max: 5000 }),
    color: color(b.color),
    status: oneOf(b.status, PROJECT_STATUSES, 'Status'),
    owner_id: ownerId,
    start_date: dateOrNull(b.start_date, 'Start date'),
    due_date: dateOrNull(b.due_date, 'Due date'),
  };
}

router.get('/', (req, res) => {
  const where = [];
  const params = [localDate()];
  if (req.query.space_id) {
    where.push('p.space_id = ?');
    params.push(idParam(req.query.space_id, 'space_id'));
  }
  res.json(all(`${PROJECT_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY p.space_id, p.name`, ...params));
});

router.get('/:id', (req, res) => {
  const project = findProject(idParam(req.params.id));
  if (!project) throw notFound('Project');
  res.json(project);
});

router.post('/', requireRole('admin', 'manager'), (req, res) => {
  const b = req.body || {};
  const spaceId = idParam(b.space_id, 'space_id');
  if (!get('SELECT id FROM spaces WHERE id = ?', spaceId)) throw badRequest('Space does not exist');
  const f = fieldsFrom({ ...b, name: b.name ?? '' });
  const { lastInsertRowid } = run(
    'INSERT INTO projects (space_id, name, description, color, status, owner_id, start_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    spaceId, f.name, f.description, f.color || '#7b68ee', f.status || 'active', f.owner_id ?? req.user.id, f.start_date, f.due_date,
  );
  const id = Number(lastInsertRowid);
  logActivity({ projectId: id, userId: req.user.id, action: `created project "${f.name}"` });
  res.status(201).json(findProject(id));
});

router.patch('/:id', requireRole('admin', 'manager'), (req, res) => {
  const id = idParam(req.params.id);
  if (!get('SELECT id FROM projects WHERE id = ?', id)) throw notFound('Project');
  const b = req.body || {};
  const fields = fieldsFrom(b);
  if (b.space_id !== undefined) {
    fields.space_id = idParam(b.space_id, 'space_id');
    if (!get('SELECT id FROM spaces WHERE id = ?', fields.space_id)) throw badRequest('Space does not exist');
  }
  const { sql, values, keys } = setClause(fields);
  if (keys.length) run(`UPDATE projects SET ${sql} WHERE id = ?`, ...values, id);
  res.json(findProject(id));
});

router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  const { changes } = run('DELETE FROM projects WHERE id = ?', idParam(req.params.id));
  if (!changes) throw notFound('Project');
  res.status(204).end();
});

export default router;
