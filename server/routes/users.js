import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, run, tx } from '../db.js';
import { publicUser, requireRole } from '../auth.js';
import { ROLES, badRequest, color, idList, idParam, notFound, oneOf, setClause, text } from '../util.js';

const router = Router();

function listUsers() {
  const users = all(
    `SELECT u.*,
       (SELECT COUNT(*) FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id WHERE ta.user_id = u.id AND t.status != 'done') AS open_tasks
     FROM users u ORDER BY u.active DESC, u.name`,
  ).map(publicUser);
  const memberships = all('SELECT team_id, user_id FROM team_members');
  for (const u of users) u.team_ids = memberships.filter((m) => m.user_id === u.id).map((m) => m.team_id);
  return users;
}

function setTeams(userId, teamIds) {
  run('DELETE FROM team_members WHERE user_id = ?', userId);
  for (const tid of teamIds) {
    if (!get('SELECT id FROM teams WHERE id = ?', tid)) throw badRequest(`Team ${tid} does not exist`);
    run('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)', tid, userId);
  }
}

router.get('/', (req, res) => res.json(listUsers()));

router.post('/', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 'Name', { required: true, max: 100 });
  const email = text(b.email, 'Email', { required: true, max: 200 });
  if (!/^\S+@\S+\.\S+$/.test(email)) throw badRequest('Email address looks invalid');
  if (typeof b.password !== 'string' || b.password.length < 6) throw badRequest('Password must be at least 6 characters');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw badRequest('A user with that email already exists');
  const role = oneOf(b.role ?? 'member', ROLES, 'Role');
  const teamIds = idList(b.team_ids, 'team_ids') || [];
  const id = tx(() => {
    const { lastInsertRowid } = run(
      'INSERT INTO users (name, email, password_hash, role, title, color) VALUES (?, ?, ?, ?, ?, ?)',
      name, email, bcrypt.hashSync(b.password, 10), role, text(b.title, 'Job title', { max: 100 }), color(b.color) || '#7b68ee',
    );
    setTeams(Number(lastInsertRowid), teamIds);
    return Number(lastInsertRowid);
  });
  res.status(201).json(listUsers().find((u) => u.id === id));
});

router.patch('/:id', requireRole('admin'), (req, res) => {
  const id = idParam(req.params.id);
  const b = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', id);
  if (!user) throw notFound('User');

  const fields = {
    name: text(b.name, 'Name', { required: b.name !== undefined, max: 100 }),
    email: text(b.email, 'Email', { required: b.email !== undefined, max: 200 }),
    title: text(b.title, 'Job title', { max: 100 }),
    color: color(b.color),
    role: oneOf(b.role, ROLES, 'Role'),
    active: b.active === undefined ? undefined : b.active ? 1 : 0,
  };
  if (fields.email && fields.email.toLowerCase() !== user.email.toLowerCase() && get('SELECT id FROM users WHERE email = ?', fields.email)) {
    throw badRequest('A user with that email already exists');
  }
  if (b.password) {
    if (typeof b.password !== 'string' || b.password.length < 6) throw badRequest('Password must be at least 6 characters');
    fields.password_hash = bcrypt.hashSync(b.password, 10);
  }
  const losingAdmin = user.role === 'admin' && ((fields.role && fields.role !== 'admin') || fields.active === 0);
  if (losingAdmin && get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n <= 1) {
    throw badRequest('There must be at least one active admin');
  }
  if (id === req.user.id && fields.active === 0) throw badRequest('You cannot deactivate your own account');

  const teamIds = idList(b.team_ids, 'team_ids');
  tx(() => {
    const { sql, values, keys } = setClause(fields);
    if (keys.length) run(`UPDATE users SET ${sql} WHERE id = ?`, ...values, id);
    if (teamIds) setTeams(id, teamIds);
  });
  res.json(listUsers().find((u) => u.id === id));
});

export default router;
