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


## Authentication and tenant context

- `POST /api/v1/auth/login` accepts `{ "email", "password" }` and returns a bearer access token plus the user's active clinic memberships.
- `GET /api/v1/auth/me` returns the authenticated identity and clinic memberships.
- `POST /api/v1/auth/dev/bootstrap-admin` creates the first platform administrator only when `NODE_ENV` is not `production`. In production, provision the first platform admin through a controlled one-off script/console operation; do not expose public admin registration.
- Platform clinic management is under `/api/v1/platform/clinics` and requires a platform-admin token.
- Clinic-scoped routes are under `/api/v1/clinic`. Send the selected membership's clinic ID in `X-Clinic-Id`; the server verifies an active membership and active clinic before setting `req.tenantId`.
- Clinic roles: `owner`, `admin`, `manager`, `staff`. Use `requireClinicRoles(...)` on every clinic-management route that needs elevated permissions.
- Every clinic-owned collection must include `{ clinicId: req.tenantId }` in its database filter. Never accept tenant identity from body/query input. Add `clinicId` to each clinic-owned schema and compound indexes beginning with `clinicId`.

### Initial endpoints

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/v1/auth/login` | Public |
| GET | `/api/v1/auth/me` | Authenticated |
| GET | `/api/v1/platform/clinics` | Platform admin |
| POST | `/api/v1/platform/clinics` | Platform admin |
| PATCH | `/api/v1/platform/clinics/:clinicId/status` | Platform admin |
| GET | `/api/v1/clinic/context` | Active clinic member |
| GET | `/api/v1/clinic/members` | Clinic owner/admin/manager |

Set `JWT_SECRET` to a cryptographically random value of at least 32 characters. Access tokens are currently stateless; implement refresh-token rotation and revocation before production rollout.
