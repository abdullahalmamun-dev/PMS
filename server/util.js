import { run } from './db.js';

export const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'];
export const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
export const ROLES = ['admin', 'manager', 'member'];
export const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const forbidden = () => new HttpError(403, 'You do not have permission to do that');

export function errorHandler(err, req, res, _next) {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
}

export function idParam(value, name = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`Invalid ${name}`);
  return id;
}

// Field validators return undefined when the field is absent so PATCH handlers can skip it.
export function text(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined) {
    if (required) throw badRequest(`${field} is required`);
    return undefined;
  }
  if (value === null) {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw badRequest(`${field} is required`);
  if (trimmed.length > max) throw badRequest(`${field} is too long (max ${max} characters)`);
  return trimmed;
}

export function oneOf(value, list, field) {
  if (value === undefined) return undefined;
  if (!list.includes(value)) throw badRequest(`${field} must be one of: ${list.join(', ')}`);
  return value;
}

export function dateOrNull(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${field} must be a YYYY-MM-DD date`);
  return value;
}

export function numberOrNull(value, field, { min = 0, max = 100000 } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${field} must be a number between ${min} and ${max}`);
  return n;
}

export function color(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw badRequest('color must be a hex value like #7b68ee');
  return value;
}

export function idList(value, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest(`${field} must be a list`);
  return [...new Set(value.map((v) => idParam(v, field)))];
}

export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

export function logActivity({ taskId = null, projectId = null, userId = null, action }) {
  run('INSERT INTO activity (task_id, project_id, user_id, action) VALUES (?, ?, ?, ?)', taskId, projectId, userId, action);
}

export function notify(userIds, actorId, taskId, message) {
  for (const uid of new Set(userIds)) {
    if (!uid || uid === actorId) continue;
    run('INSERT INTO notifications (user_id, actor_id, task_id, message) VALUES (?, ?, ?, ?)', uid, actorId, taskId, message);
  }
}

/** Build a SET clause from the defined entries of an object. */
export function setClause(fields) {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  return { sql: keys.map((k) => `${k} = ?`).join(', '), values: keys.map((k) => fields[k]), keys };
}
