# InverseIQ Website

InverseIQ is a trading-signal product developed by ACE&CROWN. This repository is a clean source export; runtime credentials and the original Git history are not included.

## Project structure

- `client/` — React/Vite user interface, pages, components, and frontend utilities.
- `server/` — Express/tRPC routes, integrations, signal engines, and backend services.
- `shared/` — types and constants shared between frontend and backend.
- `drizzle/` — database schema and migration-related files.
- `docs/` — architecture, research, and operational documentation.
- `scripts/` — validation and developer utilities.

## Local development

Install dependencies with `pnpm install`, configure runtime variables using `.env.example` as a names-only reference, and use the package scripts in `package.json`. Keep real API and exchange credentials out of source control; use demo/test credentials for local work.
