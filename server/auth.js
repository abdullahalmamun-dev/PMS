import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { DATA_DIR, get } from './db.js';

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const SECRET = loadSecret();

export const signToken = (user) => jwt.sign({ sub: String(user.id) }, SECRET, { expiresIn: '14d' });

export function publicUser(user) {
  const { password_hash, ...rest } = user;
  return { ...rest, active: !!rest.active };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = get('SELECT * FROM users WHERE id = ?', Number(payload.sub));
    if (!user || !user.active) return res.status(401).json({ error: 'Account not found or disabled' });
    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}

export const isManager = (user) => user.role === 'admin' || user.role === 'manager';

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission to do that' });
