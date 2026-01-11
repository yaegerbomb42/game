"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const uuid_1 = require("uuid");
const GameRoom_1 = require("./GameRoom");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
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
const io = new socket_io_1.Server(server, {
    cors: {
        origin: allowAllOrigins ? true : clientOrigins,
        methods: ['GET', 'POST'],
    },
});
app.use((0, cors_1.default)({
    origin: allowAllOrigins ? true : clientOrigins,
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
    const room = new GameRoom_1.GameRoom(roomId, io);
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
    let targetRoomId = null;
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
    const room = new GameRoom_1.GameRoom(roomId, io);
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
    socket.on('join-room', (data) => {
        const { roomId: rawRoomId, playerName, abilityType, userId } = data;
        let room;
        let targetRoomId;
        const requestedRoomId = rawRoomId ? normalizeRoomId(rawRoomId) : undefined;
        if (requestedRoomId && gameRooms.has(requestedRoomId)) {
            // Join existing room
            room = gameRooms.get(requestedRoomId);
            targetRoomId = requestedRoomId;
            if (room.isFull()) {
                socket.emit('room-full');
                return;
            }
        }
        else if (requestedRoomId && isValidRoomId(requestedRoomId) && !gameRooms.has(requestedRoomId)) {
            // Create requested room (invite-code / quickjoin flow)
            targetRoomId = requestedRoomId;
            room = new GameRoom_1.GameRoom(targetRoomId, io);
            gameRooms.set(targetRoomId, room);
            room.on('empty', () => {
                gameRooms.delete(targetRoomId);
                console.log(`Room ${targetRoomId} deleted`);
            });
        }
        else {
            // Create new room with server-generated id
            targetRoomId = generateRoomId();
            room = new GameRoom_1.GameRoom(targetRoomId, io);
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
        const player = {
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
            abilityType: selectedAbility,
            abilityCooldown: 15000, // 15 second cooldown
            lastAbilityUse: 0,
        };
        socket.join(targetRoomId);
        room.addPlayer(socket, player);
        // Note: joined-room is now emitted by room.addPlayer() to handle both new and reconnecting players correctly
        console.log(`Player ${playerName} joined room ${targetRoomId} with ability ${selectedAbility}`);
    });
    // Add a test bot
    socket.on('add-bot', (roomId) => {
        const room = gameRooms.get(normalizeRoomId(roomId));
        if (!room)
            return;
        const botId = `BOT_${(0, uuid_1.v4)().split('-')[0]}`;
        const botName = `TRAINING_BOT_${Math.floor(Math.random() * 1000)}`;
        const botPlayer = {
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
        };
        // Join the "socket" to the room (even though it's a mock, we don't really need the io.join logic since we manage broadcasting)
        // Actually, for io.to(room).emit to work, we usually rely on real sockets. 
        // But since the bot doesn't receive events, we just need the GameRoom to track it.
        room.addPlayer(mockSocket, botPlayer);
        console.log(`[Server] Added bot ${botName} to room ${roomId}`);
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
            const newRoom = new GameRoom_1.GameRoom(newRoomId, io);
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
function generateRoomId() {
    // 6 chars, uppercase, no ambiguous characters removed (keep simple).
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function normalizeRoomId(input) {
    return input.trim().toUpperCase();
}
function isValidRoomId(roomId) {
    // Match client UX: 6-character code.
    return /^[A-Z0-9]{6}$/.test(roomId);
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