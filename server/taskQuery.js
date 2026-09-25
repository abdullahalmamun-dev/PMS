import { all } from './db.js';

const TASK_SELECT = `
SELECT t.*,
  p.name AS project_name, p.color AS project_color, p.space_id,
  s.name AS space_name, s.color AS space_color,
  pt.title AS parent_title,
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id) AS subtask_count,
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id AND c.status = 'done') AS subtask_done,
  (SELECT COUNT(*) FROM checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
  (SELECT COUNT(*) FROM checklist_items ci WHERE ci.task_id = t.id AND ci.done = 1) AS checklist_done,
  (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) AS comment_count,
  (SELECT COALESCE(SUM(te.hours), 0) FROM time_entries te WHERE te.task_id = t.id) AS logged_hours
FROM tasks t
JOIN projects p ON p.id = t.project_id
JOIN spaces s ON s.id = p.space_id
LEFT JOIN tasks pt ON pt.id = t.parent_id`;

/** Attach assignees and tags to task rows with two batched queries. */
export function hydrate(rows) {
  if (!rows.length) return [];
  const tasks = rows.map((r) => ({ ...r, assignees: [], tags: [] }));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = tasks.map((t) => t.id);
  const ph = ids.map(() => '?').join(',');
  for (const a of all(
    `SELECT ta.task_id, u.id, u.name, u.color FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id IN (${ph}) ORDER BY u.name`,
    ...ids,
  )) {
    byId.get(a.task_id).assignees.push({ id: a.id, name: a.name, color: a.color });
  }
  for (const t of all(`SELECT task_id, tag FROM task_tags WHERE task_id IN (${ph}) ORDER BY tag`, ...ids)) {
    byId.get(t.task_id).tags.push(t.tag);
  }
  return tasks;
}

export function queryTasks({ where = [], params = [], order = 't.position, t.id', limit } = {}) {
  const sql = `${TASK_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}${limit ? ` LIMIT ${Number(limit)}` : ''}`;
  return hydrate(all(sql, ...params));
}

export function getTask(id) {
  return queryTasks({ where: ['t.id = ?'], params: [id] })[0] || null;
}
