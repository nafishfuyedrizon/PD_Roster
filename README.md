# PD Roster

A monorepo project for managing shift rosters with API server and database integration.

## Tech Stack
- **Frontend**: TypeScript, Cloudflare Pages
- **Backend**: Node.js, Express
- **Database**: PostgreSQL/MySQL
- **Package Manager**: pnpm

## Project Structure
```
├── artifacts/
│   └── api-server/          # Express API server
├── libs/                     # Shared libraries
├── scripts/                  # Utility scripts
├── package.json             # Root workspace config
└── pnpm-workspace.yaml      # pnpm monorepo config
```

## Prerequisites
- Node.js 18+ 
- pnpm (install via: `npm install -g pnpm`)
- PostgreSQL or MySQL running locally
- A Cloudflare account (for deployment)

## Local Setup

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Set Up Environment Variables
Create a `.env` file in the root directory:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/pd_roster
# or for MySQL:
# DATABASE_URL=mysql://user:password@localhost:3306/pd_roster

# API Server
PORT=3000
NODE_ENV=development
BASE_PATH=/shift-roster/

# Authentication (if using Clerk)
CLERK_API_KEY=your_clerk_api_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

### 3. Run Development Server
```bash
pnpm run dev
# or on Windows:
pnpm run win:start
```

The API server will start on `http://localhost:3000`

## Build

```bash
pnpm run build
```

This builds the API server and prepares artifacts for deployment.

## Deployment to Cloudflare Pages

### 1. Connect Repository
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to Pages → Create a project
3. Connect your GitHub repository `nafishfuyedrizon/PD_Roster`

### 2. Configure Build Settings
- **Framework**: None (custom)
- **Build command**: `pnpm run build`
- **Build output directory**: `artifacts/api-server/dist`
- **Environment variables**: Add your `.env` variables

### 3. Environment Setup
Set these environment variables in Cloudflare Pages:
- `DATABASE_URL`
- `CLERK_API_KEY`
- `CLERK_SECRET_KEY`
- `NODE_ENV=production`

### 4. Deploy
Push to main branch to trigger automatic deployment:
```bash
git push origin main
```

## Available Scripts

```bash
# Development
pnpm run dev              # Start dev server with hot reload
pnpm run start            # Start production server

# Building
pnpm run build            # Build for production
pnpm run typecheck        # TypeScript type checking

# Windows-specific
pnpm run win:setup        # First-time setup on Windows
pnpm run win:start        # Start all services on Windows
pnpm run win:api          # Start API server only
pnpm run win:panel        # Start panel only
pnpm run win:reset-db     # Reset database from dump
```

## Troubleshooting

### Port Already in Use
If port 3000 is in use, change the `PORT` in `.env`:
```env
PORT=3001
```

### Database Connection Error
Ensure your database service is running:
```bash
# PostgreSQL
sudo systemctl start postgresql

# MySQL
sudo systemctl start mysql
```

### pnpm Issues
Clear cache and reinstall:
```bash
pnpm store prune
pnpm install
```

## Additional Resources
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [pnpm Monorepo Guide](https://pnpm.io/workspaces)
- [Express.js Documentation](https://expressjs.com/)

## License
MIT
