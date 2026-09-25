import { Router } from 'express';
import { all, get, run } from '../db.js';
import { idParam } from '../util.js';

const router = Router();

router.get('/', (req, res) => {
  const items = all(
    `SELECT n.*, u.name AS actor_name, u.color AS actor_color, t.title AS task_title
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     LEFT JOIN tasks t ON t.id = n.task_id
     WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 100`,
    req.user.id,
  ).map((n) => ({ ...n, read: !!n.read }));
  const { unread } = get('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read = 0', req.user.id);
  res.json({ items, unread });
});

router.get('/unread', (req, res) => {
  res.json(get('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read = 0', req.user.id));
});

router.post('/read-all', (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  res.status(204).end();
});

router.post('/:id/read', (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', idParam(req.params.id), req.user.id);
  res.status(204).end();
});

export default router;
