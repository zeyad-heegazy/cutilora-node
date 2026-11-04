# Backend architecture

## Boundary rules

`modules/platform` is the only owner of platform-administration HTTP APIs. Platform-specific routes, controllers, use-case services and authorization middleware belong there.

`modules/auth` owns shared identity persistence, regular-user authentication and token primitives. Platform login is an application use case in `modules/platform/auth`; it reuses shared identity and cryptographic primitives rather than duplicating them.

`modules/geo` owns geographic entities, datasets, seeding, repository access and validation needed by clinic workflows. Platform CRUD controllers and use cases live in `modules/platform/geo`.

`modules/tenancy` owns tenant-context resolution and tenant-scoped clinic/branch operations. Platform tenant provisioning and platform-wide tenant administration live in `modules/platform/tenants`.

Monitoring HTTP endpoints and the browser dashboard live in `modules/platform/monitoring`. Log persistence lives in `shared/observability` because request/error middleware must write logs without importing a platform module.

## Request flow

Route → Middleware → Controller → Service → Repository → Model/Database.

Shared middleware must not import from feature modules. Cross-module use should target a stable domain service, repository contract, or shared infrastructure component.

## API surface

- Regular identity: `/api/v1/auth/*`
- Platform identity: `/api/v1/auth/platform/*`
- Platform administration: `/api/v1/platform/*`
- Tenant-scoped operations: `/api/v1/tenant/*`

The external URL structure is intentionally retained during this internal module reorganization.
