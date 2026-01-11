import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
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
    timestamp: new Date().toISOString()
  });
});

// Get available rooms for quick match
app.get('/rooms', (req, res) => {
  const availableRooms = Array.from(gameRooms.entries())
    .filter(([_, room]) => !room.isFull() && room.getPlayerCount() > 0)
    .map(([id, room]) => ({
      roomId: id,
      playerCount: room.getPlayerCount(),
      maxPlayers: 10,
    }));
  res.json({ rooms: availableRooms });
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
  socket.on('join-room', (data: { roomId?: string; playerName: string; abilityType?: string }) => {
    const { roomId: rawRoomId, playerName, abilityType } = data;

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
      // Special ability
      abilityType: selectedAbility as any,
      abilityCooldown: 15000, // 15 second cooldown
      lastAbilityUse: 0,
    };

    room.addPlayer(socket, player);
    socket.join(targetRoomId!);

    socket.emit('joined-room', {
      roomId: targetRoomId,
      player,
      gameState: room.getSerializableGameState(),
    });

    console.log(`Player ${playerName} joined room ${targetRoomId} with ability ${selectedAbility}`);
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
    // Find a room with space that's waiting for players
    let bestRoom: GameRoom | null = null;
    let bestRoomIdFound: string | null = null;

    for (const [rid, room] of gameRooms) {
      if (!room.isFull() && room.getPlayerCount() > 0 && room.getPlayerCount() < 6) {
        bestRoom = room;
        bestRoomIdFound = rid;
        break;
      }
    }

    if (bestRoom && bestRoomIdFound) {
      socket.emit('quick-match-found', { roomId: bestRoomIdFound });
    } else {
      // Create new room
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
server.listen(PORT, () => {
  console.log(`🚀 Nexus Wars server running on port ${PORT}`);
});
