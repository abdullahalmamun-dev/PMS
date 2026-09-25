// Resets the database and fills it with realistic demo data.  Usage: npm run seed
import bcrypt from 'bcryptjs';
import { db, run, tx } from './db.js';
import { DEFAULT_SPACES } from './bootstrap.js';
import { addDays, localDate } from './util.js';

const today = localDate();
const day = (offset) => (offset === null || offset === undefined ? null : addDays(today, offset));
const stamp = (offset) => `${addDays(today, offset)} 10:00:00`;

const USERS = [
  ['Admin', 'admin@instacall.local', 'admin', 'Administrator', '#7b68ee'],
  ['Sarah Khan', 'sarah@instacall.local', 'manager', 'Engineering Lead', '#6366f1'],
  ['Omar Farooq', 'omar@instacall.local', 'member', 'Full-stack Developer', '#0ea5e9'],
  ['Lina Chen', 'lina@instacall.local', 'member', 'Frontend Developer', '#ec4899'],
  ['David Miller', 'david@instacall.local', 'member', 'QA Engineer', '#14b8a6'],
  ['Ayesha Rahman', 'ayesha@instacall.local', 'manager', 'SEO Lead', '#10b981'],
  ['Marco Rossi', 'marco@instacall.local', 'member', 'Content Writer', '#84cc16'],
  ['Priya Nair', 'priya@instacall.local', 'manager', 'Digital Marketing Manager', '#f59e0b'],
  ['Jake Wilson', 'jake@instacall.local', 'member', 'PPC & Social Specialist', '#f97316'],
  ['Fatima Ali', 'fatima@instacall.local', 'manager', 'Operations Manager', '#3b82f6'],
];
const U = Object.fromEntries(USERS.map(([name], i) => [name.split(' ')[0].toLowerCase(), i + 1]));

const TEAMS = [
  ['Engineering', 'Developers and QA', '#6366f1', ['sarah', 'omar', 'lina', 'david']],
  ['SEO', 'Search optimisation & content', '#10b981', ['ayesha', 'marco']],
  ['Marketing', 'Paid, social and email', '#f59e0b', ['priya', 'jake', 'marco']],
  ['Operations', 'Admin, finance and people', '#3b82f6', ['fatima', 'admin']],
];

// [spaceIndex, name, color, owner, dueOffset, description]
const PROJECTS = [
  [0, 'Customer Portal v2', '#7b68ee', 'sarah', 30, 'Rebuild of the customer self-service portal with new billing and support flows.'],
  [0, 'Mobile App', '#0ea5e9', 'sarah', 60, 'iOS and Android app for call tracking and notifications.'],
  [0, 'Infrastructure & DevOps', '#64748b', 'omar', null, 'CI/CD, hosting, monitoring and security.'],
  [1, 'Technical SEO Audit', '#10b981', 'ayesha', 14, 'Full crawl, Core Web Vitals and indexation fixes.'],
  [1, 'Content & Blog Strategy', '#22c55e', 'ayesha', 45, 'Keyword-driven editorial calendar for Q4.'],
  [1, 'Link Building', '#059669', 'ayesha', 40, 'Outreach, guest posts and digital PR.'],
  [2, 'Q4 Paid Ads Campaign', '#f59e0b', 'priya', 35, 'Google Ads and Meta campaigns for the Q4 push.'],
  [2, 'Social Media Calendar', '#ec4899', 'jake', null, 'Always-on organic social content.'],
  [2, 'Email Marketing', '#f97316', 'priya', 25, 'Newsletter, nurture sequences and automation.'],
  [3, 'Hiring & Onboarding', '#3b82f6', 'fatima', 30, 'Open roles, interviews and new-joiner onboarding.'],
  [3, 'Finance & Invoicing', '#0284c7', 'fatima', null, 'Monthly invoicing, payroll and vendor payments.'],
  [3, 'Office & IT Admin', '#6366f1', 'fatima', null, 'Equipment, licences and office logistics.'],
];

// [projectIndex, title, status, priority, assignees, dueOffset, tags, estimate, createdOffset, checklist?, subtasks?]
const TASKS = [
  [0, 'Design new billing dashboard', 'review', 'high', ['lina'], 2, ['design', 'frontend'], 16, -20, ['Wireframes', 'Hi-fi mockups', 'Stakeholder sign-off']],
  [0, 'Implement Stripe subscription API', 'in_progress', 'urgent', ['omar'], 1, ['backend', 'payments'], 24, -18, null, ['Webhook handler', 'Proration logic', 'Invoice PDF generation']],
  [0, 'Support ticket submission flow', 'todo', 'normal', ['lina', 'omar'], 9, ['frontend'], 12, -10],
  [0, 'Fix session timeout on Safari', 'blocked', 'high', ['omar'], -2, ['bug'], 4, -8],
  [0, 'Write E2E tests for checkout', 'todo', 'normal', ['david'], 12, ['qa', 'testing'], 10, -6],
  [0, 'Accessibility review (WCAG 2.2)', 'todo', 'low', ['david', 'lina'], 20, ['qa', 'a11y'], 8, -4],
  [0, 'Set up user roles & permissions', 'done', 'high', ['omar'], -5, ['backend'], 14, -25],
  [1, 'Push notification service', 'in_progress', 'high', ['omar'], 6, ['mobile', 'backend'], 20, -12],
  [1, 'Call history screen', 'todo', 'normal', ['lina'], 15, ['mobile', 'frontend'], 12, -9],
  [1, 'App Store listing & screenshots', 'todo', 'low', ['jake', 'lina'], 40, ['release'], 6, -3],
  [1, 'Crash on Android 12 login', 'in_progress', 'urgent', ['omar', 'david'], 0, ['bug', 'mobile'], 6, -2],
  [2, 'Migrate CI to GitHub Actions', 'done', 'normal', ['omar'], -9, ['devops'], 8, -26],
  [2, 'Configure uptime monitoring & alerts', 'review', 'normal', ['sarah'], 3, ['devops'], 4, -7, ['Pingdom checks', 'Slack alert channel', 'On-call rota']],
  [2, 'Quarterly dependency security update', 'todo', 'high', ['omar'], 5, ['security'], 6, -1],
  [3, 'Full site crawl with Screaming Frog', 'done', 'high', ['ayesha'], -6, ['audit'], 4, -15],
  [3, 'Fix 404s and redirect chains', 'in_progress', 'high', ['ayesha', 'omar'], 2, ['technical'], 8, -10, ['Export 404 list', 'Map redirects', 'Deploy .htaccess rules', 'Re-crawl']],
  [3, 'Improve Core Web Vitals (LCP)', 'todo', 'urgent', ['lina', 'ayesha'], 7, ['technical', 'performance'], 12, -9],
  [3, 'Add schema markup to service pages', 'todo', 'normal', ['ayesha'], 10, ['technical'], 5, -5],
  [3, 'Submit updated XML sitemap', 'done', 'normal', ['ayesha'], -3, ['technical'], 1, -12],
  [4, 'Keyword research: call tracking cluster', 'done', 'high', ['ayesha'], -8, ['research'], 6, -20],
  [4, 'Blog: "10 ways to reduce missed calls"', 'review', 'normal', ['marco'], 1, ['content', 'blog'], 5, -8],
  [4, 'Blog: "Call analytics for small business"', 'in_progress', 'normal', ['marco'], 6, ['content', 'blog'], 5, -4],
  [4, 'Refresh top 10 outdated posts', 'todo', 'low', ['marco'], 18, ['content'], 10, -2],
  [5, 'Outreach list: 50 SaaS publications', 'in_progress', 'normal', ['ayesha'], 4, ['outreach'], 6, -7],
  [5, 'Guest post for industry blog', 'todo', 'normal', ['marco'], 14, ['outreach', 'content'], 6, -3],
  [5, 'Disavow toxic backlinks', 'todo', 'low', ['ayesha'], -1, ['technical'], 2, -11],
  [6, 'Q4 budget allocation', 'done', 'high', ['priya'], -10, ['planning'], 3, -21],
  [6, 'Google Ads search campaign build', 'in_progress', 'urgent', ['jake'], 1, ['ppc', 'google-ads'], 10, -9, ['Keyword list', 'Ad copy variants', 'Conversion tracking', 'Negative keywords']],
  [6, 'Meta retargeting creatives', 'review', 'high', ['jake', 'lina'], 3, ['creative', 'meta'], 8, -6],
  [6, 'Landing page A/B test', 'todo', 'normal', ['priya', 'lina'], 11, ['cro'], 6, -4],
  [6, 'Weekly ad performance report', 'todo', 'normal', ['jake'], 0, ['reporting'], 2, -1],
  [7, 'October content calendar', 'done', 'normal', ['jake'], -4, ['social'], 4, -14],
  [7, 'LinkedIn carousel: product features', 'in_progress', 'normal', ['jake', 'marco'], 2, ['social', 'linkedin'], 3, -5],
  [7, 'Customer testimonial video', 'todo', 'high', ['priya'], 16, ['video'], 12, -3],
  [8, 'Welcome nurture sequence (5 emails)', 'in_progress', 'high', ['priya', 'marco'], 5, ['email', 'automation'], 10, -9],
  [8, 'Monthly newsletter - October', 'todo', 'normal', ['marco'], 8, ['email', 'content'], 4, -2],
  [8, 'Clean up inactive subscribers', 'blocked', 'low', ['priya'], -3, ['email'], 2, -12],
  [9, 'Hire senior backend developer', 'in_progress', 'high', ['fatima', 'sarah'], 21, ['hiring'], null, -18, ['Job description', 'Post on LinkedIn', 'Screen candidates', 'Technical interview', 'Offer']],
  [9, 'Onboarding checklist for new hires', 'review', 'normal', ['fatima'], 4, ['process'], 4, -10],
  [9, 'Interview: SEO intern candidates', 'todo', 'normal', ['ayesha', 'fatima'], 3, ['hiring'], 3, -2],
  [10, 'Send September client invoices', 'done', 'urgent', ['fatima'], -5, ['invoicing'], 3, -9],
  [10, 'Process October payroll', 'todo', 'urgent', ['fatima'], 6, ['payroll'], 2, -1],
  [10, 'Review software subscriptions', 'todo', 'low', ['fatima', 'admin'], 13, ['cost'], 2, -3],
  [11, 'Laptop setup for new developer', 'todo', 'normal', ['admin'], 9, ['it'], 2, -2],
  [11, 'Renew Google Workspace licences', 'in_progress', 'high', ['admin'], -1, ['it', 'renewals'], 1, -6],
];

const COMMENTS = [
  [1, 'sarah', 'Let\'s make sure proration works for mid-cycle upgrades before we ship.'],
  [1, 'omar', 'Yes — writing tests for that now. Webhook handler is almost done.'],
  [3, 'omar', 'Blocked on Apple\'s ITP cookie changes. @Sarah can we discuss options tomorrow?'],
  [15, 'ayesha', 'Found 142 broken links, mostly from the old /resources section.'],
  [26, 'priya', 'Budget approved at $12k for the first month. Keep CPA under $45.'],
  [27, 'jake', 'Conversion tracking is live, validating with Tag Assistant.'],
  [37, 'fatima', 'Shortlisted 6 candidates. Technical interviews next week.'],
];

tx(() => {
  for (const table of ['notifications', 'activity', 'time_entries', 'comments', 'checklist_items', 'task_tags', 'task_assignees', 'tasks', 'projects', 'spaces', 'team_members', 'teams', 'users']) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.exec("DELETE FROM sqlite_sequence");

  const hash = bcrypt.hashSync('password123', 10);
  const adminHash = bcrypt.hashSync('admin123', 10);
  USERS.forEach(([name, email, role, title, color], i) => {
    run('INSERT INTO users (name, email, password_hash, role, title, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      name, email, i === 0 ? adminHash : hash, role, title, color, stamp(-40));
  });
  TEAMS.forEach(([name, description, color, members], i) => {
    run('INSERT INTO teams (name, description, color) VALUES (?, ?, ?)', name, description, color);
    for (const m of members) run('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)', i + 1, U[m]);
  });
  DEFAULT_SPACES.forEach((s, i) => run('INSERT INTO spaces (name, description, color, position) VALUES (?, ?, ?, ?)', s.name, s.description, s.color, i + 1));
  PROJECTS.forEach(([space, name, color, owner, due, description]) => {
    run('INSERT INTO projects (space_id, name, description, color, owner_id, start_date, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      space + 1, name, description, color, U[owner], day(-30), day(due), stamp(-30));
  });

  let position = 0;
  const insertTask = ({ project, parent = null, title, status, priority, assignees, due, tags = [], estimate = null, created }) => {
    position += 1;
    const completed = status === 'done' ? stamp(Math.min(due ?? 0, 0)) : null;
    const { lastInsertRowid } = run(
      `INSERT INTO tasks (project_id, parent_id, title, description, status, priority, start_date, due_date, estimate_hours, position, created_by, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      project, parent, title, status, priority, day(created + 1), day(due), estimate, position,
      PROJECTS[project - 1] ? U[PROJECTS[project - 1][3]] : 1, stamp(created), stamp(created), completed,
    );
    const id = Number(lastInsertRowid);
    for (const a of assignees) run('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)', id, U[a]);
    for (const t of tags) run('INSERT INTO task_tags (task_id, tag) VALUES (?, ?)', id, t);
    run('INSERT INTO activity (task_id, project_id, user_id, action, created_at) VALUES (?, ?, ?, ?, ?)',
      id, project, U[assignees[0]] || 1, parent ? 'created this subtask' : 'created this task', stamp(created));
    if (status === 'done') {
      run('INSERT INTO activity (task_id, project_id, user_id, action, created_at) VALUES (?, ?, ?, ?, ?)',
        id, project, U[assignees[0]] || 1, 'changed status from In Progress to Done', completed);
    }
    return id;
  };

  const taskIds = [];
  for (const [p, title, status, priority, assignees, due, tags, estimate, created, checklist, subtasks] of TASKS) {
    const id = insertTask({ project: p + 1, title, status, priority, assignees, due, tags, estimate, created });
    taskIds.push(id);
    run('UPDATE tasks SET description = ? WHERE id = ?', `${title}.\n\nAcceptance criteria and notes go here.`, id);
    (checklist || []).forEach((item, i) => run('INSERT INTO checklist_items (task_id, text, done, position) VALUES (?, ?, ?, ?)', id, item, i < checklist.length / 2 ? 1 : 0, i));
    (subtasks || []).forEach((st, i) => insertTask({
      project: p + 1, parent: id, title: st, status: i === 0 ? 'done' : 'todo', priority: 'normal', assignees, due: due + i, created,
    }));
    if (estimate && status !== 'todo') {
      run('INSERT INTO time_entries (task_id, user_id, hours, note, date) VALUES (?, ?, ?, ?, ?)',
        id, U[assignees[0]], Math.round(estimate * 0.4 * 2) / 2 || 1, 'Work session', day(Math.max(created + 2, -3)));
    }
  }
  COMMENTS.forEach(([taskNum, who, body], i) => {
    run('INSERT INTO comments (task_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', taskIds[taskNum], U[who], body, `${day(-3)} 1${i}:00:00`);
  });
  run('INSERT INTO notifications (user_id, actor_id, task_id, message) VALUES (?, ?, ?, ?)', 1, U.fatima, taskIds[42], 'Fatima Ali assigned you to "Review software subscriptions"');
  run('INSERT INTO notifications (user_id, actor_id, task_id, message) VALUES (?, ?, ?, ?)', 1, U.fatima, taskIds[44], 'Fatima Ali commented on "Renew Google Workspace licences"');
});

console.log(`Seeded ${USERS.length} users, ${PROJECTS.length} projects and ${TASKS.length} tasks.`);
console.log('Sign in as admin@instacall.local / admin123 (other demo users use password123).');
