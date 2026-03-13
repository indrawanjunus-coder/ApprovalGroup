# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Enterprise PR & PO Approval System.

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
- Features: User Management, Purchase Request, Multi-level Approval, Purchase Order, Dashboard, Notifications, Audit Log

### API Server (`artifacts/api-server`)
- Preview Path: `/api`
- Express REST API backend with session auth

## Default Login Accounts

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | admin123 |
| Manager (Approver) | manager1 | manager123 |
| Director (Approver) | director1 | director123 |
| Finance Director (Approver) | finance1 | finance123 |
| Staff (User) | user1 | user123 |
| Purchasing | purchasing1 | purchasing123 |

## Approval Rules (Pre-configured)

- ≤ 5 Juta: Manager approval
- 5-20 Juta: Manager + Director approval
- > 20 Juta: Manager + Director + Finance Director approval

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
│           ├── users.ts
│           ├── purchase-requests.ts
│           ├── approvals.ts
│           ├── purchase-orders.ts
│           ├── notifications.ts
│           └── audit-logs.ts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## API Routes

- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user
- `GET|POST /api/users` — User management
- `GET|POST /api/purchase-requests` — PR CRUD
- `POST /api/purchase-requests/:id/submit` — Submit PR for approval
- `POST /api/purchase-requests/:id/receive` — Receive goods
- `GET /api/approvals` — Pending approvals for current user
- `POST /api/approvals/:id/approve` — Approve PR
- `POST /api/approvals/:id/reject` — Reject PR
- `GET|POST /api/approval-rules` — Approval rules management
- `GET|POST /api/purchase-orders` — PO management
- `POST /api/purchase-orders/:id/issue` — Issue PO
- `POST /api/purchase-orders/:id/receive` — Receive PO
- `GET /api/notifications` — Notifications
- `GET /api/audit-logs` — Audit logs (admin only)
- `GET|PUT /api/settings` — System settings
- `GET /api/dashboard` — Dashboard stats

## Database Tables

- `users` — User accounts with roles
- `purchase_requests` — PR records
- `pr_items` — PR line items
- `approvals` — Approval workflow records
- `approval_rules` — Amount-based approval rules
- `approval_rule_levels` — Approval hierarchy levels
- `purchase_orders` — PO records
- `po_items` — PO line items
- `notifications` — User notifications
- `audit_logs` — Audit trail
- `settings` — System settings key-value store
