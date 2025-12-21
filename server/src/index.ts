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
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Join or create a game room
  socket.on('join-room', (data: { roomId?: string; playerName: string }) => {
    const { roomId, playerName } = data;
    
    let room: GameRoom;
    let targetRoomId = roomId;

    if (roomId && gameRooms.has(roomId)) {
      // Join existing room
      room = gameRooms.get(roomId)!;
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
      room.on('empty', () => {
        gameRooms.delete(targetRoomId!);
        console.log(`Room ${targetRoomId} deleted`);
      });
    }

    const player: Player = {
      id: socket.id,
      name: playerName,
      x: Math.random() * 800,
      y: Math.random() * 600,
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
      attackCooldown: 1000, // 1 second cooldown
      // Stats
      kills: 0,
      deaths: 0,
      score: 0,
      // Power-ups
      activePowerUps: [],
      // Movement
      speed: 150,
      lastMovement: 0,
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
