# Cutilora Node

Node.js implementation of the Cutilora clinic platform API.

## Stack

- Node.js 22+ and TypeScript
- Express 5
- MongoDB 7+ and Mongoose
- Zod for request and environment validation
- Vitest + Supertest for tests

## Architecture

The backend follows this request flow:

Route → Middleware → Controller → Service → Repository → Model/Database

- **Routes:** HTTP methods, paths, middleware and controller handlers only.
- **Middleware:** Authentication, tenant-context resolution, authorization and error handling. Persistence lookups are delegated to repositories.
- **Controllers:** Parse/validate request input, invoke services and translate results into HTTP responses.
- **Services:** Business rules and orchestration; no Mongoose queries.
- **Repositories:** All database reads and writes.
- **Models:** Mongoose schemas and indexes only.
- **Config/database:** Environment and database connection setup.

```text
src/
  app/                 Express application
  config/              Environment configuration
  database/            MongoDB connection
  middleware/          Authentication, tenant context, authorization, errors
  models/              Mongoose models and indexes
  modules/
    auth/              Routes, controller, service, repository, validation, security
    tenancy/           Routes, controller, service, repository, validation
    geo/               Geo domain module
  server.ts
```

Do not put database queries in routes, controllers or middleware. Do not bypass repositories from services. Tenant-owned repository queries must use trusted tenant/clinic/branch context, never identifiers from request bodies or query strings.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Health check: `GET /api/v1/health`.

## Development commands

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm start
```

## Domain model

The domain hierarchy is **Tenant → Clinic → Branch**. A tenant is the SaaS customer/account and the isolation boundary. Clinics and branches are operating entities within that tenant. A global user identity can hold memberships in multiple tenants and scopes.

## Current API

### Authentication

- `POST /api/v1/auth/login`: accepts email/password and returns a bearer access token plus active memberships.
- `GET /api/v1/auth/me`: returns the authenticated identity and active memberships.
- `POST /api/v1/auth/dev/bootstrap-admin`: development-only first platform-admin bootstrap.

### Platform administration

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/platform/tenants` | List tenants |
| POST | `/api/v1/platform/tenants` | Create tenant, owner membership and optional initial clinic |
| PATCH | `/api/v1/platform/tenants/:tenantId/status` | Activate/suspend tenant |

### Tenant context

Tenant-scoped routes require a bearer token and `X-Tenant-Id`. `X-Clinic-Id` and `X-Branch-Id` select narrower contexts.

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/v1/tenant/context` | Active tenant membership |
| GET/POST | `/api/v1/tenant/clinics` | Tenant owner/admin |
| GET/POST | `/api/v1/tenant/branches` | Clinic context; create requires tenant/clinic manager role |

## Security status

Access tokens are currently stateless. Refresh-token rotation/revocation, membership invitations, audit logs, permission-based RBAC and automated tenant-isolation tests remain outstanding. Do not consider this API production-ready until those controls and automated tests are implemented.
