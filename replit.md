# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Application: Police Department Shift Roster

### Purpose
Full-stack roster management app for tracking officer duty hours, ranks, departments, FTO assignments, qualifications, and EMS duty hours.

### Artifacts
- **API Server** (`artifacts/api-server`) — Express 5 REST API on port 8080
- **Shift Roster** (`artifacts/shift-roster`) — React + Vite frontend at `/shift-roster`

### Officer Schema (`lib/db/src/schema/officers.ts`)
Fields: `id`, `callSign` (NOT NULL), `citizenId`, `name`, `phoneNumber`, `department`, `rank`, `division`, `status`, `timezone`, `dateOfJoining`, `lastPromotion`, qualifications (`pilot`, `mdt`, `seu`, `smg`, `rifle`, `shotgun`, `rifleTierII`, `ftp` — all boolean), `strikesMajor`, `strikesMinor`, `discordUsername`, `discordUid`, `discordId`, `rockstarLicenseId`, `appointedFto`, `weekPeriod`, `dutyHours`, `completionStatus`.

### EMS Duty Log Schema (`lib/db/src/schema/ems_duty_logs.ts`)
Fields: `id`, `officerName`, `callSign`, `shift`, `hoursLogged`, `weekPeriod`, `loggedAt`.

### Seeded Data
- 36 officers with full details (ranks, qualifications, Discord, Rockstar IDs, etc.)
- 65 EMS duty logs × 5 weeks

### Frontend Pages
- `/` — Full Roster (rank-ordered table with all 22 columns: call sign, CID, name, phone, dept, rank, division, status, TZ, joined, promo, qualifications grid, strikes, Discord)
- `/dept/:department` — Department-filtered roster
- `/stats` — Statistics dashboard
- `/fto-pairs` — FTO assignments
- `/ems-duty-hour` — EMS Duty Hour tracking with weekly breakdown and top performers
