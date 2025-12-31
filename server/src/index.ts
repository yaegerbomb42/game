import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameRoom } from './GameRoom';
import { Player } from './types';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? ['https://nexus-wars.vercel.app', 'http://localhost:3000'] : ['http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Join or create a game room
  socket.on('join-room', (data: { roomId?: string; playerName: string; abilityType?: string }) => {
    const { roomId, playerName, abilityType } = data;
    
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
    socket.join(targetRoomId);
    
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
server.listen(PORT, () => {
  console.log(`🚀 Nexus Wars server running on port ${PORT}`);
});
