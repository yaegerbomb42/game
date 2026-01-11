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

### Quick Deploy Guide

Since this game uses WebSockets for real-time multiplayer, you'll need to deploy the frontend and backend separately:

- **Frontend (Client)**: Deploy to Vercel, Netlify, or any static hosting
- **Backend (Server)**: Deploy to Railway, Render, Fly.io, or any WebSocket-compatible hosting

### Frontend Deployment (Vercel)

1. Push your code to GitHub
2. Import your repository to [Vercel](https://vercel.com)
3. Set the root directory to `client`
4. Add environment variable: `VITE_SERVER_URL=https://your-server-url.com`
5. Deploy!

### Backend Deployment Options

#### Railway (Recommended)
```bash
cd server
npm install -g @railway/cli
railway login
railway init
railway up
```
Configuration file included: `server/railway.json`

#### Render
1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repo
3. Set root directory to `server`
4. Render will auto-detect the `render.yaml` configuration

#### Fly.io
```bash
cd server
flyctl launch
flyctl deploy
```
Configuration file included: `server/fly.toml`

### Environment Variables

**Client (.env)**
```
VITE_SERVER_URL=https://your-server-domain.com
```

**Server (.env)**
```
PORT=3001
NODE_ENV=production
ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app
```

### Build for Production

```bash
# Build both client and server
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build
```

### Hosting Architecture

```
┌─────────────────┐     WebSocket     ┌─────────────────┐
│  Vercel/Netlify │ ←───────────────→ │ Railway/Render  │
│   (Frontend)    │                   │    (Backend)    │
│  Static Files   │      HTTP/WS      │  Game Server    │
└─────────────────┘                   └─────────────────┘
```

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
