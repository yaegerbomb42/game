import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { GameRoom } from './GameRoom';
import { Player } from './types';

const app = express();
const server = createServer(app);
app.set('trust proxy', 1);

/**
 * CORS / origin handling
 *
 * - In production, a Vercel-hosted client will have a different origin per deployment.
 * - This game does not use cookies/auth, so allowing all origins is acceptable by default.
 * - If you want to restrict origins, set CLIENT_ORIGINS as a comma-separated list.
 */
const clientOrigins = (process.env.CLIENT_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowAllOrigins = clientOrigins.length === 0;
const io = new Server(server, {
  cors: {
    origin: allowAllOrigins ? true : clientOrigins,
    methods: ['GET', 'POST'],
  },
});

app.use(
  cors({
    origin: allowAllOrigins ? true : clientOrigins,
  })
);
app.use(express.json());

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

// Create a room (useful for invite links / provisioning)
app.post('/rooms', (req, res) => {
  const requestedRoomId = typeof req.body?.roomId === 'string' ? req.body.roomId : undefined;
  const normalized = requestedRoomId ? normalizeRoomId(requestedRoomId) : undefined;
  const roomId = normalized && isValidRoomId(normalized) && !gameRooms.has(normalized)
    ? normalized
    : generateRoomId();

  if (gameRooms.has(roomId)) {
    // Extremely unlikely unless generateRoomId collided; retry once.
    const retry = generateRoomId();
    if (gameRooms.has(retry)) {
      res.status(503).json({ error: 'Failed to allocate roomId. Please retry.' });
      return;
    }
    res.json({ roomId: retry });
    return;
  }

  const room = new GameRoom(roomId, io);
  gameRooms.set(roomId, room);
  room.on('empty', () => {
    gameRooms.delete(roomId);
    console.log(`Room ${roomId} deleted`);
  });

  res.json({ roomId });
});

// Quickjoin: find a room with players waiting, or create a new one
app.post('/quickjoin', (req, res) => {
  // Prefer smaller rooms that are already active, to start games quickly.
  let targetRoomId: string | null = null;
  for (const [rid, room] of gameRooms) {
    if (!room.isFull() && room.getPlayerCount() > 0 && room.getPlayerCount() < 6) {
      targetRoomId = rid;
      break;
    }
  }

  if (targetRoomId) {
    res.json({ roomId: targetRoomId, created: false });
    return;
  }

  const roomId = generateRoomId();
  const room = new GameRoom(roomId, io);
  gameRooms.set(roomId, room);
  room.on('empty', () => {
    gameRooms.delete(roomId);
    console.log(`Room ${roomId} deleted`);
  });

  res.json({ roomId, created: true });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Join or create a game room
  socket.on('join-room', (data: { roomId?: string; playerName: string; abilityType?: string; userId?: string }) => {
    const { roomId: rawRoomId, playerName, abilityType, userId } = data;

    let room: GameRoom;
    let targetRoomId: string;

    const requestedRoomId = rawRoomId ? normalizeRoomId(rawRoomId) : undefined;

    if (requestedRoomId && gameRooms.has(requestedRoomId)) {
      // Join existing room
      room = gameRooms.get(requestedRoomId)!;
      targetRoomId = requestedRoomId;
      if (room.isFull()) {
        socket.emit('room-full');
        return;
      }
    } else if (requestedRoomId && isValidRoomId(requestedRoomId) && !gameRooms.has(requestedRoomId)) {
      // Create requested room (invite-code / quickjoin flow)
      targetRoomId = requestedRoomId;
      room = new GameRoom(targetRoomId, io);
      gameRooms.set(targetRoomId, room);

      room.on('empty', () => {
        gameRooms.delete(targetRoomId);
        console.log(`Room ${targetRoomId} deleted`);
      });
    } else {
      // Create new room with server-generated id
      targetRoomId = generateRoomId();
      room = new GameRoom(targetRoomId, io);
      gameRooms.set(targetRoomId, room);

      // Clean up room when it's empty
      room.on('empty', () => {
        gameRooms.delete(targetRoomId);
        console.log(`Room ${targetRoomId} deleted`);
      });
    }

    const validAbilities = ['dash', 'heal', 'shield', 'scan'];
    // Default to random if invalid or not provided
    const selectedAbility = (abilityType && validAbilities.includes(abilityType))
      ? abilityType
      : validAbilities[room.getPlayerCount() % validAbilities.length];

    const player: Player = {
      id: socket.id,
      userId: userId || socket.id, // Use provided userId or fallback to socket.id
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
      isConnected: true,
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
      // Special ability
      abilityType: selectedAbility as any,
      abilityCooldown: 15000, // 15 second cooldown
      lastAbilityUse: 0,
      isReady: false,
    };

    socket.join(targetRoomId!);
    room.addPlayer(socket, player);

    // Note: joined-room is now emitted by room.addPlayer() to handle both new and reconnecting players correctly

    console.log(`Player ${playerName} joined room ${targetRoomId} with ability ${selectedAbility}`);
  });

  // Add a test bot
  socket.on('add-bot', (roomId: string) => {
    const room = gameRooms.get(normalizeRoomId(roomId));
    if (!room) return;

    const botId = `BOT_${uuidv4().split('-')[0]}`;
    const botName = `TRAINING_BOT_${Math.floor(Math.random() * 1000)}`;

    const botPlayer: Player = {
      id: botId,
      userId: botId,
      name: botName,
      x: Math.random() * 800,
      y: Math.random() * 600,
      targetX: 0,
      targetY: 0,
      velocityX: 0,
      velocityY: 0,
      energy: 0,
      influence: 0,
      color: '#ff0055', // Bot is always secondary/reddish
      isAlive: true,
      isConnected: true,
      isReady: true, // Bot is always ready
      lastAction: Date.now(),
      health: 100,
      maxHealth: 100,
      attackPower: 15, // Weaker than players
      attackRange: 80,
      lastAttack: 0,
      attackCooldown: 1000,
      comboCount: 0,
      lastComboTime: 0,
      killStreak: 0,
      kills: 0,
      deaths: 0,
      score: 0,
      damageDealt: 0,
      nexusesCaptured: 0,
      activePowerUps: [],
      abilityType: 'dash',
      abilityCooldown: 15000,
      lastAbilityUse: 0,

      // Missing properties
      speed: 5,
      lastMovement: Date.now(),
      invincibleUntil: 0,
    };

    // Mock socket for the bot
    const mockSocket = {
      id: botId,
      emit: () => { }, // No-op
      join: () => { }, // No-op
      on: () => { }, // No-op
    } as any as Socket;

    // Join the "socket" to the room (even though it's a mock, we don't really need the io.join logic since we manage broadcasting)
    // Actually, for io.to(room).emit to work, we usually rely on real sockets. 
    // But since the bot doesn't receive events, we just need the GameRoom to track it.

    room.addPlayer(mockSocket, botPlayer);
    console.log(`[Server] Added bot ${botName} to room ${roomId}`);

    // Check if ready trigger needed (bot is ready)
    room.checkReadyStart();
  });

  // Toggle ready status
  socket.on('toggle-ready', (roomId: string) => {
    const room = gameRooms.get(normalizeRoomId(roomId));
    if (room) {
      room.toggleReady(socket.id);
    }
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
      // Create new room - client will join
      const newRoomId = generateRoomId();
      const newRoom = new GameRoom(newRoomId, io);
      gameRooms.set(newRoomId, newRoom);
      newRoom.on('empty', () => {
        gameRooms.delete(newRoomId);
        console.log(`Room ${newRoomId} deleted`);
      });
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

  // Handle disconnection with grace period for reconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const room = findPlayerRoom(socket.id);
    if (room) {
      // Store player data for potential reconnection
      const player = room.getPlayer(socket.id);
      if (player) {
        // Give player 30 seconds to reconnect before removal
        setTimeout(() => {
          // Check if player is still disconnected
          const currentRoom = findPlayerRoom(socket.id);
          if (currentRoom && !socket.connected) {
            currentRoom.removePlayer(socket.id);
          }
        }, 30000);
      } else {
        room.removePlayer(socket.id);
      }
    }
  });

  // Handle reconnection attempts
  socket.on('reconnect-attempt', (data: { playerId: string; roomId: string }) => {
    const room = gameRooms.get(data.roomId);
    if (room && room.hasPlayer(data.playerId)) {
      const player = room.getPlayer(data.playerId);
      if (player) {
        // Update socket reference
        socket.emit('reconnected', {
          player,
          gameState: room.getSerializableGameState(),
        });
      }
    }
  });
});

// Helper functions
function generateRoomId(): string {
  // 6 chars, uppercase, no ambiguous characters removed (keep simple).
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function normalizeRoomId(input: string): string {
  return input.trim().toUpperCase();
}

function isValidRoomId(roomId: string): boolean {
  // Match client UX: 6-character code.
  return /^[A-Z0-9]{6}$/.test(roomId);
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
  console.log(`🌐 CORS enabled for: ${allowAllOrigins ? 'all origins' : clientOrigins.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
