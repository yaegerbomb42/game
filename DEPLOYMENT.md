# Deployment Guide for Nexus Wars

## Overview

Nexus Wars uses Socket.io for real-time multiplayer, which requires persistent WebSocket connections. This guide covers deployment options.

## Architecture

- **Client**: React/Vite app (can deploy to Vercel, Netlify, etc.)
- **Server**: Node.js/Express/Socket.io (requires persistent connection - cannot use Vercel serverless)

## Deployment Options

### Option 1: Separate Hosting (Recommended)

**Client on Vercel, Server on Railway/Render/Fly.io**

1. **Deploy Client to Vercel:**
   ```bash
   cd client
   npm run build
   # Deploy dist/ folder to Vercel
   ```
   Set environment variable: `VITE_SERVER_URL=https://your-server-domain.com`

2. **Deploy Server to Railway/Render/Fly.io:**
   ```bash
   cd server
   npm run build
   # Deploy dist/ folder
   ```
   Set environment variables:
   - `PORT=3001` (or use platform default)
   - `NODE_ENV=production`
   - `VITE_CLIENT_URL=https://your-client-domain.vercel.app`

### Option 2: Docker Deployment

Use the provided Dockerfiles:

```bash
# Build and run with Docker Compose
docker-compose up --build
```

### Option 3: Full Stack on Railway/Render

Deploy both client and server together on a platform that supports WebSockets.

## Environment Variables

### Client (.env)
```
VITE_SERVER_URL=https://your-server-domain.com
```

### Server (.env)
```
PORT=3001
NODE_ENV=production
VITE_CLIENT_URL=https://your-client-domain.vercel.app
```

## Quick Join & Room Creation

The server now includes improved quick match logic:
- Automatically finds rooms with 2-4 players for faster matchmaking
- Creates new rooms when no suitable matches exist
- Prioritizes waiting rooms over active games

## Features Improved

✅ Enhanced CORS configuration for production
✅ Better error handling and reconnection logic
✅ Improved quick join algorithm
✅ Enhanced visuals and effects
✅ Performance optimizations
✅ Better UI/UX

## Testing Locally

```bash
npm run install:all
npm run dev
```

Client: http://localhost:3000
Server: http://localhost:3001

## Troubleshooting

### Socket.io Connection Issues
- Ensure CORS is properly configured
- Check that WebSocket connections are allowed
- Verify environment variables are set correctly

### Vercel Serverless Limitations
Socket.io requires persistent connections and cannot run on Vercel serverless functions. Deploy the server to a platform that supports WebSockets (Railway, Render, Fly.io, etc.).
