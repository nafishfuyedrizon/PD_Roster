# Pd-Roster-1 — Windows One-Click Ready

## Run

1. Open this folder.
2. Double-click `RUN_WINDOWS.bat`.

The script will:

- verify `pnpm`
- install dependencies
- push the PostgreSQL schema
- import `database_dump.json`
- start the API server
- start the Shift Roster panel
- open the website automatically

Website:

```text
http://localhost:5173/shift-roster/
```

Login:

- If Discord OAuth is configured, use `Login with Discord`
- On this PC, `Enter with Local Admin` is enabled by default

## Database

Default local database:

```text
postgresql://pd_roster_user:pd_roster_pass@localhost:5432/pd_roster
```

This folder is already configured for the PostgreSQL Server running on this machine.

## Useful files

- `RUN_WINDOWS.bat`
- `FIRST_TIME_SETUP.bat`
- `RUN_API_ONLY.bat`
- `RUN_PANEL_ONLY.bat`
- `RESET_DATABASE_FROM_DUMP.bat`
- `.env.local`
