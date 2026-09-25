import { Router } from 'express';
import { all, get } from '../db.js';
import { queryTasks } from '../taskQuery.js';
import { addDays, idParam, localDate } from '../util.js';

const router = Router();

router.get('/', (req, res) => {
  const spaceId = req.query.space_id ? idParam(req.query.space_id, 'space_id') : null;
  const scope = spaceId ? ' AND p.space_id = ?' : '';
  const sp = spaceId ? [spaceId] : [];
  const today = localDate();
  const weekEnd = addDays(today, 7);
  const weekAgo = addDays(today, -6);
  const FROM = 'FROM tasks t JOIN projects p ON p.id = t.project_id WHERE 1 = 1';

  const totals = get(
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(t.status = 'done'), 0) AS done,
       COALESCE(SUM(t.status = 'in_progress'), 0) AS in_progress,
       COALESCE(SUM(t.status = 'blocked'), 0) AS blocked,
       COALESCE(SUM(t.status != 'done' AND t.due_date < ?), 0) AS overdue,
       COALESCE(SUM(t.status != 'done' AND t.due_date BETWEEN ? AND ?), 0) AS due_this_week,
       COALESCE(SUM(t.status = 'done' AND t.completed_at >= ?), 0) AS completed_this_week
     ${FROM}${scope}`,
    today, today, weekEnd, weekAgo, ...sp,
  );

  const byStatus = all(`SELECT t.status, COUNT(*) AS count ${FROM}${scope} GROUP BY t.status`, ...sp);
  const byPriority = all(`SELECT t.priority, COUNT(*) AS count ${FROM} AND t.status != 'done'${scope} GROUP BY t.priority`, ...sp);

  const bySpace = all(
    `SELECT s.id, s.name, s.color, COUNT(t.id) AS total, COALESCE(SUM(t.status = 'done'), 0) AS done,
       COALESCE(SUM(t.status != 'done' AND t.due_date < ?), 0) AS overdue
     FROM spaces s LEFT JOIN projects p ON p.space_id = s.id LEFT JOIN tasks t ON t.project_id = p.id
     ${spaceId ? 'WHERE s.id = ?' : ''} GROUP BY s.id ORDER BY s.position, s.id`,
    today, ...sp,
  );

  const projects = all(
    `SELECT p.id, p.name, p.color, p.due_date, p.status, s.name AS space_name, s.color AS space_color,
       COUNT(t.id) AS total, COALESCE(SUM(t.status = 'done'), 0) AS done,
       COALESCE(SUM(t.status != 'done' AND t.due_date < ?), 0) AS overdue
     FROM projects p JOIN spaces s ON s.id = p.space_id LEFT JOIN tasks t ON t.project_id = p.id
     WHERE p.status IN ('active', 'on_hold')${scope}
     GROUP BY p.id ORDER BY overdue DESC, p.due_date IS NULL, p.due_date, p.name`,
    today, ...sp,
  );

  const workload = all(
    `SELECT u.id, u.name, u.color, u.title,
       COUNT(t.id) AS open,
       COALESCE(SUM(t.due_date < ?), 0) AS overdue,
       COALESCE(SUM(t.priority IN ('urgent', 'high')), 0) AS high_priority,
       COALESCE(SUM(t.estimate_hours), 0) AS estimate_hours
     FROM users u
     LEFT JOIN task_assignees ta ON ta.user_id = u.id
     LEFT JOIN tasks t ON t.id = ta.task_id AND t.status != 'done'
       ${spaceId ? 'AND t.project_id IN (SELECT id FROM projects WHERE space_id = ?)' : ''}
     WHERE u.active = 1
     GROUP BY u.id ORDER BY open DESC, u.name`,
    today, ...sp,
  );

  // 14-day trend of created vs completed tasks.
  const start = addDays(today, -13);
  const created = all(`SELECT date(t.created_at, 'localtime') AS d, COUNT(*) AS n ${FROM} AND date(t.created_at, 'localtime') >= ?${scope} GROUP BY d`, start, ...sp);
  const completed = all(`SELECT date(t.completed_at, 'localtime') AS d, COUNT(*) AS n ${FROM} AND t.status = 'done' AND date(t.completed_at, 'localtime') >= ?${scope} GROUP BY d`, start, ...sp);
  const trend = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(start, i);
    return { date: d, created: created.find((r) => r.d === d)?.n || 0, completed: completed.find((r) => r.d === d)?.n || 0 };
  });

  const taskScope = spaceId ? ['p.space_id = ?'] : [];
  const upcoming = queryTasks({
    where: [...taskScope, "t.status != 'done'", 't.due_date >= ?'], params: [...sp, today], order: 't.due_date, t.priority', limit: 10,
  });
  const overdue = queryTasks({
    where: [...taskScope, "t.status != 'done'", 't.due_date < ?'], params: [...sp, today], order: 't.due_date', limit: 10,
  });
  const mine = queryTasks({
    where: [...taskScope, "t.status != 'done'", 'EXISTS (SELECT 1 FROM task_assignees x WHERE x.task_id = t.id AND x.user_id = ?)'],
    params: [...sp, req.user.id], order: 't.due_date IS NULL, t.due_date', limit: 8,
  });

  const activity = all(
    `SELECT a.*, u.name AS user_name, u.color AS user_color, t.title AS task_title, p.name AS project_name
     FROM activity a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN tasks t ON t.id = a.task_id
     LEFT JOIN projects p ON p.id = a.project_id
     ${spaceId ? 'WHERE p.space_id = ?' : ''}
     ORDER BY a.id DESC LIMIT 20`,
    ...sp,
  );

  res.json({ totals, byStatus, byPriority, bySpace, projects, workload, trend, upcoming, overdue, mine, activity });
});

export default router;
