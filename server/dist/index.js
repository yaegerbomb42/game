"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const GameRoom_1 = require("./GameRoom");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// Configure CORS based on environment
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production'
            ? allowedOrigins
            : ['http://localhost:3000', 'http://localhost:5173'],
        methods: ['GET', 'POST'],
        credentials: true,
    },
    // Better settings for production
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    transports: ['websocket', 'polling'],
});
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? allowedOrigins
        : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
}));
app.use(express_1.default.json());
// Store active game rooms
const gameRooms = new Map();
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
    socket.on('join-room', (data) => {
        const { roomId, playerName } = data;
        let room;
        let targetRoomId;
        if (roomId && gameRooms.has(roomId)) {
            // Join existing room
            room = gameRooms.get(roomId);
            targetRoomId = roomId;
            if (room.isFull()) {
                socket.emit('room-full');
                return;
            }
        }
        else {
            // Create new room
            targetRoomId = generateRoomId();
            room = new GameRoom_1.GameRoom(targetRoomId, io);
            gameRooms.set(targetRoomId, room);
            // Clean up room when it's empty
            const roomIdToDelete = targetRoomId;
            room.on('empty', () => {
                gameRooms.delete(roomIdToDelete);
                console.log(`Room ${roomIdToDelete} deleted`);
            });
        }
        const abilities = ['dash', 'heal', 'shield', 'scan'];
        const player = {
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
    socket.on('quick-match', (data) => {
        // Find a room with space that's waiting for players
        let bestRoom = null;
        let bestRoomIdFound = null;
        for (const [rid, room] of gameRooms) {
            if (!room.isFull() && room.getPlayerCount() > 0 && room.getPlayerCount() < 6) {
                bestRoom = room;
                bestRoomIdFound = rid;
                break;
            }
        }
        if (bestRoom && bestRoomIdFound) {
            socket.emit('quick-match-found', { roomId: bestRoomIdFound });
        }
        else {
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
            }
            else {
                room.removePlayer(socket.id);
            }
        }
    });
    // Handle reconnection attempts
    socket.on('reconnect-attempt', (data) => {
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
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function getPlayerColor(playerIndex) {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    return colors[playerIndex % colors.length];
}
function findPlayerRoom(playerId) {
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
//# sourceMappingURL=index.js.map