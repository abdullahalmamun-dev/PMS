export const STATUSES = [
  { key: 'todo', label: 'To Do', color: '#87909e' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'review', label: 'In Review', color: '#a855f7' },
  { key: 'blocked', label: 'Blocked', color: '#ef4444' },
  { key: 'done', label: 'Done', color: '#16a34a' },
];

export const PRIORITIES = [
  { key: 'urgent', label: 'Urgent', color: '#ef4444' },
  { key: 'high', label: 'High', color: '#f59e0b' },
  { key: 'normal', label: 'Normal', color: '#3b82f6' },
  { key: 'low', label: 'Low', color: '#94a3b8' },
];

export const PROJECT_STATUSES = [
  { key: 'active', label: 'Active', color: '#16a34a' },
  { key: 'on_hold', label: 'On hold', color: '#f59e0b' },
  { key: 'completed', label: 'Completed', color: '#3b82f6' },
  { key: 'archived', label: 'Archived', color: '#94a3b8' },
];

export const ROLES = [
  { key: 'admin', label: 'Admin', hint: 'Full access, manages users' },
  { key: 'manager', label: 'Manager', hint: 'Manages spaces, projects and teams' },
  { key: 'member', label: 'Member', hint: 'Works on tasks' },
];

export const COLORS = ['#7b68ee', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#64748b'];

export const statusOf = (key) => STATUSES.find((s) => s.key === key) || STATUSES[0];
export const priorityOf = (key) => PRIORITIES.find((p) => p.key === key) || PRIORITIES[2];
export const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());

export function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function fmtDate(str, { relative = true } = {}) {
  if (!str) return '';
  const today = todayStr();
  if (relative) {
    const diff = daysBetween(today, str);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
  }
  const d = parseDate(str);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

export function dueState(task) {
  if (!task.due_date || task.status === 'done') return '';
  const today = todayStr();
  if (task.due_date < today) return 'overdue';
  if (task.due_date === today) return 'today';
  return '';
}

/** Server timestamps are UTC "YYYY-MM-DD HH:MM:SS". */
export const parseStamp = (ts) => new Date(`${ts.replace(' ', 'T')}Z`);

export function timeAgo(ts) {
  if (!ts) return '';
  const secs = Math.max(0, (Date.now() - parseStamp(ts).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)}d ago`;
  return parseStamp(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);

export function fmtHours(h) {
  if (!h) return '0h';
  return `${Math.round(h * 10) / 10}h`;
}

/** Group tasks by due-date buckets used in My Tasks. */
export function dueBucket(task) {
  if (task.status === 'done') return 'done';
  if (!task.due_date) return 'none';
  const diff = daysBetween(todayStr(), task.due_date);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

export const DUE_BUCKETS = [
  { key: 'overdue', label: 'Overdue', color: '#ef4444' },
  { key: 'today', label: 'Today', color: '#f59e0b' },
  { key: 'week', label: 'Next 7 days', color: '#3b82f6' },
  { key: 'later', label: 'Later', color: '#7b68ee' },
  { key: 'none', label: 'No due date', color: '#94a3b8' },
  { key: 'done', label: 'Completed', color: '#16a34a' },
];
