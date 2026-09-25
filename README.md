# Instacall PM

A self-hosted project management app, similar to ClickUp, for software development, SEO, digital marketing and operations teams.

## Features

- **Spaces → Projects → Tasks → Subtasks.** Four spaces are created by default: Software Development, SEO, Digital Marketing and Operations. Add more at any time.
- **Tasks** have:
  - a status: To Do, In Progress, In Review, Blocked or Done
  - a priority: Urgent, High, Normal or Low
  - more than one assignee, plus start and due dates
  - an hour estimate, tags, a description, subtasks, a checklist, time logs, comments with @mentions, and a full activity history
- **Views:**
  - **List:** group by status, priority, due date, assignee or project, and edit fields inline.
  - **Board:** Kanban view. Drag cards to change a task's status or priority.
  - **Calendar:** month or week view. Drag tasks to reschedule them, or drag tasks that have no date onto a day.
- **Dashboard:**
  - KPIs: open, in progress, overdue, due this week and completed tasks
  - Charts: tasks by status, open tasks by priority, and created vs. completed tasks over the last 14 days
  - Lists: my tasks, overdue tasks, upcoming deadlines, progress for each space and project, team workload and recent activity
  - Filter everything by space.
- **My Tasks:** everything assigned to you, grouped into Overdue, Today, Next 7 days, Later and No date.
- **Team management:**
  - Members, with three roles: admin, manager and member
  - Teams (Engineering, SEO, Marketing, Operations)
  - A workload view showing open, overdue and high-priority tasks and estimated hours for each person
  - Deactivate an account instead of deleting it.
- **Inbox:** you get a notification when someone assigns you, comments on your task, @mentions you, or moves your task to review, blocked or done.
- **Global search** (Ctrl+K). A task you open gets a shareable link (`?task=123`). The app supports dark mode and works on phones.

### Roles

| Role    | Can do                                                          |
|---------|-----------------------------------------------------------------|
| Admin   | Everything, including adding, editing and deactivating users    |
| Manager | Create and edit spaces, projects and teams; delete any task     |
| Member  | Create, edit, comment on and track time on tasks                |

## Tech stack

- **Backend:** Node.js 22.13 or later, Express 5, and SQLite through Node's built-in `node:sqlite`. There are no native modules to compile. Authentication uses JWTs.
- **Frontend:** React 19, React Router and Vite. The styling is plain CSS, with no UI framework.

## Getting started

```bash
npm install
npm run seed     # optional: load demo users, projects and tasks
npm run dev      # API on :3001, web app on http://localhost:5173
```

The first time the server starts with an empty database, it creates an admin account and the four default spaces:

- **Email:** `admin@instacall.local`
- **Password:** `admin123`

To set your own admin account on first start instead, set the `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME` environment variables.

The demo data (`npm run seed`) adds 9 more users, all with the password `password123`, for example `sarah@instacall.local`. **Running the seed wipes the database**, so don't run it once you have real data.

## Production

```bash
npm run build    # builds the frontend into dist/
npm start        # serves the API and the built app on PORT (default 3001)
```

Environment variables:

| Variable        | Default     | Purpose                                                              |
|-----------------|-------------|----------------------------------------------------------------------|
| `PORT`          | `3001`      | HTTP port                                                            |
| `DATA_DIR`      | `./data`    | Where the SQLite database (`instacall.db`) is stored                 |
| `JWT_SECRET`    | auto        | Token signing secret. If not set, one is generated and saved to `DATA_DIR`. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | see above | First admin account |

To back up, copy the `data/` directory. Put the app behind a reverse proxy with HTTPS (nginx, Caddy, IIS) when you expose it to the internet.

## Project layout

```
server/
  index.js          Express app and static hosting
  db.js             SQLite schema and helpers
  auth.js           JWT auth and role checks
  bootstrap.js      First-run admin account and default spaces
  seed.js           Demo data (npm run seed)
  taskQuery.js      Shared task query and hydration
  routes/           auth, users, teams, spaces, projects, tasks, dashboard, notifications
client/src/
  main.jsx          Routes and app shell
  store.jsx         Global state (user, spaces, projects, users) and the useTasks hook
  components/       Layout, task detail modal, create modal, pickers, modals
  views/            ListView, BoardView, CalendarView
  pages/            Dashboard, MyTasks, AllTasks/Calendar, Space, Project, Team, Inbox, Login
```
