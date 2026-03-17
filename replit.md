# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Enterprise PR & PO Approval System (ProcureFlow) — mobile-friendly, Bahasa Indonesia UI.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 + express-session
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + React Query

## Applications

### PR & PO Approval System (`artifacts/pr-po-system`)
- Preview Path: `/`
- Enterprise procurement web app with mobile-friendly UI
- Language: Bahasa Indonesia

### API Server (`artifacts/api-server`)
- Preview Path: `/api`
- Express REST API backend with session auth

## Default Login Accounts

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |
| Manager (Approver) | manager1 | admin123 |
| Director (Approver) | director1 | admin123 |
| Finance Director (Approver) | finance1 | admin123 |
| Staff (User) | user1 | admin123 |
| Purchasing | purchasing1 | admin123 |

## Features

### Master Data (Settings Page)
- **Master Departemen**: CRUD for departments — `GET/POST/PUT/DELETE /api/departments` (write: admin only). Used in user create/edit and approval rules dropdowns.
- **Master Jenis Request (PR Types)**: CRUD for PR types — `GET/POST/PUT/DELETE /api/pr-types` (write: admin only). System types (purchase/repair/leave) have `isSystem=true` and cannot be deleted. Type dropdown in PR Create and Approval Rules forms fetches from this master.
- **SMTP**: `GET/PUT /api/settings/smtp`, test email `POST /api/settings/smtp/test`

### Authentication
- Session-based auth (SHA-256 + salt)
- Change Password: `POST /api/auth/change-password` — UI: key icon in sidebar profile

### User Management
- Roles: admin, user, approver, purchasing
- `hiredCompanyId` — determines which company's leave settings apply
- Department field uses dropdown from Master Departemen when departments exist
- Multi-company assignment (user can work in multiple companies/departments)
- Leave balance: `GET /api/users/:id/leave-balance`, `PUT /api/users/:id/leave-balance`
  - Auto-accrues based on company's `accrualDaysPerMonth` setting from hire month
  - Year-end carryover capped at `maxCarryoverDays`, expires on `carryoverExpiryMonth/Day`

### Purchase Request Types
- **purchase** — Regular procurement
- **repair** — Equipment repair
- **leave** — Leave request (deducts from user's leave balance)

### Multi-level Approval Workflow
- Configured per company + department + PR type
- Amount-based rules (escalation tiers)

### Vendor & Attachment Flow
- Approvers can attach vendor proposals and select a vendor after approval

### PO Management (toggle per company)
- When PO feature ON: purchasing creates PO → receive via PO
- When PO OFF: approver selects vendor → vendor_selected → requester receives items

### Partial Receiving (Goods Receipt)
- Item-level qty tracking: `pr_receiving_items` table
- `receiving_status`: none → partial → closed
- `POST /api/purchase-requests/:id/receive-items` — Submit received qtys per item
- `POST /api/purchase-requests/:id/close-receiving` — Force-close receiving
- History of all receiving records shown in PR detail

### Leave Balance Management
- Monthly accrual per company setting
- Year-end carryover with cap + expiry
- `GET|PUT /api/settings/company-leave` — Per-company leave config (accrual, max carryover, expiry)

### Dashboard
- Stat cards: pending approvals, my pending PRs, pending POs, total PRs
- PR status distribution bar chart (Recharts)
- Tabbed recent list: recent PRs vs recent leave requests
- Vendor lead time horizontal bar chart (avg days from PO issue/vendor selected → receiving closed)
- Leave usage chart: per-department stacked bars (manager view) or per-month bars (user view)

### Pagination
- All list pages (PR, PO, Approvals, Users, Audit Logs) have `PaginationControls` component
- Supports 20/50/100 items per page with prev/next navigation
- Backend routes all accept `page` + `limit` query params, return `total` in response

### Email Notifications (SMTP)
- `nodemailer` email service in `artifacts/api-server/src/lib/email.ts`
- Reads SMTP config from settings table (smtp_host, smtp_port, smtp_user, smtp_password, smtp_security, smtp_from)
- Sends notifications on: approval request, vendor attachment needed, PO issued, receiving ready, new user created
- Silently skips if SMTP not configured
- SMTP config UI in Settings page: `GET|PUT /api/settings/smtp`

### Audit Log Page
- Route: `/audit-logs` — shows all system activity
- Columns: timestamp, user, action (color-coded badge), entity type/ID, details
- Paginated with PaginationControls

### Settings
- Feature toggles per company (PO feature on/off)
- Company leave settings (accrual days/month, max carryover days, carryover expiry month/day)
- Approval rules management
- SMTP email configuration (host, port, user, password, security, from)

## PR Status Flow

```
draft → waiting_approval → approved → (vendor_selected | PO created) → completed
receiving_status (separate): none → partial → closed
```

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── pr-po-system/       # React frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── users.ts                    # users, userCompanies, leaveBalances
│           ├── purchase-requests.ts        # PRs, items, attachments, receivingItems, receivingRecords
│           ├── approvals.ts
│           ├── purchase-orders.ts
│           ├── notifications.ts
│           ├── audit-logs.ts
│           └── settings.ts                 # companyLeaveSettings
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## API Routes

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

### Users
- `GET|POST /api/users`
- `PUT|DELETE /api/users/:id`
- `GET /api/users/:id/leave-balance`
- `PUT /api/users/:id/leave-balance`

### Purchase Requests
- `GET|POST /api/purchase-requests`
- `GET /api/purchase-requests/:id`
- `PUT /api/purchase-requests/:id`
- `POST /api/purchase-requests/:id/submit`
- `POST /api/purchase-requests/:id/receive-items` — Partial receiving
- `POST /api/purchase-requests/:id/close-receiving` — Force close
- `POST /api/purchase-requests/:id/select-vendor`
- `POST /api/purchase-requests/:id/cancel`

### Approvals
- `GET /api/approvals`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`
- `GET|POST /api/approval-rules`
- `PUT|DELETE /api/approval-rules/:id`

### Purchase Orders
- `GET|POST /api/purchase-orders`
- `GET /api/purchase-orders/:id`
- `POST /api/purchase-orders/:id/issue`
- `POST /api/purchase-orders/:id/receive`
- `POST /api/purchase-orders/:id/cancel`

### Settings
- `GET|PUT /api/settings`
- `GET|PUT /api/settings/company-leave`
- `GET|PUT /api/settings/smtp`

### Other
- `GET /api/notifications`
- `PUT /api/notifications/:id/read`
- `GET /api/audit-logs`
- `GET /api/dashboard`
- `GET|POST /api/companies`
- `GET|POST /api/departments`

## Database Tables

- `users` — User accounts with roles, hiredCompanyId
- `user_companies` — Multi-company assignments (userId, companyId, departmentId, position)
- `leave_balances` — Per user per year: accrual, carryover, used
- `purchase_requests` — PR records with receivingStatus
- `pr_items` — PR line items (qty, unit, price)
- `pr_attachments` — Vendor proposals & attachments
- `pr_receiving_records` — Receiving batch records
- `pr_receiving_items` — Per-item received qty per batch
- `approvals` — Approval workflow records
- `approval_rules` — Per company+dept+type+amount rules
- `approval_rule_levels` — Hierarchy levels per rule
- `purchase_orders` — PO records
- `po_items` — PO line items
- `notifications` — User notifications
- `audit_logs` — Audit trail
- `companies` — Company list
- `departments` — Department list
- `settings` — System settings key-value store
- `company_leave_settings` — Per-company leave config (accrual, carryover, expiry)
