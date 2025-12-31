# Nexus Wars - Deployment Guide

## 🚀 Deploying to Vercel

This guide covers deploying both the frontend and backend to Vercel for production multiplayer support.

### Prerequisites

- Vercel account (sign up at [vercel.com](https://vercel.com))
- GitHub repository with your code
- Node.js 18+ installed locally

### Step 1: Prepare Environment Variables

1. **For the Client:**
   - Create environment variable in Vercel: `VITE_SERVER_URL`
   - Set it to your backend URL (e.g., `https://your-api.vercel.app`)

2. **For the Server:**
   - `NODE_ENV=production`
   - `ALLOWED_ORIGINS` - Comma-separated list of allowed frontend URLs
   - Example: `https://your-game.vercel.app,https://your-game-staging.vercel.app`

### Step 2: Deploy Server (Backend)

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to project root
cd nexus-wars

# Login to Vercel
vercel login

# Deploy server
cd server
vercel --prod
```

**Important Server Configuration:**
- The server is configured for WebSocket support via Socket.io
- Vercel's serverless functions have a 10-second timeout by default
- For production, consider using a dedicated WebSocket hosting service like:
  - Railway.app
  - Render.com
  - Heroku
  - AWS EC2
  - DigitalOcean

### Step 3: Deploy Client (Frontend)

```bash
# Navigate to client directory
cd client

# Build the client
npm run build

# Deploy to Vercel
vercel --prod
```

Alternatively, connect your GitHub repository to Vercel:
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your repository
3. Configure build settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `client`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

### Step 4: Update Environment Variables

After deployment:
1. Copy your server URL from Vercel
2. Update the `VITE_SERVER_URL` in your client environment variables
3. Update `ALLOWED_ORIGINS` in your server environment variables
4. Redeploy both services

### Alternative: Recommended Production Setup

For better WebSocket performance in production:

#### Option 1: Railway.app (Recommended)
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Deploy server
cd server
railway up
```

Railway provides:
- Always-on WebSocket connections
- No cold starts
- Better for real-time multiplayer
- Free tier available

#### Option 2: Render.com
1. Create a new Web Service
2. Connect your GitHub repository
3. Set build command: `cd server && npm install && npm run build`
4. Set start command: `cd server && npm start`
5. Add environment variables

### Configuration Files

The project includes:
- `vercel.json` - Vercel deployment configuration
- `.env.example` - Example environment variables
- `server/.env.example` - Server environment variables
- `client/.env.production` - Production client configuration

### Testing Production Build Locally

```bash
# Build server
cd server
npm run build

# Start production server
npm start

# In another terminal, build and preview client
cd client
npm run build
npm run preview
```

### Monitoring and Logs

**Vercel:**
```bash
# View deployment logs
vercel logs

# View function logs
vercel logs --follow
```

**Railway:**
```bash
railway logs
```

### Troubleshooting

#### WebSocket Connection Issues
- Ensure `ALLOWED_ORIGINS` includes your frontend URL
- Check that Socket.io is properly configured for WebSocket transport
- Verify firewall/security group settings

#### CORS Errors
- Update `ALLOWED_ORIGINS` environment variable
- Ensure both server and Socket.io CORS settings match
- Check that credentials are properly configured

#### Slow Cold Starts
- Consider using Railway or Render for the backend
- These services keep your app running continuously
- Vercel serverless functions have cold start delays

### Performance Optimization

1. **Enable Compression:**
   - Already configured in the server
   - Reduces bandwidth usage

2. **CDN Configuration:**
   - Vercel automatically provides CDN for static assets
   - Client build is optimized with Vite

3. **Database Considerations:**
   - Current implementation uses in-memory storage
   - For production, consider adding Redis for:
     - Session persistence
     - Cross-instance communication
     - Player data caching

4. **Scaling:**
   - Horizontal scaling requires session affinity (sticky sessions)
   - Consider using Redis adapter for Socket.io
   - Use managed WebSocket services for better scalability

### Environment Variables Reference

#### Server
```bash
NODE_ENV=production
PORT=3001
ALLOWED_ORIGINS=https://your-frontend.vercel.app
```

#### Client
```bash
VITE_SERVER_URL=https://your-backend.vercel.app
```

### Post-Deployment Checklist

- [ ] Server is accessible via HTTPS
- [ ] WebSocket connections work
- [ ] CORS is properly configured
- [ ] Environment variables are set correctly
- [ ] Game rooms can be created
- [ ] Quick match functionality works
- [ ] Multiple players can join simultaneously
- [ ] Game state synchronizes properly
- [ ] Reconnection works after disconnect

### Support

For issues:
1. Check Vercel deployment logs
2. Verify all environment variables
3. Test WebSocket connection in browser console
4. Check browser network tab for failed requests

### Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Socket.io Documentation](https://socket.io/docs/v4/)
- [Railway Documentation](https://docs.railway.app/)
- [Render Documentation](https://render.com/docs)
