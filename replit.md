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

# External Dependencies

- **PostgreSQL:** Primary database for all application data.
- **Nodemailer:** Used by the `api-server` for sending email notifications, configured via SMTP settings stored in the database.
- **Recharts:** Employed on the dashboard for rendering various charts and data visualizations.