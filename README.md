# Cutilora Node

Node.js implementation of the Cutilora clinic platform API.

## Stack

- Node.js + TypeScript
- Express
- MongoDB + Mongoose
- Zod for environment and request validation
- Vitest + Supertest for tests

## Requirements

- Node.js 22+
- MongoDB 7+

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The API health endpoint is available at `GET /api/v1/health`.

## Project structure

```text
src/
  app/          Express application and server entry point
  config/       Environment configuration
  database/     MongoDB connection
  modules/      Domain modules (geo, tenancy, ...)
  shared/       Cross-cutting middleware and utilities
tests/
```

## Development

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm start
```

## Scope

This repository implements the Cutilora clinic web product API. The patient mobile application remains out of scope.


## Identity, tenancy and access control

The domain hierarchy is **Tenant → Clinic → Branch**. A tenant is the SaaS customer/account and the isolation boundary; clinics and branches are operating locations within that tenant. A global user identity may hold memberships in multiple tenants and scopes.

### Authentication

- `POST /api/v1/auth/login` accepts `{ "email", "password" }` and returns a bearer access token and the user's active tenant memberships.
- `GET /api/v1/auth/me` returns the authenticated identity and active memberships.
- `POST /api/v1/auth/dev/bootstrap-admin` creates the first platform administrator only when `NODE_ENV` is not `production`. In production, provision the first platform admin through a controlled one-off script/console operation.
- Platform administration routes require a platform-admin bearer token.

### Platform administration

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/platform/tenants` | List tenants |
| POST | `/api/v1/platform/tenants` | Create tenant, owner membership and optional initial clinic |
| PATCH | `/api/v1/platform/tenants/:tenantId/status` | Activate/suspend tenant |

Tenant creation body:
```json
{
  "name": "Example Group",
  "slug": "example-group",
  "owner": { "name": "Account Owner", "email": "owner@example.com", "password": "use-a-long-unique-password" },
  "initialClinic": { "name": "Example Dermatology", "slug": "example-dermatology" }
}
```

### Tenant context

Tenant-scoped routes require a bearer token and `X-Tenant-Id`. `X-Clinic-Id` and `X-Branch-Id` are optional additional scope selectors. The server validates active membership, tenant/clinic/branch ownership, and branch assignments before setting `req.tenantContext` and `req.tenantId`. Never trust tenant identifiers from request bodies or query strings.

| Method | Endpoint | Required scope/role |
|---|---|---|
| GET | `/api/v1/tenant/context` | Active tenant membership |
| GET | `/api/v1/tenant/clinics` | Tenant owner/admin |
| POST | `/api/v1/tenant/clinics` | Tenant owner/admin |
| GET | `/api/v1/tenant/branches` | Clinic context |
| POST | `/api/v1/tenant/branches` | Tenant owner/admin or clinic admin/manager |

### Membership roles and scopes

- Tenant scope: `tenant_owner`, `tenant_admin`, `billing_admin`.
- Clinic scope: `clinic_admin`, `clinic_manager`.
- Branch scope: `branch_manager`, `staff`, `provider`, `receptionist`.
- Membership records are tied to a tenant, optionally a clinic, and optionally a set of assigned branches.

### Mandatory tenant isolation rule

Every tenant-owned model must carry `tenantId`. Clinic-owned models must carry both `tenantId` and `clinicId`; branch-owned records must also carry `branchId` where appropriate. Every read, update and delete query must scope by the trusted IDs from `req.tenantContext`, not client-provided IDs. Compound unique indexes should include the tenant/parent scope (for example `{ tenantId, slug }` or `{ clinicId, slug }`).

Set `JWT_SECRET` to a cryptographically random value of at least 32 characters. Access tokens are currently stateless; implement refresh-token rotation/revocation, invitation acceptance, audit logs and automated tenant-isolation tests before production rollout.
