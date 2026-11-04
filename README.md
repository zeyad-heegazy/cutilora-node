# Cutilora Node

Node.js implementation of the Cutilora clinic platform API.

## Stack
- Node.js 22+ and TypeScript
- Express 5
- MongoDB 7+ and Mongoose
- Zod for request and environment validation
- Vitest + Supertest for tests

## Architecture

Request flow: **Route → Middleware → Controller → Service → Repository → Model/Database**.

Platform administration is an independent application module. Shared domain capabilities remain in their domain modules and are consumed by platform features through service/repository boundaries.

```text
src/
  app/
  config/
  database/
  modules/
    auth/                 # Shared identity, user authentication and token primitives
    platform/             # Platform-admin API surface and platform-only use cases
      auth/               # Platform login, identity endpoint and platform guard
      geo/                # Geo administration API
      monitoring/         # Logs API and monitoring browser view
      tenants/            # Tenant provisioning and administration API
    tenancy/              # Tenant-scoped clinic/branch operations and tenant models
    geo/                  # Shared geo models, data, seeding, repository and validation
  shared/
    logger/
    middleware/
    observability/        # Shared log persistence used by middleware and platform UI
  server.ts
```

### Module boundaries
- `platform` owns platform-only routes, controllers, services and middleware.
- `auth` owns shared user identity, password/token primitives, regular user login and regular authentication.
- `geo` owns shared geographic data and clinic-location validation. Platform CRUD is implemented in `platform/geo`.
- `tenancy` owns tenant-scoped operations. Platform tenant provisioning is implemented in `platform/tenants`.
- `shared/observability` stores application logs so shared middleware does not import a platform module.
- Do not put database queries in routes, controllers or middleware. Do not bypass repositories from services. Tenant-owned repository queries must use trusted tenant/clinic/branch context, never identifiers from request bodies or query strings.

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
The geographic hierarchy is **Country → Governorate → City → District**. Each record stores an English name, optional Arabic name, optional source code, parent reference and timestamps. Starter data includes Egypt and Saudi Arabia from the existing JSON datasets.

Run `npm run seed:geo` after configuring `.env`. The seeder upserts records by source code within their parent, falling back to name when a source code is unavailable.

Geo administration is platform-admin-only and served from the platform module:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/platform/geo/:resource` | Paginated list and parent filtering |
| POST | `/api/v1/platform/geo/:resource` | Create a geo record |
| GET | `/api/v1/platform/geo/:resource/:entry` | Get one record |
| PATCH | `/api/v1/platform/geo/:resource/:entry` | Update a record |
| DELETE | `/api/v1/platform/geo/:resource/:entry` | Delete a record and descendants |

Supported resources: `countries`, `governorates`, `cities`, `districts`. Child records require their parent ID: `country_id`, `governorate_id`, or `city_id`. Shared clinic location validation remains in `modules/geo`.

## Authentication

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/v1/auth/login` | Regular user login |
| GET | `/api/v1/auth/me` | Regular authenticated user |
| POST | `/api/v1/auth/platform/login` | Platform administrator login |
| GET | `/api/v1/auth/platform/me` | Platform administrator identity |
| POST | `/api/v1/auth/platform/dev/bootstrap-admin` | Development-only initial platform-admin bootstrap |

Platform authentication routes, controllers and services live under `modules/platform/auth`. Shared token signing and user identity persistence remain in `modules/auth`.

## Platform administration

All endpoints below require a platform access token, except the public monitoring HTML shell (which requires login before displaying data).

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/platform/tenants` | List tenants |
| POST | `/api/v1/platform/tenants` | Create tenant, owner membership and optional initial clinic |
| PATCH | `/api/v1/platform/tenants/:tenantId/status` | Activate/suspend tenant |
| GET | `/api/v1/platform/monitoring/view` | Browser-based monitoring dashboard |
| GET | `/api/v1/platform/monitoring/logs` | Search and paginate logs |
| GET | `/api/v1/platform/monitoring/logs/stats` | Log statistics |
| GET | `/api/v1/platform/monitoring/logs/timeline` | Activity timeline data |
| GET | `/api/v1/platform/monitoring/logs/:id` | Log details |

## Tenant context

Tenant-scoped routes require a bearer token and `X-Tenant-Id`. `X-Clinic-Id` and `X-Branch-Id` select narrower contexts.

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/v1/tenant/context` | Active tenant membership |
| GET/POST | `/api/v1/tenant/clinics` | Tenant owner/admin |
| GET/POST | `/api/v1/tenant/branches` | Clinic context; create requires tenant/clinic manager role |

## Security status

Access tokens are currently stateless. Refresh-token rotation/revocation, membership invitations, complete audit-event coverage, permission-based RBAC and automated tenant-isolation tests remain outstanding. Do not consider this API production-ready until those controls and automated tests are implemented.
