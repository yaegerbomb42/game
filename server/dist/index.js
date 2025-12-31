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
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
        methods: ['GET', 'POST'],
    },
});
app.use((0, cors_1.default)());
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
// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    // Join or create a game room
    socket.on('join-room', (data) => {
        const { roomId, playerName } = data;
        let room;
        let targetRoomId = roomId;
        if (roomId && gameRooms.has(roomId)) {
            // Join existing room
            room = gameRooms.get(roomId);
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
            room.on('empty', () => {
                gameRooms.delete(targetRoomId);
                console.log(`Room ${targetRoomId} deleted`);
            });
        }
        const player = {
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