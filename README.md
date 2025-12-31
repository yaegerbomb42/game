# 🎮 Nexus Wars - 2D Multiplayer Strategy Game

A fast-paced, real-time multiplayer strategy game where 2-10 players compete to control energy nexuses on a dynamic battlefield. Built with React, Phaser.js, and Socket.io.

## 🚀 Features

- **Real-time Multiplayer**: Up to 10 players per game room
- **Strategic Gameplay**: Control nexuses, manage resources, and expand territory
- **Dopamine-Rich Experience**: Instant feedback, particle effects, and satisfying audio
- **Cross-Platform**: Works on desktop and mobile browsers
- **Fast Rounds**: 60-90 second games for quick, engaging sessions

## 🎯 How to Play

### Objective
Control energy nexuses to gain influence and win the game!

### Controls
- **WASD / Arrow Keys**: Move your player
- **Mouse Click**: Move to position or attack other players
- **E**: Harvest energy from nearby nexuses
- **Space**: Deploy influence beacon (costs energy)
- **Q**: Boost nexus charge rate (if you control it)

### Game Phases
1. **Spawn Phase** (10s): Scout the battlefield and plan your strategy
2. **Expansion Phase** (35s): Race to claim and fortify nexuses
3. **Conflict Phase** (30s): Battle other players for control
4. **Pulse Phase** (15s): Final energy pulse determines the winner

### Strategy Tips
- Nexuses generate energy every 5 seconds for their controller
- Higher charge levels = bigger energy pulses
- Balance offense and defense - attacking steals energy but costs positioning
- Influence beacons help secure territory but cost energy

## 🛠 Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nexus-wars
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Start development servers**
   ```bash
   npm run dev
   ```

This will start:
- Client (React + Vite) on http://localhost:3000
- Server (Express + Socket.io) on http://localhost:3001

### Project Structure

```
nexus-wars/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # React pages (Lobby, Game)
│   │   ├── game/          # Phaser game logic
│   │   └── ...
│   └── package.json
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── index.ts       # Main server file
│   │   ├── GameRoom.ts    # Game room logic
│   │   └── types.ts       # Shared types
│   └── package.json
├── docs/                   # Documentation
│   └── game_design.md     # Game design document
└── package.json           # Root package.json
```

## 🚀 Deployment

### Quick Deploy Options

#### Option 1: Vercel (Frontend) + Railway (Backend) [Recommended]
Best for production multiplayer with WebSocket support.

**Backend (Railway):**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
cd server && railway up
```

**Frontend (Vercel):**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd client && vercel --prod
```

Set environment variable `VITE_SERVER_URL` to your Railway backend URL.

#### Option 2: All-in-One Vercel
Suitable for testing, but WebSocket performance may be limited.

```bash
# Deploy from root
vercel --prod
```

#### Option 3: Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up --build
```

### Environment Variables

**Client (.env)**
```bash
VITE_SERVER_URL=https://your-server-domain.com
```

**Server (.env)**
```bash
PORT=3001
NODE_ENV=production
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

### Detailed Deployment Guide

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment instructions including:
- Step-by-step Vercel setup
- Railway.app configuration
- WebSocket optimization
- Production monitoring
- Troubleshooting guide

### Recommended Hosting

- **Frontend**: Vercel ⭐, Netlify, Cloudflare Pages
- **Backend**: Railway ⭐, Render, Fly.io, Heroku
- **Why Railway for Backend?**: Better WebSocket support, no cold starts, real-time multiplayer ready

## 🎮 Game Mechanics

### Energy System
- Players start with 0 energy
- Harvest energy from nexuses (10 energy per harvest)
- Energy is consumed for actions:
  - Deploy beacon: 20 energy
  - Boost nexus: 15 energy
  - Defend: 10 energy

### Influence System
- Gain influence by:
  - Capturing nexuses: +5 influence
  - Harvesting from controlled nexuses: +2 influence
  - Deploying beacons: +3 influence
  - Energy pulses: +10 influence per charge level

### Combat System
- Click on other players to attack
- Steals up to 10 energy (attacker gets 70%)
- Must be within 60 pixels to attack
- No player elimination - strategic energy theft

## 🔧 Technical Details

### Performance Targets
- 60 FPS on modern browsers
- <100ms latency for 10 players
- <5MB total download size

### Browser Support
- Chrome, Firefox, Safari, Edge (last 2 versions)
- Mobile responsive design
- Touch controls for tablets

### Architecture
- **Frontend**: React 18 + TypeScript + Vite + Phaser 3.70
- **Backend**: Node.js + Express + Socket.io + TypeScript
- **Real-time**: WebSocket connections with Socket.io
- **State Management**: Server-authoritative game state
- **Anti-cheat**: Server-side validation and rate limiting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎉 Acknowledgments

- Built with [Phaser.js](https://phaser.io/) for 2D game rendering
- Real-time multiplayer powered by [Socket.io](https://socket.io/)
- UI built with [React](https://reactjs.org/) and [Vite](https://vitejs.dev/)

---

**Ready to dominate the nexuses? Start playing now!** 🚀
