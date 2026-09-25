import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { requireRole } from '../auth.js';
import { color, idList, idParam, notFound, setClause, text } from '../util.js';

const router = Router();

function listTeams() {
  const teams = all('SELECT * FROM teams ORDER BY name');
  const members = all('SELECT team_id, user_id FROM team_members');
  return teams.map((t) => ({ ...t, member_ids: members.filter((m) => m.team_id === t.id).map((m) => m.user_id) }));
}

function setMembers(teamId, userIds) {
  run('DELETE FROM team_members WHERE team_id = ?', teamId);
  for (const uid of userIds) run('INSERT OR IGNORE INTO team_members (team_id, user_id) SELECT ?, id FROM users WHERE id = ?', teamId, uid);
}

router.get('/', (req, res) => res.json(listTeams()));

router.post('/', requireRole('admin', 'manager'), (req, res) => {
  const b = req.body || {};
  const memberIds = idList(b.member_ids, 'member_ids') || [];
  const id = tx(() => {
    const { lastInsertRowid } = run(
      'INSERT INTO teams (name, description, color) VALUES (?, ?, ?)',
      text(b.name, 'Name', { required: true, max: 100 }), text(b.description, 'Description', { max: 1000 }), color(b.color) || '#7b68ee',
    );
    setMembers(Number(lastInsertRowid), memberIds);
    return Number(lastInsertRowid);
  });
  res.status(201).json(listTeams().find((t) => t.id === id));
});

router.patch('/:id', requireRole('admin', 'manager'), (req, res) => {
  const id = idParam(req.params.id);
  if (!get('SELECT id FROM teams WHERE id = ?', id)) throw notFound('Team');
  const b = req.body || {};
  const memberIds = idList(b.member_ids, 'member_ids');
  tx(() => {
    const { sql, values, keys } = setClause({
      name: text(b.name, 'Name', { required: b.name !== undefined, max: 100 }),
      description: text(b.description, 'Description', { max: 1000 }),
      color: color(b.color),
    });
    if (keys.length) run(`UPDATE teams SET ${sql} WHERE id = ?`, ...values, id);
    if (memberIds) setMembers(id, memberIds);
  });
  res.json(listTeams().find((t) => t.id === id));
});

router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  const { changes } = run('DELETE FROM teams WHERE id = ?', idParam(req.params.id));
  if (!changes) throw notFound('Team');
  res.status(204).end();
});

export default router;
