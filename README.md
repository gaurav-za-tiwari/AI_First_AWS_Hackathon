# AML Case Manager — Enterprise Edition v2.0
### React + Express.js + Azure SQL Server

---

## Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Frontend  | React 18, Axios, Lucide icons, DM Sans font     |
| Backend   | Node.js, Express 4, JWT, bcryptjs               |
| Database  | Azure SQL Server (mssql driver)                 |
| Auth      | JWT (jsonwebtoken) + bcrypt password hashing    |

---

## Project Structure

```
aml-enterprise/
├── server/                        ← Express.js API
│   ├── index.js                   ← App entrypoint (port 4000)
│   ├── db/
│   │   └── connection.js          ← Azure SQL pool + full T-SQL DDL schema
│   ├── middleware/
│   │   └── auth.js                ← JWT bearer token verification
│   └── routes/
│       ├── auth.js                ← POST /api/auth/login · GET /api/auth/me
│       ├── alerts.js              ← Alerts CRUD + status transition + audit log
│       ├── users.js               ← Full user CRUD + view access management
│       └── views.js               ← Alert views + workflow config
│
├── src/                           ← React frontend
│   ├── datasource/
│   │   ├── index.js               ← ★ Single switch point (mock ↔ azure-sql)
│   │   ├── datasourceImpl.js      ← Runtime mode selector
│   │   ├── mockDataSource.js      ← In-memory data (no backend needed)
│   │   └── apiDataSource.js       ← Calls Express → Azure SQL
│   ├── components/
│   │   ├── alerts/                ← Workbench.js, AlertDetail.js
│   │   ├── users/                 ← UserManagement.js
│   │   ├── layout/                ← Login.js, Sidebar.js, TopHeader.js
│   │   └── common/                ← UI.js, Badges.js
│   ├── context/AuthContext.js
│   ├── theme/index.js
│   └── App.js
│
├── .env                           ← All config (DB credentials + mode)
└── package.json
```

---

## Quick Start — Mock Mode (No DB, No Server)

```bash
cd aml-enterprise
npm install
npm start
```
Opens at **http://localhost:3000**. All data is in-memory. No backend needed.

---

## Production Setup — Azure SQL

### 1. Install frontend dependencies
```bash
npm install
```

### 2. Install server dependencies
```bash
cd server && npm install && cd ..
```

### 3. Create your Azure SQL database
In the Azure Portal:
- Create a **SQL Server** resource (note the server name: `yourserver.database.windows.net`)
- Create a **SQL Database** named `aml_case_manager`
- Under the server's **Firewall settings**, allow your client IP or Azure services

### 4. Create the schema
Open **Azure Data Studio** or the Azure Portal **Query Editor** and run the full DDL
from the large comment block at the top of `server/db/connection.js`.

Tables created:
- `views` — alert view registry
- `roles` — role permission definitions
- `users` — user accounts (bcrypt-hashed passwords)
- `user_view_access` — many-to-many: user ↔ alert views
- `alerts` — all AML alert records
- `workflow_config` — allowed status transitions per alert type
- `audit_log` — immutable workflow transition history

### 5. Seed sample data
Run the seed script (after filling in DB credentials in .env):
```bash
node server/db/seed.js
```
Or insert manually — sample INSERT statements are in `server/db/seed.js`.

### 6. Configure `.env`
```env
DB_SERVER=yourserver.database.windows.net
DB_PORT=1433
DB_NAME=aml_case_manager
DB_USER=your_admin_user
DB_PASSWORD=your_password

JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=8h

REACT_APP_DATASOURCE=azure-sql
```

### 7. Start both servers
```bash
# Terminal 1 — Express API (port 4000)
npm run server

# Terminal 2 — React app (port 3000)
npm start
```

---

## Azure SQL — Key T-SQL Differences from MySQL

| Feature              | MySQL                    | Azure SQL (T-SQL)              |
|---------------------|--------------------------|--------------------------------|
| Auto-increment ID   | `AUTO_INCREMENT`         | `IDENTITY(1,1)`                |
| Get inserted ID     | `LAST_INSERT_ID()`       | `OUTPUT INSERTED.id`           |
| Pagination          | `LIMIT n OFFSET m`       | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| String aggregation  | `GROUP_CONCAT(...)`      | `STRING_AGG(..., ',')`         |
| Current UTC time    | `NOW()`                  | `GETUTCDATE()`                 |
| JSON column type    | `JSON`                   | `NVARCHAR(MAX)` (with `ISJSON` check) |
| Boolean column      | `TINYINT(1)`             | `BIT`                          |
| Toggle boolean      | `NOT active`             | `CASE WHEN active=1 THEN 0 ELSE 1 END` |
| Reserved words      | backtick `` `group` ``   | square bracket `[group]`       |
| Upsert pattern      | `INSERT IGNORE`          | `IF NOT EXISTS ... INSERT`     |
| String params       | `?` positional           | `@paramName` named             |

---

## Datasource Switch

One setting in `.env` controls the entire data layer:

```env
REACT_APP_DATASOURCE=mock       # default — no backend needed
REACT_APP_DATASOURCE=azure-sql  # live Azure SQL via Express API
```

`src/datasource/index.js` → `datasourceImpl.js` routes all calls transparently.

---

## API Endpoints

| Method | Path                          | Role Required   | Description                     |
|--------|-------------------------------|-----------------|---------------------------------|
| POST   | /api/auth/login               | Public          | Login → JWT                     |
| GET    | /api/auth/me                  | Any             | Decode current token            |
| GET    | /api/alerts                   | Any             | List alerts (filtered + paged)  |
| GET    | /api/alerts/:id               | Any             | Single alert detail             |
| PATCH  | /api/alerts/:id/status        | Any             | Transition status + audit entry |
| GET    | /api/alerts/:id/audit         | Any             | Transition history              |
| GET    | /api/views                    | Any             | Views for current user          |
| GET    | /api/views/all                | Any             | All views (admin forms)         |
| GET    | /api/views/workflow/:typeId   | Any             | Workflow rules for alert type   |
| GET    | /api/users                    | Admin/Supervisor| List all users                  |
| POST   | /api/users                    | Admin/Supervisor| Create user                     |
| GET    | /api/users/:id                | Admin/Supervisor| Get user                        |
| PUT    | /api/users/:id                | Admin/Supervisor| Update user + view access       |
| PATCH  | /api/users/:id/toggle         | Admin/Supervisor| Toggle active/inactive          |
| DELETE | /api/users/:id                | Admin/Supervisor| Delete user                     |
| GET    | /api/health                   | Public          | Health check                    |

---

## RBAC

| Permission         | Admin | Supervisor | Analyst  | Read Only |
|-------------------|-------|-----------|----------|-----------|
| View alerts        | All   | All       | Own only | All       |
| Transition status  | ✓     | ✓         | ✓        | —         |
| Assign alerts      | ✓     | ✓         | —        | —         |
| Manage users       | ✓     | —         | —        | —         |

---

## Demo Credentials (Mock Mode)

| Username     | Password      | Role       | Allowed Views          |
|-------------|--------------|------------|------------------------|
| `admin`     | `Admin@123`  | Admin      | All                    |
| `supervisor`| `Super@123`  | Supervisor | All                    |
| `analyst1`  | `Analyst@123`| Analyst    | Party IB               |
| `analyst2`  | `Analyst@123`| Analyst    | Party IB + WMA         |
| `analyst3`  | `Analyst@123`| Analyst    | Party WMA + CB         |
| `readonly`  | `Read@123`   | Read Only  | All (view only)        |
