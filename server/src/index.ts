import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameRoom } from './GameRoom';
import { Player } from './types';

const app = express();
const server = createServer(app);

// Production CORS configuration - allow all origins for multiplayer
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173'];

// In production, allow any origin (for Vercel deployments)
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? true : allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
};

const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});

app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests
app.options('*', cors(corsOptions));

// Store active game rooms
const gameRooms = new Map<string, GameRoom>();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: gameRooms.size,
    totalPlayers: Array.from(gameRooms.values()).reduce((sum, room) => sum + room.getPlayerCount(), 0),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Get available rooms for quick match
app.get('/rooms', (req, res) => {
  const availableRooms = Array.from(gameRooms.entries())
    .filter(([_, room]) => !room.isFull())
    .map(([id, room]) => ({
      roomId: id,
      playerCount: room.getPlayerCount(),
      maxPlayers: 10,
      gamePhase: room.getGamePhase(),
      canJoin: !room.isFull() && room.getGamePhase() !== 'ended',
    }))
    .sort((a, b) => {
      // Prioritize waiting rooms, then rooms with more players
      if (a.gamePhase === 'waiting' && b.gamePhase !== 'waiting') return -1;
      if (b.gamePhase === 'waiting' && a.gamePhase !== 'waiting') return 1;
      return b.playerCount - a.playerCount;
    });
  res.json({ rooms: availableRooms, serverTime: Date.now() });
});

// Quick join endpoint - finds the best room or creates a new one
app.get('/quickjoin', (req, res) => {
  // Find best room: prefer waiting rooms with players, then in-progress rooms with space
  let bestRoom: { roomId: string; playerCount: number } | null = null;
  
  for (const [roomId, room] of gameRooms) {
    if (room.isFull()) continue;
    
    const phase = room.getGamePhase();
    if (phase === 'ended') continue;
    
    const playerCount = room.getPlayerCount();
    
    // Prefer waiting rooms with at least 1 player
    if (phase === 'waiting' && playerCount > 0) {
      if (!bestRoom || playerCount > bestRoom.playerCount) {
        bestRoom = { roomId, playerCount };
      }
    } else if (!bestRoom && playerCount < 6) {
      // In-progress room as fallback
      bestRoom = { roomId, playerCount };
    }
  }
  
  if (bestRoom) {
    res.json({ roomId: bestRoom.roomId, isNew: false });
  } else {
    // Create new room ID
    const newRoomId = generateRoomId();
    res.json({ roomId: newRoomId, isNew: true });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Join or create a game room
  socket.on('join-room', (data: { roomId?: string; playerName: string }) => {
    const { roomId, playerName } = data;
    
    let room: GameRoom;
    let targetRoomId: string;

    if (roomId && gameRooms.has(roomId)) {
      // Join existing room
      room = gameRooms.get(roomId)!;
      targetRoomId = roomId;
      if (room.isFull()) {
        socket.emit('room-full');
        return;
      }
    } else {
      // Create new room
      targetRoomId = generateRoomId();
      room = new GameRoom(targetRoomId, io);
      gameRooms.set(targetRoomId, room);
      
      // Clean up room when it's empty
      const roomIdToDelete = targetRoomId;
      room.on('empty', () => {
        gameRooms.delete(roomIdToDelete);
        console.log(`Room ${roomIdToDelete} deleted`);
      });
    }

    const abilities: Player['abilityType'][] = ['dash', 'heal', 'shield', 'scan'];
    const player: Player = {
      id: socket.id,
      name: playerName,
      x: Math.random() * 800,
      y: Math.random() * 600,
      targetX: 0,
      targetY: 0,
      velocityX: 0,
      velocityY: 0,
      energy: 0,
      influence: 0,
      color: getPlayerColor(room.getPlayerCount()),
      isAlive: true,
      lastAction: Date.now(),
      // Combat properties
      health: 100,
      maxHealth: 100,
      attackPower: 25,
      attackRange: 80,
      lastAttack: 0,
      attackCooldown: 800, // 0.8 second cooldown for faster combat
      // Combo system
      comboCount: 0,
      lastComboTime: 0,
      killStreak: 0,
      // Stats
      kills: 0,
      deaths: 0,
      score: 0,
      damageDealt: 0,
      nexusesCaptured: 0,
      // Power-ups
      activePowerUps: [],
      // Movement
      speed: 180,
      lastMovement: 0,
      // Respawn invincibility
      invincibleUntil: 0,
      // Special ability - assign randomly for variety
      abilityType: abilities[room.getPlayerCount() % abilities.length],
      abilityCooldown: 15000, // 15 second cooldown
      lastAbilityUse: 0,
    };

    room.addPlayer(socket, player);
    socket.join(targetRoomId);
    
    socket.emit('joined-room', {
      roomId: targetRoomId,
      player,
      gameState: room.getSerializableGameState(),
    });

    console.log(`Player ${playerName} joined room ${targetRoomId}`);
  });

  // Handle get game state request
  socket.on('get-game-state', () => {
    const room = findPlayerRoom(socket.id);
    if (room) {
      const player = room.getPlayer(socket.id);
      if (player) {
        socket.emit('joined-room', {
          roomId: room.getRoomId(),
          player,
          gameState: room.getSerializableGameState(),
        });
      }
    }
  });

  // Handle player actions
  socket.on('player-action', (action) => {
    const room = findPlayerRoom(socket.id);
    if (room) {
      room.handlePlayerAction(socket.id, action);
    }
  });

  // Quick match - find available room or create new one
  socket.on('quick-match', (data: { playerName: string }) => {
    // Find best room: prefer waiting rooms with players
    let bestRoom: GameRoom | null = null;
    let bestRoomIdFound: string | null = null;
    let bestScore = -1;
    
    for (const [rid, room] of gameRooms) {
      if (room.isFull()) continue;
      
      const phase = room.getGamePhase();
      if (phase === 'ended') continue;
      
      const playerCount = room.getPlayerCount();
      
      // Score: waiting rooms with players get priority
      let score = playerCount;
      if (phase === 'waiting') score += 100;
      if (playerCount >= 1 && playerCount <= 5) score += 50;
      
      if (score > bestScore) {
        bestScore = score;
        bestRoom = room;
        bestRoomIdFound = rid;
      }
    }
    
    if (bestRoom && bestRoomIdFound) {
      socket.emit('quick-match-found', { roomId: bestRoomIdFound, playerCount: bestRoom.getPlayerCount() });
    } else {
      // Create new room
      const newRoomId = generateRoomId();
      socket.emit('quick-match-found', { roomId: newRoomId, isNew: true });
    }
  });

  // Restart game request
  socket.on('restart-game', () => {
    const room = findPlayerRoom(socket.id);
    if (room) {
      room.restartGame();
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const room = findPlayerRoom(socket.id);
    if (room) {
      room.removePlayer(socket.id);
    }
  });
});

// Helper functions
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getPlayerColor(playerIndex: number): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  return colors[playerIndex % colors.length];
}

function findPlayerRoom(playerId: string): GameRoom | undefined {
  for (const room of gameRooms.values()) {
    if (room.hasPlayer(playerId)) {
      return room;
    }
  }
  return undefined;
}

const PORT = process.env.PORT || 3001;

// Cleanup inactive rooms periodically
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of gameRooms) {
    // Remove rooms that have been empty for more than 5 minutes
    if (room.getPlayerCount() === 0) {
      gameRooms.delete(roomId);
      console.log(`🧹 Cleaned up empty room: ${roomId}`);
    }
  }
}, 60000); // Check every minute

server.listen(PORT, () => {
  console.log(`🚀 Nexus Wars server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS enabled for: ${process.env.NODE_ENV === 'production' ? 'all origins' : allowedOrigins.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
