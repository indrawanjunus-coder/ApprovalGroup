# Overview

This project is an Enterprise PR & PO Approval System (ProcureFlow) designed as a mobile-friendly web application with a Bahasa Indonesia UI. It serves as a comprehensive procurement solution, managing purchase requests, purchase orders, multi-level approvals, vendor selection, and goods receiving.

Key capabilities include:
- End-to-end procurement workflow from PR creation to goods receipt.
- Multi-level, configurable approval workflows based on company, department, PR type, and amount.
- Master data management for departments and PR types.
- Specialized modules for Payment Processing (`Pembayaran`), Leave Management, and Duty Meal tracking.
- Robust user management with roles, multi-company assignments, and leave balance tracking.
- Integrated email notifications and a comprehensive audit log for system activities.

The system aims to streamline internal procurement processes, enhance transparency, and provide efficient management of employee-related requests like leave and duty meals within an enterprise environment.

# User Preferences

I prefer clear, concise communication. When making changes, prioritize iterative development and ask for confirmation before implementing major architectural shifts or significant code overhauls. Provide explanations for complex decisions or new features in a detailed yet understandable manner. I expect the agent to maintain the existing code style and project structure.

# System Architecture

The system is built as a pnpm workspace monorepo using Node.js 24 and TypeScript 5.9.

**Core Technologies:**
- **Backend:** Express 5 with `express-session` for session-based authentication.
- **Frontend:** React with Vite, styled using Tailwind CSS, and data managed with React Query.
- **Database:** PostgreSQL, interfaced via Drizzle ORM.
- **Validation:** Zod for schema validation, with `drizzle-zod` for ORM integration.
- **API Definition:** OpenAPI specification used with Orval for API client and Zod schema code generation.
- **Build Tool:** esbuild for CJS bundling.

**Architectural Patterns & Features:**
- **Monorepo Structure:** Divided into `api-server` (Express backend) and `pr-po-system` (React frontend) applications, along with shared `lib` packages for API specs, generated clients, Zod schemas, and Drizzle ORM schema.
- **Modular Design:** Features like Leave Management, Duty Meal, and Master Data are implemented as distinct modules with dedicated API endpoints and UI components.
- **Session-based Authentication:** Secure user authentication using SHA-256 + salt.
- **Multi-Company Support:** Core features (leave settings, approval rules, duty meal) are configurable per company. Users can be assigned to multiple companies/departments.
- **Dynamic Approval Workflows:** Configurable `approval_rules` allow for multi-level, amount-based escalation tailored to company, department, and PR type.
- **Partial Receiving:** `pr_receiving_records` and `pr_receiving_items` tables support tracking partial goods receipts for PRs.
- **Leave Balance Management:** Automated monthly accrual, year-end carryover with caps and expiry, and validation against requested leave days. User `join_date` is critical for eligibility.
- **Duty Meal Module:** Tracks employee duty meal expenses with per-company plafon settings, an approval workflow, and supports `bukti pembayaran` (payment proof) uploads. Replaces the `isHrd` pattern with `duty_meal_company_approvers` for granular approval delegation.
- **Centralized Settings:** A `settings` table and dedicated API endpoints manage system configurations, feature toggles, and company-specific parameters (e.g., leave accrual, SMTP details, duty meal settings).
- **Comprehensive Audit Trail:** All system activities are logged in the `audit_logs` table for traceability.
- **User Interface (UI):** Mobile-friendly design, Bahasa Indonesia localization, with standard UI components for navigation, tables, forms, and data visualization (e.g., Recharts for dashboards). `PaginationControls` component for all list pages.

# Additional Features (Latest)

## External Vendor Portal (`/external-portal/`)
A standalone React/Vite portal at `/external-portal/` for external vendors and internal users:
- **Vendor**: Register company, verify auth code, submit invoices (with Google Drive upload), view own invoices, reports
- **Internal User**: View all invoices, manage vendors, reports, portal settings (SMTP, limits)
- **Route file**: `artifacts/api-server/src/routes/external.ts` (1322 lines)
- **Pages**: login, register, verify-code, profile, submit-invoice, invoices, admin/(invoices, vendors, reports, settings, items, uoms)
- Login page of main portal shows "Login Portal Vendor" + "Daftar sebagai Vendor" buttons

## Dual Database Support (Replit DB + Neon PostgreSQL)
- **Dynamic DB Proxy**: `artifacts/api-server/src/lib/db.ts` — exports `db` as a JS Proxy that transparently routes all Drizzle operations to either Replit DB or Neon DB based on the current primary DB setting
- **Neon Drizzle Client**: `artifacts/api-server/src/lib/neonDrizzle.ts` — lazy singleton Drizzle client for Neon using the same schema as Replit
- **Primary DB Selector**: In Settings → Manajemen Database, admin can switch primary between Replit (default) and Neon. Saved to `settings` table, applied immediately, and persisted across restarts (loaded from DB in `index.ts`)
- **Dual Write Middleware**: `artifacts/api-server/src/lib/neonDualWrite.ts` — after each successful write, asynchronously syncs affected tables from primary→secondary (supports both Replit→Neon and Neon→Replit)
- **Manual Sync**: Streaming SSE endpoint `/api/settings/neon/sync` syncs all 32 tables with live progress in the UI
- All 21 route files import `db` from `../lib/db.js` (dynamic proxy), not directly from `@workspace/db`

## Per-User Feature Access Control
- Global feature flags (Duty Meal, Pembayaran, Purchase Request) in Settings → Manajemen Fitur
- Per-user overrides in User Management → Akses Fitur checkboxes
- `AppLayout.tsx` gates navigation items using both global flags + per-user settings

# External Dependencies

- **PostgreSQL (Replit):** Primary database (default) via `DATABASE_URL`
- **PostgreSQL (Neon):** Optional secondary/primary cloud DB via `NEON_DATABASE_URL`
- **Nodemailer:** Email notifications; configurable SMTP settings per portal (main + external)
- **Recharts:** Dashboard data visualizations
- **Google Drive API:** External portal invoice file uploads via OAuth service account