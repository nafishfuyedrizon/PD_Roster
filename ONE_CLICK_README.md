# Pd-Roster-1 — Windows One-Click Ready

## Run

1. Open this folder.
2. Put your PD MySQL database URL and Discord values in `.env.local`.
3. Double-click `RUN_DISCORD_WINDOWS.bat`.

The script will:

- verify `pnpm`
- install dependencies
- skip PostgreSQL-only setup when using MySQL/MariaDB
- start the API server
- start the Discord bot inside the API window
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

Recommended local database:

```text
mysql://USER:PASSWORD@HOST:3306/DATABASE
```

If you still use PostgreSQL locally, `FIRST_TIME_SETUP.bat` will continue to push schema and import `database_dump.json`.

Required Discord values in `.env.local`:

```text
DISCORD_BOT_TOKEN=
DISCORD_TIMESTAMP_CHANNEL_ID=
DISCORD_FIR_CHANNEL_ID=
```

## Useful files

- `RUN_DISCORD_WINDOWS.bat`
- `RUN_WINDOWS.bat`
- `FIRST_TIME_SETUP.bat`
- `RUN_API_ONLY.bat`
- `RUN_PANEL_ONLY.bat`
- `RESET_DATABASE_FROM_DUMP.bat`
- `.env.local`
