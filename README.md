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
