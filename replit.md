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
  - Special code `pembayaran`: PRs of this type appear in the **Pembayaran** sidebar section instead of Penerimaan Barang.
- **SMTP**: `GET/PUT /api/settings/smtp`, test email `POST /api/settings/smtp/test`

### Pembayaran (Payment Processing)
- Sidebar entry "Pembayaran" visible to admin and purchasing roles. Shows badge count.
- Page at `/pembayaran` lists PRs with `type='pembayaran'` in `approved` or `vendor_selected` status.
- Backend: `GET /api/pembayaran`, `POST /api/pembayaran/:id/process` (marks PR as `closed`, admin/purchasing only).
- PRs of type `pembayaran` are automatically excluded from the Penerimaan Barang page.

### Leave Management (Sidebar: Manajemen Cuti)
- Sidebar menu "Manajemen Cuti" (CalendarDays icon) visible to all roles at `/leave-management`.
- **Tab: Laporan Cuti** — filterable table of all leave PRs (type='leave') by year/status/department/search. Rows are clickable and open the PR detail. Admin sees all; non-admin sees only their department/company.
- **Tab: Saldo Cuti** — per-user leave balance table. Columns: Jatah, Carry Over, Terpakai, Sisa. Admin can click pencil icon to open edit dialog and update any user's balance for a given year. Non-admin sees a read-only scoped view (same dept/company).
- Backend: `GET /api/leave/report`, `GET /api/leave/balances`, `PUT /api/leave/balances/:userId` (admin only).

### Leave Balance Validation
- When creating a leave PR, the system validates requested days against the user's remaining leave balance.
- Balance fetched from `GET /api/users/:id/leave-balance`. Admin sets balance via `PUT /api/users/:id/leave-balance`.
- Backend validation: counts pending leave PRs (not rejected/closed) + requested days vs available days. Returns `400` if exceeded.
- Frontend: shows a real-time balance indicator (blue = ok, red = exceeded), disables submit when exceeded.
- Formula: `availableDays = balanceDays + carriedOverDays - usedDays` (admin manages usedDays manually or via leave processing).

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

### Duty Meal Module
- Sidebar menu "Duty Meal" (Utensils icon) accessible by all roles at `/duty-meal`
- **Employee tab**: Input duty meal entries (date, brand, total bill before tax, description), filter by month/year
- **Monthly summary card**: Shows total spent, plafon, remaining sisa or over-plafon (red) with bank account info
- **Over-plafon alert**: When monthly total exceeds plafon, shows red warning with over amount and bank transfer info
- **Status flow**: pending → approved/rejected (by Duty Meal Approver)
- **Upload bukti pembayaran**: File upload as base64 stored in DB, viewable via preview modal
- **Report tab**: Duty Meal Approvers see entries of users in their assigned companies; admin sees all

#### Per-Company Duty Meal Approver System
- **Table**: `duty_meal_company_approvers (id, company_id, user_id, created_at)` with unique(company_id, user_id)
- Admin assigns specific users as approvers for specific PT via Settings → "Approver Duty Meal per PT"
- `isDutyMealApprover` + `approverCompanyIds[]` exposed from `/api/auth/me`
- Old `isHrd` pattern (department=HRD) fully replaced by per-company approver check
- Approver sees/approves only entries from users whose `hiredCompanyId` is in their assigned companies
- `canApproveForCompany(user, companyId)` helper used in all approve/reject/view endpoints

#### API Endpoints - Duty Meal
- `GET /api/duty-meals?month=YYYY-MM` — list (own for regular, assigned companies for approver, all for admin)
- `POST /api/duty-meals` — create entry (checks enabled flag + lock date)
- `PUT /api/duty-meals/:id` — update own pending entry
- `DELETE /api/duty-meals/:id` — delete own pending entry
- `POST /api/duty-meals/:id/upload-proof` — upload proof (base64)
- `PUT /api/duty-meals/:id/approve` — approve (checks canApproveForCompany)
- `PUT /api/duty-meals/:id/reject` — reject (checks canApproveForCompany)
- `GET /api/duty-meals/my-plafon` — get current user's plafon
- `GET/POST/PUT/DELETE /api/duty-meals/plafon` — manage plafon per company/jabatan (admin)
- `GET /api/duty-meals/company-approvers` — list all approver assignments (admin)
- `POST /api/duty-meals/company-approvers` — assign user as approver for PT (admin)
- `DELETE /api/duty-meals/company-approvers/:id` — remove approver assignment (admin)
- `GET/POST/PUT/DELETE /api/brands` — manage brand master (admin)
- `GET/PUT /api/settings/duty-meal` — duty meal settings

#### Duty Meal Settings (in Settings page)
- **Enable/disable** toggle — if disabled, no access for non-admin
- **Perusahaan sumber brand** — which company's brands to show in dropdown
- **Tanggal lock** — day of month after which previous month entries are locked
- **Masa kerja minimum (duty_meal_min_months)** — months after joinDate before employee can submit. 0 = disabled. Default 3. Checked on POST `/api/duty-meals`
- **Rekening pembayaran** — bank name, account number, account name (shown when over-plafon)
- **Google Drive** — folder ID + service account email (ready for future GDrive integration)

#### Master Brand (in Settings page)
- Brand belongs to a company; many brands per company
- Fields: companyId, name, isActive
- Admin can create, edit (name + active status), delete

#### Master Plafon (in Settings page)
- Plafon per company + jabatan (position)
- Default positions: General Manager (2jt), Manager (1.3jt), Assistant Manager (1jt), Staff (500rb)
- Custom positions supported
- Matching: exact first, then partial (contains "manager" etc.), fallback to Staff

### Settings
- Feature toggles per company (PO feature on/off)
- Company leave settings (accrual days/month, max carryover days, carryover expiry month/day)
- **Leave Eligibility** (`/api/settings/leave-eligibility`): `leave_min_months` — months after joinDate before accrual starts. Default 3.
- Approval rules management
- SMTP email configuration (host, port, user, password, security, from)
- **Duty Meal**: enable/disable, company source for brands, lock date, min months (eligibility), bank account, Google Drive config

### User Master (`join_date` field)
- `join_date` (date column) on `users` table — stored as `YYYY-MM-DD`
- Exposed as `joinDate` in all user API responses
- Admin can set/edit via User List form (Tanggal Bergabung date input)
- Used for eligibility gating: duty meal (duty_meal_min_months), leave accrual (leave_min_months)
- Leave accrual skips months before `joinDate + leave_min_months`; from eligible month accrual runs normally
- Duty meal: backend blocks POST if today < `joinDate + duty_meal_min_months`; frontend shows warning banner + disables button
- User List table shows "Tgl Bergabung" column
- Leave Saldo table shows "Tgl Eligible Cuti" (calculated from joinDate + leave_min_months)

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
- `brands` — Brand master per company (id, company_id, name, is_active)
- `duty_meal_plafon` — Duty meal plafon per company + position (id, company_id, position_name, amount)
- `duty_meals` — Employee duty meal entries (id, user_id, company_id, brand_id, meal_month YYYY-MM, meal_date, total_bill_before_tax, description, status, payment_proof_data base64, approved_by, approved_at, rejection_reason)
