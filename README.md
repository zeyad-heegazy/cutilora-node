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

Each business module owns its implementation and organizes it by responsibility. Shared infrastructure lives in `src/shared`.

```text
src/
  app/
  config/
  database/
  modules/
    auth/
      controllers/ middleware/ models/ repositories/ routes/ services/ types/ validations/
    tenancy/
      controllers/ middleware/ models/ repositories/ routes/ services/ types/ validations/
    geo/
      controllers/ data/ models/ repositories/ routes/ services/ validations/
  shared/
    middleware/
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
npm run seed:geo
```

## Domain model

The domain hierarchy is **Tenant → Clinic → Branch**. A tenant is the SaaS customer/account and the isolation boundary. Clinics and branches are operating entities within that tenant. A global user identity can hold memberships in multiple tenants and scopes.

## Geo domain

The geographic hierarchy mirrors the Laravel application: **Country → Governorate → City → District**. Each record stores an English name, optional Arabic name, optional source code, parent reference and timestamps. The starter data includes Egypt and Saudi Arabia and is imported from the same Laravel JSON datasets.

Run `npm run seed:geo` after configuring `.env`. The seeder is repeatable and upserts records by source code within their parent, falling back to name when a source code is unavailable.

Geo management routes are platform-admin-only:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/platform/geo/:resource` | Paginated list; supports `page`, `per_page` and the relevant parent ID filter |
| POST | `/api/v1/platform/geo/:resource` | Create a country, governorate, city or district |
| GET | `/api/v1/platform/geo/:resource/:entry` | Get one record |
| PATCH | `/api/v1/platform/geo/:resource/:entry` | Update a record |
| DELETE | `/api/v1/platform/geo/:resource/:entry` | Delete a record and its descendants |

Supported resources: `countries`, `governorates`, `cities`, `districts`. Child records require their parent ID: `country_id`, `governorate_id`, or `city_id`.

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