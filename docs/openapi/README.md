# OpenAPI documentation

The canonical API contract is `docs/openapi.yaml`. It composes the endpoint definitions under `docs/openapi/` using local JSON Pointer references.

## Structure

```text
docs/
├── openapi.yaml                 # OpenAPI entry point, servers, shared security/schemas, endpoint registry
└── openapi/
    ├── platform/                # Platform operator API
    │   ├── auth/
    │   ├── geo/{countries,governorates,cities,districts,resource.yaml}/
    │   ├── monitoring/{logs,view}/
    │   ├── system/
    │   └── tenants/{tenant,subscriptions,payments}/
    ├── tenant/                  # Tenant organization administration
    │   ├── auth/
    │   ├── branches/
    │   ├── clinics/
    │   ├── configuration/
    │   ├── context/
    │   ├── dashboard/
    │   ├── documents/
    │   ├── finance/
    │   ├── geo/{countries,governorates,cities,districts,resource.yaml}/
    │   ├── governance/
    │   ├── integrations/
    │   ├── memberships/
    │   ├── profile/
    │   ├── reports/
    │   └── subscription/
    └── clinic/                  # Clinic operational API
        ├── finance/
        ├── patients/
        └── staff/
```

Keep endpoints grouped by owning domain/entity. Split a domain file into entity-specific files and subfolders when it becomes large; update the matching path references in `docs/openapi.yaml` in the same change. Do not duplicate path definitions in the root file.

## Request examples and validation

- Every operation with a JSON request body must define an `application/json.example` beside its schema.
- Examples must satisfy the runtime Zod validator: required fields, enums, string lengths/formats, ObjectId patterns, numeric bounds/precision, and nested array limits.
- Keep OpenAPI schemas aligned with the source validators in `src/modules/**/validation/`; route definitions in `src/modules/**/routes/` are the source of truth for exposed methods and paths.
- Use synthetic ObjectIds and non-production sample data in examples. Never include credentials, real patient data, or actual integration secrets.
- For partial-update endpoints, show only fields that may be sent in that operation.
- Do not document deferred patient self-service/mobile endpoints as implemented APIs.

## Authentication and request context

- Authenticated endpoints use the bearer scheme declared in the root specification.
- Tenant-scoped operations require `X-Tenant-Id`.
- Clinic context is required where the operation is clinic-owned and uses `X-Clinic-Id`.
- `X-Branch-Id` is optional unless the caller's membership is branch-scoped; when supplied it narrows access to the selected authorized branch.
- Platform endpoints use the separate platform bearer scheme.

## Validation

Bundle the canonical entry point before publishing or importing it into API tooling:

```bash
npx @redocly/cli bundle docs/openapi.yaml --output docs/openapi.apidog.yaml
```

Review the bundle for unresolved references and YAML errors. The bundled Apidog file is generated output; edit the modular source files and root registry, then regenerate the bundle.
