"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
class GameRoom extends events_1.EventEmitter {
    roomId;
    io;
    players = new Map();
    sockets = new Map();
    nexuses = [];
    powerUps = [];
    gamePhase = 'waiting';
    phaseStartTime = Date.now();
    gameStartTime = 0;
    winner = null;
    gameLoop = null;
    powerUpSpawnTimer = null;
    constructor(roomId, io) {
        super();
        this.roomId = roomId;
        this.io = io;
        this.initializeNexuses();
    }
    initializeNexuses() {
        // Create 5 nexuses at strategic positions
        const positions = [
            { x: 200, y: 150 },
            { x: 600, y: 150 },
            { x: 400, y: 300 },
            { x: 200, y: 450 },
            { x: 600, y: 450 },
        ];
        this.nexuses = positions.map(pos => ({
            id: (0, uuid_1.v4)(),
            x: pos.x,
            y: pos.y,
            energy: 100,
            controlledBy: null,
            lastPulse: Date.now(),
            chargeLevel: 1,
        }));
    }
    addPlayer(socket, player) {
        this.players.set(player.id, player);
        this.sockets.set(player.id, socket);
        this.broadcastEvent({
            type: 'player-joined',
            data: { player },
            timestamp: Date.now(),
        });
        // Start game if we have enough players
        if (this.players.size >= 2 && this.gamePhase === 'waiting') {
            this.startGame();
        }
    }
    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            this.players.delete(playerId);
            this.sockets.delete(playerId);
            this.broadcastEvent({
                type: 'player-left',
                data: { playerId, playerName: player.name },
                timestamp: Date.now(),
            });
            // End game if not enough players
            if (this.players.size < 2 && this.gamePhase !== 'waiting' && this.gamePhase !== 'ended') {
                this.endGame('insufficient-players');
            }
            // Emit empty event if no players left
            if (this.players.size === 0) {
                this.emit('empty');
            }
        }
    }
    handlePlayerAction(playerId, action) {
        const player = this.players.get(playerId);
        if (!player || !player.isAlive)
            return;
        // Rate limiting - max 10 actions per second
        const now = Date.now();
        if (now - player.lastAction < 100)
            return;
        player.lastAction = now;
        switch (action.type) {
            case 'move':
                this.handleMove(player, action);
                break;
            case 'harvest':
                this.handleHarvest(player, action);
                break;
            case 'deploy-beacon':
                this.handleDeployBeacon(player, action);
                break;
            case 'boost-nexus':
                this.handleBoostNexus(player, action);
                break;
            case 'attack':
                this.handleAttack(player, action);
                break;
            case 'defend':
                this.handleDefend(player, action);
                break;
            case 'collect-powerup':
                this.handleCollectPowerUp(player, action);
                break;
            case 'use-ability':
                this.handleUseAbility(player, action);
                break;
        }
        this.broadcastGameState();
    }
    handleMove(player, action) {
        if (action.data.x !== undefined && action.data.y !== undefined) {
            const now = Date.now();
            const dt = Math.min((now - player.lastMovement) / 1000, 0.1); // Cap at 100ms
            player.lastMovement = now;
            // Calculate max distance player can move based on speed
            const maxDistance = player.speed * dt * 1.5; // Allow slight overshoot for latency
            const targetX = Math.max(20, Math.min(780, action.data.x));
            const targetY = Math.max(20, Math.min(580, action.data.y));
            // Calculate actual distance requested
            const dx = targetX - player.x;
            const dy = targetY - player.y;
            const requestedDistance = Math.sqrt(dx * dx + dy * dy);
            if (requestedDistance <= maxDistance || requestedDistance < 5) {
                // Valid movement
                player.x = targetX;
                player.y = targetY;
            }
            else {
                // Cap movement to max allowed distance
                const ratio = maxDistance / requestedDistance;
                player.x += dx * ratio;
                player.y += dy * ratio;
            }
        }
    }
    handleHarvest(player, action) {
        const nexus = this.nexuses.find(n => n.id === action.data.nexusId);
        if (!nexus)
            return;
        // Check if player is close enough to nexus
        const distance = Math.sqrt((player.x - nexus.x) ** 2 + (player.y - nexus.y) ** 2);
        if (distance > 60)
            return;
        // Harvest energy
        const harvestAmount = Math.min(15 * nexus.chargeLevel, nexus.energy);
        nexus.energy -= harvestAmount;
        player.energy += harvestAmount;
        player.score += Math.floor(harvestAmount / 2); // Score for harvesting
        // Gain influence over nexus
        if (nexus.controlledBy === player.id) {
            player.influence += 3;
            player.score += 5;
        }
        else if (nexus.controlledBy === null) {
            // Capture unclaimed nexus
            nexus.controlledBy = player.id;
            player.influence += 10;
            player.score += 50;
            this.broadcastEvent({
                type: 'nexus-captured',
                data: { nexusId: nexus.id, playerId: player.id, playerName: player.name },
                timestamp: Date.now(),
            });
        }
        else {
            // Contest enemy nexus - reduce their control
            const defender = this.players.get(nexus.controlledBy);
            if (defender) {
                defender.influence = Math.max(0, defender.influence - 2);
            }
            // Steal the nexus if we harvest enough
            nexus.chargeLevel = Math.max(1, nexus.chargeLevel - 1);
            if (nexus.chargeLevel <= 0 || nexus.energy <= 10) {
                const oldOwner = nexus.controlledBy;
                nexus.controlledBy = player.id;
                nexus.chargeLevel = 1;
                player.influence += 15;
                player.score += 75;
                this.broadcastEvent({
                    type: 'nexus-captured',
                    data: {
                        nexusId: nexus.id,
                        playerId: player.id,
                        playerName: player.name,
                        contested: true,
                        previousOwner: oldOwner
                    },
                    timestamp: Date.now(),
                });
            }
        }
    }
    handleDeployBeacon(player, action) {
        if (player.energy < 20)
            return;
        player.energy -= 20;
        player.influence += 5;
        player.score += 10;
        // Beacon gives nearby nexus control boost
        const nearbyNexus = this.nexuses.find(n => {
            const dist = Math.sqrt((player.x - n.x) ** 2 + (player.y - n.y) ** 2);
            return dist < 100;
        });
        if (nearbyNexus && nearbyNexus.controlledBy === player.id) {
            nearbyNexus.chargeLevel = Math.min(5, nearbyNexus.chargeLevel + 1);
        }
        this.broadcastEvent({
            type: 'beacon-deployed',
            data: { playerId: player.id, x: player.x, y: player.y },
            timestamp: Date.now(),
        });
    }
    handleBoostNexus(player, action) {
        const nexus = this.nexuses.find(n => n.id === action.data.nexusId);
        if (!nexus || nexus.controlledBy !== player.id || player.energy < 15)
            return;
        player.energy -= 15;
        nexus.chargeLevel = Math.min(3, nexus.chargeLevel + 1);
    }
    handleAttack(player, action) {
        const now = Date.now();
        // Check attack cooldown
        if (now - player.lastAttack < player.attackCooldown)
            return;
        const targetPlayer = this.players.get(action.data.targetId || '');
        if (!targetPlayer || !targetPlayer.isAlive)
            return;
        // Can't attack self
        if (targetPlayer.id === player.id)
            return;
        // Check attack range
        const distance = Math.sqrt((player.x - targetPlayer.x) ** 2 + (player.y - targetPlayer.y) ** 2);
        if (distance > player.attackRange)
            return;
        // Calculate damage with distance falloff
        const distanceRatio = 1 - (distance / player.attackRange) * 0.3;
        let damage = Math.floor(player.attackPower * distanceRatio);
        // Check for shield power-up
        const hasShield = targetPlayer.activePowerUps.some(p => p.type === 'shield');
        if (hasShield) {
            damage = Math.floor(damage * 0.5);
        }
        targetPlayer.health -= damage;
        player.lastAttack = now;
        player.score += damage; // Score for damage dealt
        // Steal some energy on hit
        const stolenEnergy = Math.min(5, targetPlayer.energy);
        targetPlayer.energy -= stolenEnergy;
        player.energy += Math.floor(stolenEnergy * 0.7);
        // Broadcast attack event
        this.broadcastEvent({
            type: 'player-attacked',
            data: {
                attackerId: player.id,
                attackerName: player.name,
                targetId: targetPlayer.id,
                targetName: targetPlayer.name,
                damage,
                targetHealth: targetPlayer.health,
                stolenEnergy,
                position: { x: targetPlayer.x, y: targetPlayer.y }
            },
            timestamp: now,
        });
        // Check if target is killed
        if (targetPlayer.health <= 0) {
            this.handlePlayerKilled(player, targetPlayer);
        }
    }
    handleDefend(player, action) {
        if (player.energy < 10)
            return;
        player.energy -= 10;
        // Defensive boost logic would go here
    }
    handlePlayerKilled(attacker, victim) {
        // Update stats
        attacker.kills++;
        attacker.score += 150; // Base kill score
        // Bonus score for kill streaks
        const killStreak = attacker.kills;
        if (killStreak >= 3) {
            attacker.score += 50 * (killStreak - 2);
        }
        victim.deaths++;
        victim.isAlive = false;
        victim.health = 0;
        // Transfer some resources on death
        const energyTransfer = Math.floor(victim.energy * 0.3);
        const influenceTransfer = Math.floor(victim.influence * 0.1);
        attacker.energy += energyTransfer;
        attacker.influence += influenceTransfer;
        victim.energy = Math.floor(victim.energy * 0.5); // Lose 50% energy on death
        // Release any nexuses controlled by victim
        this.nexuses.forEach(nexus => {
            if (nexus.controlledBy === victim.id) {
                nexus.controlledBy = null;
                nexus.chargeLevel = Math.max(1, nexus.chargeLevel - 1);
            }
        });
        // Broadcast kill event
        this.broadcastEvent({
            type: 'player-killed',
            data: {
                killerId: attacker.id,
                killerName: attacker.name,
                victimId: victim.id,
                victimName: victim.name,
                killStreak,
                energyTransfer,
                influenceTransfer
            },
            timestamp: Date.now(),
        });
        // Respawn victim after 3 seconds
        setTimeout(() => {
            this.respawnPlayer(victim);
        }, 3000);
    }
    respawnPlayer(player) {
        if (!this.players.has(player.id))
            return; // Player left the game
        player.isAlive = true;
        player.health = player.maxHealth;
        player.x = Math.random() * 800;
        player.y = Math.random() * 600;
        player.activePowerUps = []; // Clear power-ups on respawn
        this.broadcastGameState();
    }
    handleCollectPowerUp(player, action) {
        const powerUpId = action.data.powerUpId;
        const powerUpIndex = this.powerUps.findIndex(p => p.id === powerUpId && !p.collected);
        if (powerUpIndex === -1)
            return;
        const powerUp = this.powerUps[powerUpIndex];
        const distance = Math.sqrt((player.x - powerUp.x) ** 2 + (player.y - powerUp.y) ** 2);
        if (distance > 40)
            return; // Must be close to collect
        // Mark as collected
        powerUp.collected = true;
        // Apply power-up effect
        this.applyPowerUpEffect(player, powerUp);
        // For duration-based power-ups, track expiration
        if (powerUp.duration > 0) {
            const activePowerUp = { ...powerUp, expiresAt: Date.now() + powerUp.duration };
            player.activePowerUps.push(activePowerUp);
        }
        player.score += 15; // Score for collecting power-up
        // Remove from world
        this.powerUps.splice(powerUpIndex, 1);
        // Broadcast collection event
        this.broadcastEvent({
            type: 'powerup-collected',
            data: {
                playerId: player.id,
                playerName: player.name,
                powerUpType: powerUp.type,
                effect: powerUp.effect,
                position: { x: powerUp.x, y: powerUp.y }
            },
            timestamp: Date.now(),
        });
    }
    applyPowerUpEffect(player, powerUp) {
        switch (powerUp.type) {
            case 'speed':
                player.speed += powerUp.effect;
                break;
            case 'damage':
                player.attackPower += powerUp.effect;
                break;
            case 'health':
                player.health = Math.min(player.maxHealth, player.health + powerUp.effect);
                break;
            case 'shield':
                // Shield effect would be handled in damage calculation
                break;
            case 'energy':
                player.energy += powerUp.effect;
                break;
        }
    }
    handleUseAbility(player, action) {
        // Placeholder for special abilities
        // This would be expanded with specific ability implementations
        const abilityType = action.data.abilityType;
        switch (abilityType) {
            case 'dash':
                // Implement dash ability
                break;
            case 'heal':
                // Implement heal ability
                break;
            case 'shield':
                // Implement shield ability
                break;
        }
    }
    startGame() {
        this.gamePhase = 'spawn';
        this.gameStartTime = Date.now();
        this.phaseStartTime = Date.now();
        this.broadcastEvent({
            type: 'game-started',
            data: { gameStartTime: this.gameStartTime },
            timestamp: Date.now(),
        });
        // Start game loop - faster tick rate for responsive multiplayer
        this.gameLoop = setInterval(() => {
            this.updateGamePhase();
            this.updateNexuses();
            this.updatePowerUps();
            this.updatePlayerEffects();
            this.updateScores();
            this.broadcastGameState();
        }, 100); // 10 ticks per second for responsiveness
        // Start power-up spawning
        this.startPowerUpSpawning();
    }
    updateGamePhase() {
        const elapsed = Date.now() - this.phaseStartTime;
        let phaseChanged = false;
        const oldPhase = this.gamePhase;
        switch (this.gamePhase) {
            case 'spawn':
                if (elapsed > 10000) { // 10 seconds
                    this.gamePhase = 'expansion';
                    this.phaseStartTime = Date.now();
                    phaseChanged = true;
                }
                break;
            case 'expansion':
                if (elapsed > 35000) { // 35 seconds
                    this.gamePhase = 'conflict';
                    this.phaseStartTime = Date.now();
                    phaseChanged = true;
                }
                break;
            case 'conflict':
                if (elapsed > 30000) { // 30 seconds
                    this.gamePhase = 'pulse';
                    this.phaseStartTime = Date.now();
                    this.triggerEnergyPulse();
                    phaseChanged = true;
                }
                break;
            case 'pulse':
                if (elapsed > 15000) { // 15 seconds
                    this.endGame('time-up');
                }
                break;
        }
        if (phaseChanged) {
            this.broadcastEvent({
                type: 'phase-changed',
                data: { oldPhase, newPhase: this.gamePhase },
                timestamp: Date.now(),
            });
        }
    }
    updateScores() {
        // Passive score gain based on controlled nexuses
        for (const player of this.players.values()) {
            const controlledNexuses = this.nexuses.filter(n => n.controlledBy === player.id).length;
            if (controlledNexuses > 0) {
                player.score += controlledNexuses; // 1 score per nexus per tick
            }
        }
    }
    updateNexuses() {
        const now = Date.now();
        this.nexuses.forEach(nexus => {
            // Regenerate energy
            if (now - nexus.lastPulse > 5000) { // Every 5 seconds
                nexus.energy = Math.min(100, nexus.energy + 10);
                nexus.lastPulse = now;
                // Give energy to controlling player
                if (nexus.controlledBy) {
                    const player = this.players.get(nexus.controlledBy);
                    if (player) {
                        player.energy += nexus.chargeLevel * 5;
                    }
                }
            }
        });
    }
    triggerEnergyPulse() {
        this.nexuses.forEach(nexus => {
            if (nexus.controlledBy) {
                const player = this.players.get(nexus.controlledBy);
                if (player) {
                    const pulseEnergy = nexus.chargeLevel * 25;
                    player.energy += pulseEnergy;
                    player.influence += nexus.chargeLevel * 10;
                }
            }
        });
        this.broadcastEvent({
            type: 'energy-pulse',
            data: { nexuses: this.nexuses },
            timestamp: Date.now(),
        });
    }
    endGame(reason) {
        this.gamePhase = 'ended';
        // Determine winner based on influence
        let maxInfluence = 0;
        let winnerId = null;
        for (const [playerId, player] of this.players) {
            if (player.influence > maxInfluence) {
                maxInfluence = player.influence;
                winnerId = playerId;
            }
        }
        this.winner = winnerId;
        this.broadcastEvent({
            type: 'game-ended',
            data: {
                winner: winnerId ? this.players.get(winnerId) : null,
                reason,
                finalScores: Array.from(this.players.values()).map(p => ({
                    id: p.id,
                    name: p.name,
                    influence: p.influence,
                    energy: p.energy,
                }))
            },
            timestamp: Date.now(),
        });
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
        if (this.powerUpSpawnTimer) {
            clearInterval(this.powerUpSpawnTimer);
            this.powerUpSpawnTimer = null;
        }
    }
    startPowerUpSpawning() {
        // Spawn initial power-ups
        for (let i = 0; i < 3; i++) {
            this.spawnPowerUp();
        }
        // Spawn a power-up every 8-15 seconds
        this.powerUpSpawnTimer = setInterval(() => {
            this.spawnPowerUp();
        }, 8000 + Math.random() * 7000);
    }
    spawnPowerUp() {
        // Don't spawn too many power-ups
        if (this.powerUps.filter(p => !p.collected).length >= 6)
            return;
        const powerUpTypes = ['speed', 'shield', 'damage', 'health', 'energy'];
        const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
        // Spawn away from nexuses and map edges
        let x, y;
        let attempts = 0;
        do {
            x = 50 + Math.random() * 700;
            y = 50 + Math.random() * 500;
            attempts++;
        } while (this.isNearNexus(x, y) && attempts < 10);
        const powerUp = {
            id: (0, uuid_1.v4)(),
            type,
            x,
            y,
            duration: this.getPowerUpDuration(type),
            effect: this.getPowerUpEffect(type),
            expiresAt: Date.now() + 45000, // Despawn after 45 seconds if uncollected
            collected: false,
        };
        this.powerUps.push(powerUp);
        this.broadcastEvent({
            type: 'powerup-spawned',
            data: { powerUp },
            timestamp: Date.now(),
        });
    }
    isNearNexus(x, y) {
        return this.nexuses.some(n => {
            const dist = Math.sqrt((x - n.x) ** 2 + (y - n.y) ** 2);
            return dist < 80;
        });
    }
    getPowerUpDuration(type) {
        switch (type) {
            case 'speed': return 10000; // 10 seconds
            case 'shield': return 8000; // 8 seconds
            case 'damage': return 12000; // 12 seconds
            case 'health': return 0; // Instant
            case 'energy': return 0; // Instant
            default: return 5000;
        }
    }
    getPowerUpEffect(type) {
        switch (type) {
            case 'speed': return 50; // +50 speed
            case 'shield': return 50; // 50% damage reduction
            case 'damage': return 15; // +15 attack power
            case 'health': return 50; // +50 health
            case 'energy': return 30; // +30 energy
            default: return 10;
        }
    }
    updatePowerUps() {
        const now = Date.now();
        // Remove expired or collected power-ups
        this.powerUps = this.powerUps.filter(powerUp => {
            if (powerUp.collected)
                return false;
            // Remove if expired
            return now < powerUp.expiresAt;
        });
    }
    updatePlayerEffects() {
        const now = Date.now();
        for (const player of this.players.values()) {
            // Remove expired power-ups
            const expiredPowerUps = player.activePowerUps.filter(p => now > p.expiresAt);
            // Reverse power-up effects
            for (const powerUp of expiredPowerUps) {
                this.removePowerUpEffect(player, powerUp);
            }
            // Keep only non-expired power-ups
            player.activePowerUps = player.activePowerUps.filter(p => now <= p.expiresAt);
        }
    }
    removePowerUpEffect(player, powerUp) {
        switch (powerUp.type) {
            case 'speed':
                player.speed = Math.max(150, player.speed - powerUp.effect); // Don't go below base speed
                break;
            case 'damage':
                player.attackPower = Math.max(25, player.attackPower - powerUp.effect); // Don't go below base damage
                break;
            // Health and energy are instant effects, no need to reverse
            // Shield effect would be handled in damage calculation
        }
    }
    broadcastEvent(event) {
        this.io.to(this.roomId).emit('game-event', event);
    }
    broadcastGameState() {
        this.io.to(this.roomId).emit('game-state-update', this.getSerializableGameState());
    }
    // Public methods
    getGameState() {
        return {
            players: this.players,
            nexuses: this.nexuses,
            powerUps: this.powerUps,
            gamePhase: this.gamePhase,
            phaseStartTime: this.phaseStartTime,
            gameStartTime: this.gameStartTime,
            winner: this.winner,
            leaderboard: this.generateLeaderboard(),
        };
    }
    getSerializableGameState() {
        return {
            players: Object.fromEntries(this.players),
            nexuses: this.nexuses,
            powerUps: this.powerUps,
            gamePhase: this.gamePhase,
            phaseStartTime: this.phaseStartTime,
            gameStartTime: this.gameStartTime,
            winner: this.winner,
            leaderboard: this.generateLeaderboard(),
        };
    }
    generateLeaderboard() {
        return Array.from(this.players.values())
            .sort((a, b) => b.score - a.score)
            .map(player => ({
            playerId: player.id,
            playerName: player.name,
            score: player.score,
            kills: player.kills,
            deaths: player.deaths,
        }));
    }
    getPlayerCount() {
        return this.players.size;
    }
    isFull() {
        return this.players.size >= 10;
    }
    hasPlayer(playerId) {
        return this.players.has(playerId);
    }
    getPlayer(playerId) {
        return this.players.get(playerId);
    }
    getRoomId() {
        return this.roomId;
    }
}
exports.GameRoom = GameRoom;
//# sourceMappingURL=GameRoom.js.map