"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const TICK_RATE = 60; // 60 ticks per second for smooth movement
const BROADCAST_RATE = 20; // Send state 20 times per second
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
    broadcastLoop = null;
    powerUpSpawnTimer = null;
    matchNumber = 0;
    constructor(roomId, io) {
        super();
        this.roomId = roomId;
        this.io = io;
        this.initializeNexuses();
    }
    initializeNexuses() {
        // Create 7 nexuses for more strategic gameplay
        const positions = [
            { x: 150, y: 150 }, // Top-left
            { x: 650, y: 150 }, // Top-right
            { x: 400, y: 300 }, // Center (high value)
            { x: 150, y: 450 }, // Bottom-left
            { x: 650, y: 450 }, // Bottom-right
            { x: 400, y: 100 }, // Top-center
            { x: 400, y: 500 }, // Bottom-center
        ];
        this.nexuses = positions.map((pos, index) => ({
            id: (0, uuid_1.v4)(),
            x: pos.x,
            y: pos.y,
            energy: 100,
            controlledBy: null,
            lastPulse: Date.now(),
            chargeLevel: index === 2 ? 2 : 1, // Center nexus starts with higher charge
            contestProgress: new Map(),
            isContested: false,
            captureRate: index === 2 ? 0.8 : 1.0, // Center is slower to capture
        }));
    }
    addPlayer(socket, player) {
        // Find spawn position away from other players
        const spawnPos = this.findSafeSpawnPosition();
        player.x = spawnPos.x;
        player.y = spawnPos.y;
        player.targetX = spawnPos.x;
        player.targetY = spawnPos.y;
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
    findSafeSpawnPosition() {
        const spawnZones = [
            { x: 100, y: 100 },
            { x: 700, y: 100 },
            { x: 100, y: 500 },
            { x: 700, y: 500 },
            { x: 400, y: 550 },
            { x: 400, y: 50 },
        ];
        // Find zone farthest from all players
        let bestZone = spawnZones[0];
        let maxMinDistance = 0;
        for (const zone of spawnZones) {
            let minDistanceToPlayer = Infinity;
            for (const player of this.players.values()) {
                const dist = Math.sqrt((zone.x - player.x) ** 2 + (zone.y - player.y) ** 2);
                minDistanceToPlayer = Math.min(minDistanceToPlayer, dist);
            }
            if (minDistanceToPlayer > maxMinDistance) {
                maxMinDistance = minDistanceToPlayer;
                bestZone = zone;
            }
        }
        // Add some randomness
        return {
            x: bestZone.x + (Math.random() - 0.5) * 50,
            y: bestZone.y + (Math.random() - 0.5) * 50,
        };
    }
    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            // Release any nexuses controlled by this player
            this.nexuses.forEach(nexus => {
                if (nexus.controlledBy === playerId) {
                    nexus.controlledBy = null;
                }
                nexus.contestProgress.delete(playerId);
            });
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
            if (this.players.size === 0) {
                this.emit('empty');
            }
        }
    }
    handlePlayerAction(playerId, action) {
        const player = this.players.get(playerId);
        if (!player || !player.isAlive)
            return;
        // Rate limiting - max 30 actions per second
        const now = Date.now();
        if (now - player.lastAction < 33)
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
    }
    handleMove(player, action) {
        if (action.data.x !== undefined && action.data.y !== undefined) {
            // Set target position - server will interpolate
            player.targetX = Math.max(20, Math.min(GAME_WIDTH - 20, action.data.x));
            player.targetY = Math.max(20, Math.min(GAME_HEIGHT - 20, action.data.y));
        }
    }
    handleHarvest(player, action) {
        const nexus = this.nexuses.find(n => n.id === action.data.nexusId);
        if (!nexus)
            return;
        const distance = Math.sqrt((player.x - nexus.x) ** 2 + (player.y - nexus.y) ** 2);
        if (distance > 60)
            return;
        // Harvest energy with bonus for owned nexuses
        const baseHarvestAmount = Math.min(15, nexus.energy);
        const ownershipBonus = nexus.controlledBy === player.id ? 5 : 0;
        const harvestAmount = baseHarvestAmount + ownershipBonus;
        nexus.energy -= baseHarvestAmount;
        player.energy += harvestAmount;
        // Increase capture progress with combo multiplier
        const currentProgress = nexus.contestProgress.get(player.id) || 0;
        const comboMultiplier = Math.min(1 + (player.comboCount * 0.1), 2);
        const progressGain = 20 * nexus.captureRate * comboMultiplier;
        nexus.contestProgress.set(player.id, Math.min(100, currentProgress + progressGain));
        this.updateNexusControl(nexus);
        // Score for harvesting with bonus scoring
        const baseScore = 5;
        const comboBonus = player.comboCount > 1 ? player.comboCount : 0;
        player.score += baseScore + comboBonus;
        this.updateCombo(player, 'harvest');
    }
    updateNexusControl(nexus) {
        // Find player with highest progress
        let highestProgress = 0;
        let leaderId = null;
        let isContested = false;
        nexus.contestProgress.forEach((progress, playerId) => {
            if (progress > highestProgress) {
                highestProgress = progress;
                leaderId = playerId;
            }
        });
        // Check if contested (another player has >30% of leader's progress)
        const currentLeaderId = leaderId;
        if (currentLeaderId) {
            nexus.contestProgress.forEach((progress, playerId) => {
                if (playerId !== currentLeaderId && progress > highestProgress * 0.3) {
                    isContested = true;
                }
            });
        }
        nexus.isContested = isContested;
        // Award control if threshold reached
        if (highestProgress >= 100 && currentLeaderId && currentLeaderId !== nexus.controlledBy) {
            const previousOwner = nexus.controlledBy;
            nexus.controlledBy = currentLeaderId;
            const player = this.players.get(currentLeaderId);
            if (player) {
                player.influence += 10;
                player.score += 50;
                player.nexusesCaptured++;
                this.broadcastEvent({
                    type: 'nexus-captured',
                    data: {
                        nexusId: nexus.id,
                        playerId: currentLeaderId,
                        playerName: player.name,
                        previousOwner
                    },
                    timestamp: Date.now(),
                });
            }
            // Reduce progress of others
            nexus.contestProgress.forEach((_, playerId) => {
                if (playerId !== currentLeaderId) {
                    const current = nexus.contestProgress.get(playerId) || 0;
                    nexus.contestProgress.set(playerId, Math.max(0, current - 30));
                }
            });
        }
    }
    updateCombo(player, action) {
        const now = Date.now();
        const COMBO_WINDOW = 3000; // 3 seconds
        if (now - player.lastComboTime < COMBO_WINDOW) {
            player.comboCount++;
            const comboBonus = Math.min(player.comboCount * 2, 20);
            player.score += comboBonus;
            if (player.comboCount >= 5) {
                this.broadcastEvent({
                    type: 'achievement-unlocked',
                    data: { playerId: player.id, achievement: `${player.comboCount}x Combo!` },
                    timestamp: now,
                });
            }
        }
        else {
            player.comboCount = 1;
        }
        player.lastComboTime = now;
    }
    handleDeployBeacon(player, action) {
        if (player.energy < 25)
            return;
        player.energy -= 25;
        player.influence += 5;
        player.score += 10;
        // Beacon creates area influence - boost nearby nexus capture
        this.nexuses.forEach(nexus => {
            const distance = Math.sqrt((player.x - nexus.x) ** 2 + (player.y - nexus.y) ** 2);
            if (distance < 150) {
                const currentProgress = nexus.contestProgress.get(player.id) || 0;
                nexus.contestProgress.set(player.id, Math.min(100, currentProgress + 15));
                this.updateNexusControl(nexus);
            }
        });
        this.broadcastEvent({
            type: 'beacon-deployed',
            data: { playerId: player.id, x: player.x, y: player.y },
            timestamp: Date.now(),
        });
    }
    handleBoostNexus(player, action) {
        const nexus = this.nexuses.find(n => n.id === action.data.nexusId);
        if (!nexus || nexus.controlledBy !== player.id || player.energy < 20)
            return;
        player.energy -= 20;
        nexus.chargeLevel = Math.min(5, nexus.chargeLevel + 1);
        player.score += 15;
    }
    handleAttack(player, action) {
        const now = Date.now();
        // Check invincibility
        if (now < player.invincibleUntil)
            return;
        // Check attack cooldown
        if (now - player.lastAttack < player.attackCooldown)
            return;
        const targetPlayer = this.players.get(action.data.targetId || '');
        if (!targetPlayer || !targetPlayer.isAlive)
            return;
        // Check target invincibility
        if (now < targetPlayer.invincibleUntil) {
            this.broadcastEvent({
                type: 'attack-blocked',
                data: { attackerId: player.id, targetId: targetPlayer.id, reason: 'invincible' },
                timestamp: now,
            });
            return;
        }
        const distance = Math.sqrt((player.x - targetPlayer.x) ** 2 + (player.y - targetPlayer.y) ** 2);
        if (distance > player.attackRange)
            return;
        // Calculate damage with combo bonus and distance scaling
        let damage = player.attackPower;
        // Combo bonus: more damage with consecutive actions
        if (player.comboCount > 1) {
            damage += Math.min(player.comboCount * 3, 20);
        }
        // Distance bonus: closer attacks deal more damage
        const distanceRatio = distance / player.attackRange;
        if (distanceRatio < 0.5) {
            damage = Math.floor(damage * 1.3); // 30% more damage at close range
        }
        // Critical hit chance (10% for high combo)
        if (player.comboCount >= 3 && Math.random() < 0.1) {
            damage = Math.floor(damage * 1.5);
            this.broadcastEvent({
                type: 'critical-hit',
                data: { attackerId: player.id, targetId: targetPlayer.id },
                timestamp: now,
            });
        }
        // Check for shield power-up
        const hasShield = targetPlayer.activePowerUps.some(p => p.type === 'shield');
        if (hasShield) {
            damage = Math.floor(damage * 0.5);
        }
        targetPlayer.health -= damage;
        player.damageDealt += damage;
        player.lastAttack = now;
        // Better scoring for attacks
        const attackScore = Math.floor(damage / 2) + (player.comboCount > 1 ? player.comboCount * 2 : 0);
        player.score += attackScore;
        // Improved knockback with direction consideration
        const knockbackForce = 35 + (damage * 0.5); // Stronger hits = more knockback
        const angle = Math.atan2(targetPlayer.y - player.y, targetPlayer.x - player.x);
        targetPlayer.x = Math.max(20, Math.min(GAME_WIDTH - 20, targetPlayer.x + Math.cos(angle) * knockbackForce));
        targetPlayer.y = Math.max(20, Math.min(GAME_HEIGHT - 20, targetPlayer.y + Math.sin(angle) * knockbackForce));
        this.updateCombo(player, 'attack');
        this.broadcastEvent({
            type: 'player-attacked',
            data: {
                attackerId: player.id,
                targetId: targetPlayer.id,
                damage,
                targetHealth: targetPlayer.health,
                knockback: { x: Math.cos(angle) * knockbackForce, y: Math.sin(angle) * knockbackForce },
                comboCount: player.comboCount,
            },
            timestamp: now,
        });
        if (targetPlayer.health <= 0) {
            this.handlePlayerKilled(player, targetPlayer);
        }
    }
    handleDefend(player, action) {
        if (player.energy < 15)
            return;
        player.energy -= 15;
        // Grant temporary shield
        const shieldPowerUp = {
            id: (0, uuid_1.v4)(),
            type: 'shield',
            x: player.x,
            y: player.y,
            duration: 3000,
            effect: 50,
            expiresAt: Date.now() + 3000,
            collected: true,
        };
        player.activePowerUps.push(shieldPowerUp);
    }
    handlePlayerKilled(attacker, victim) {
        attacker.kills++;
        attacker.killStreak++;
        victim.deaths++;
        victim.killStreak = 0;
        victim.isAlive = false;
        victim.health = 0;
        // Kill streak bonuses
        let killBonus = 100;
        if (attacker.killStreak >= 3) {
            killBonus += 50;
            this.broadcastEvent({
                type: 'achievement-unlocked',
                data: { playerId: attacker.id, achievement: `Kill Streak: ${attacker.killStreak}!` },
                timestamp: Date.now(),
            });
        }
        if (attacker.killStreak >= 5) {
            killBonus += 100;
            attacker.energy += 30; // Bonus energy for dominating
        }
        attacker.score += killBonus;
        // Transfer some influence from victim to attacker
        const influenceSteal = Math.floor(victim.influence * 0.2);
        attacker.influence += influenceSteal;
        victim.influence = Math.max(0, victim.influence - influenceSteal);
        this.broadcastEvent({
            type: 'player-killed',
            data: {
                killerId: attacker.id,
                killerName: attacker.name,
                victimId: victim.id,
                victimName: victim.name,
                killStreak: attacker.killStreak,
                influenceStolen: influenceSteal,
            },
            timestamp: Date.now(),
        });
        // Respawn after 3 seconds
        setTimeout(() => {
            this.respawnPlayer(victim);
        }, 3000);
    }
    respawnPlayer(player) {
        if (!this.players.has(player.id))
            return;
        const spawnPos = this.findSafeSpawnPosition();
        player.isAlive = true;
        player.health = player.maxHealth;
        player.x = spawnPos.x;
        player.y = spawnPos.y;
        player.targetX = spawnPos.x;
        player.targetY = spawnPos.y;
        player.activePowerUps = [];
        player.invincibleUntil = Date.now() + 2000; // 2 second invincibility
        player.comboCount = 0;
        this.broadcastEvent({
            type: 'player-respawned',
            data: { playerId: player.id, x: spawnPos.x, y: spawnPos.y },
            timestamp: Date.now(),
        });
    }
    handleCollectPowerUp(player, action) {
        const powerUpIndex = this.powerUps.findIndex(p => p.id === action.data.powerUpId && !p.collected);
        if (powerUpIndex === -1)
            return;
        const powerUp = this.powerUps[powerUpIndex];
        const distance = Math.sqrt((player.x - powerUp.x) ** 2 + (player.y - powerUp.y) ** 2);
        if (distance > 40)
            return;
        powerUp.collected = true;
        powerUp.expiresAt = Date.now() + powerUp.duration;
        player.activePowerUps.push(powerUp);
        this.applyPowerUpEffect(player, powerUp);
        this.powerUps.splice(powerUpIndex, 1);
        player.score += 20;
        this.broadcastEvent({
            type: 'powerup-collected',
            data: {
                playerId: player.id,
                powerUpType: powerUp.type,
                effect: powerUp.effect,
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
            case 'energy':
                player.energy += powerUp.effect;
                break;
        }
    }
    handleUseAbility(player, action) {
        const now = Date.now();
        if (now - player.lastAbilityUse < player.abilityCooldown)
            return;
        player.lastAbilityUse = now;
        switch (player.abilityType) {
            case 'dash':
                this.executeDash(player, action);
                break;
            case 'heal':
                this.executeHeal(player);
                break;
            case 'shield':
                this.executeShield(player);
                break;
            case 'scan':
                this.executeScan(player);
                break;
        }
    }
    executeDash(player, action) {
        const targetX = action.data.x ?? player.targetX;
        const targetY = action.data.y ?? player.targetY;
        const angle = Math.atan2(targetY - player.y, targetX - player.x);
        const dashDistance = 150;
        player.x = Math.max(20, Math.min(GAME_WIDTH - 20, player.x + Math.cos(angle) * dashDistance));
        player.y = Math.max(20, Math.min(GAME_HEIGHT - 20, player.y + Math.sin(angle) * dashDistance));
        player.targetX = player.x;
        player.targetY = player.y;
        player.invincibleUntil = Date.now() + 500; // Brief invincibility during dash
        this.broadcastEvent({
            type: 'ability-used',
            data: { playerId: player.id, ability: 'dash', x: player.x, y: player.y },
            timestamp: Date.now(),
        });
    }
    executeHeal(player) {
        const healAmount = 40;
        player.health = Math.min(player.maxHealth, player.health + healAmount);
        player.energy = Math.max(0, player.energy - 15);
        this.broadcastEvent({
            type: 'ability-used',
            data: { playerId: player.id, ability: 'heal', healAmount },
            timestamp: Date.now(),
        });
    }
    executeShield(player) {
        const shieldPowerUp = {
            id: (0, uuid_1.v4)(),
            type: 'shield',
            x: player.x,
            y: player.y,
            duration: 5000,
            effect: 75,
            expiresAt: Date.now() + 5000,
            collected: true,
        };
        player.activePowerUps.push(shieldPowerUp);
        this.broadcastEvent({
            type: 'ability-used',
            data: { playerId: player.id, ability: 'shield' },
            timestamp: Date.now(),
        });
    }
    executeScan(player) {
        // Reveal all player positions and nexus states
        const scanData = {
            players: Array.from(this.players.values()).map(p => ({
                id: p.id, x: p.x, y: p.y, health: p.health, energy: p.energy
            })),
            nexuses: this.nexuses.map(n => ({
                id: n.id, controlledBy: n.controlledBy, contestProgress: Object.fromEntries(n.contestProgress)
            })),
        };
        this.broadcastEvent({
            type: 'ability-used',
            data: { playerId: player.id, ability: 'scan', scanData },
            timestamp: Date.now(),
        });
    }
    startGame() {
        this.gamePhase = 'spawn';
        this.gameStartTime = Date.now();
        this.phaseStartTime = Date.now();
        this.matchNumber++;
        this.broadcastEvent({
            type: 'game-started',
            data: { gameStartTime: this.gameStartTime, matchNumber: this.matchNumber },
            timestamp: Date.now(),
        });
        // High-frequency game loop for physics
        this.gameLoop = setInterval(() => {
            this.updatePhysics();
        }, 1000 / TICK_RATE);
        // Lower-frequency broadcast loop
        this.broadcastLoop = setInterval(() => {
            this.updateGamePhase();
            this.updateNexuses();
            this.updatePowerUps();
            this.updatePlayerEffects();
            this.broadcastGameState();
        }, 1000 / BROADCAST_RATE);
        this.startPowerUpSpawning();
    }
    updatePhysics() {
        const dt = 1 / TICK_RATE;
        for (const player of this.players.values()) {
            if (!player.isAlive)
                continue;
            // Move towards target
            const dx = player.targetX - player.x;
            const dy = player.targetY - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 5) {
                const moveSpeed = player.speed * dt;
                const ratio = Math.min(moveSpeed / distance, 1);
                player.x += dx * ratio;
                player.y += dy * ratio;
            }
            // Check for power-up collection proximity
            this.powerUps.forEach(powerUp => {
                if (powerUp.collected)
                    return;
                const dist = Math.sqrt((player.x - powerUp.x) ** 2 + (player.y - powerUp.y) ** 2);
                if (dist < 30) {
                    // Auto-collect nearby power-ups
                    this.handleCollectPowerUp(player, {
                        type: 'collect-powerup',
                        data: { powerUpId: powerUp.id },
                        timestamp: Date.now()
                    });
                }
            });
            // Update nexus contest progress when near
            this.nexuses.forEach(nexus => {
                const dist = Math.sqrt((player.x - nexus.x) ** 2 + (player.y - nexus.y) ** 2);
                if (dist < 80) {
                    // Passive capture progress
                    const current = nexus.contestProgress.get(player.id) || 0;
                    nexus.contestProgress.set(player.id, Math.min(100, current + 0.3 * nexus.captureRate));
                    this.updateNexusControl(nexus);
                }
            });
        }
    }
    updateGamePhase() {
        const elapsed = Date.now() - this.phaseStartTime;
        switch (this.gamePhase) {
            case 'spawn':
                if (elapsed > 10000) {
                    this.gamePhase = 'expansion';
                    this.phaseStartTime = Date.now();
                    this.broadcastPhaseChange('expansion');
                }
                break;
            case 'expansion':
                if (elapsed > 35000) {
                    this.gamePhase = 'conflict';
                    this.phaseStartTime = Date.now();
                    this.broadcastPhaseChange('conflict');
                }
                break;
            case 'conflict':
                if (elapsed > 30000) {
                    this.gamePhase = 'pulse';
                    this.phaseStartTime = Date.now();
                    this.triggerEnergyPulse();
                    this.broadcastPhaseChange('pulse');
                }
                break;
            case 'pulse':
                if (elapsed > 15000) {
                    this.endGame('time-up');
                }
                break;
        }
    }
    broadcastPhaseChange(phase) {
        this.broadcastEvent({
            type: 'phase-changed',
            data: { phase },
            timestamp: Date.now(),
        });
    }
    updateNexuses() {
        const now = Date.now();
        this.nexuses.forEach(nexus => {
            // Regenerate energy
            if (now - nexus.lastPulse > 5000) {
                nexus.energy = Math.min(100, nexus.energy + 15);
                nexus.lastPulse = now;
                if (nexus.controlledBy) {
                    const player = this.players.get(nexus.controlledBy);
                    if (player) {
                        const energyGain = nexus.chargeLevel * 8;
                        player.energy += energyGain;
                        player.score += nexus.chargeLevel;
                    }
                }
            }
            // Decay contest progress for players not nearby
            nexus.contestProgress.forEach((progress, playerId) => {
                const player = this.players.get(playerId);
                if (player) {
                    const dist = Math.sqrt((player.x - nexus.x) ** 2 + (player.y - nexus.y) ** 2);
                    if (dist > 100) {
                        nexus.contestProgress.set(playerId, Math.max(0, progress - 0.5));
                    }
                }
            });
        });
    }
    triggerEnergyPulse() {
        this.nexuses.forEach(nexus => {
            if (nexus.controlledBy) {
                const player = this.players.get(nexus.controlledBy);
                if (player) {
                    const pulseEnergy = nexus.chargeLevel * 40;
                    const pulseInfluence = nexus.chargeLevel * 15;
                    player.energy += pulseEnergy;
                    player.influence += pulseInfluence;
                    player.score += nexus.chargeLevel * 25;
                }
            }
        });
        this.broadcastEvent({
            type: 'energy-pulse',
            data: { nexuses: this.nexuses.map(n => ({ id: n.id, controlledBy: n.controlledBy, chargeLevel: n.chargeLevel })) },
            timestamp: Date.now(),
        });
    }
    endGame(reason) {
        this.gamePhase = 'ended';
        // Calculate final scores
        let maxScore = 0;
        let winnerId = null;
        for (const [playerId, player] of this.players) {
            // Final score calculation with multipliers
            const finalScore = player.score + (player.influence * 2) + (player.kills * 30) - (player.deaths * 10);
            player.score = Math.max(0, finalScore);
            if (player.score > maxScore) {
                maxScore = player.score;
                winnerId = playerId;
            }
        }
        this.winner = winnerId;
        this.broadcastEvent({
            type: 'game-ended',
            data: {
                winner: winnerId ? this.players.get(winnerId) : null,
                reason,
                finalScores: Array.from(this.players.values())
                    .sort((a, b) => b.score - a.score)
                    .map(p => ({
                    id: p.id,
                    name: p.name,
                    score: p.score,
                    influence: p.influence,
                    energy: p.energy,
                    kills: p.kills,
                    deaths: p.deaths,
                    damageDealt: p.damageDealt,
                    nexusesCaptured: p.nexusesCaptured,
                })),
                matchDuration: Date.now() - this.gameStartTime,
            },
            timestamp: Date.now(),
        });
        this.stopGameLoops();
    }
    stopGameLoops() {
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
        if (this.broadcastLoop) {
            clearInterval(this.broadcastLoop);
            this.broadcastLoop = null;
        }
        if (this.powerUpSpawnTimer) {
            clearInterval(this.powerUpSpawnTimer);
            this.powerUpSpawnTimer = null;
        }
    }
    startPowerUpSpawning() {
        this.powerUpSpawnTimer = setInterval(() => {
            this.spawnPowerUp();
        }, 8000 + Math.random() * 7000);
    }
    spawnPowerUp() {
        if (this.powerUps.length >= 8)
            return; // Increased max power-ups
        // Weighted power-up spawning for better balance
        const powerUpWeights = [
            { type: 'speed', weight: 20 },
            { type: 'shield', weight: 25 },
            { type: 'damage', weight: 20 },
            { type: 'health', weight: 30 }, // Health more common
            { type: 'energy', weight: 25 },
        ];
        const totalWeight = powerUpWeights.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;
        let type = 'health';
        for (const item of powerUpWeights) {
            random -= item.weight;
            if (random <= 0) {
                type = item.type;
                break;
            }
        }
        // Spawn away from players
        let bestX = Math.random() * (GAME_WIDTH - 100) + 50;
        let bestY = Math.random() * (GAME_HEIGHT - 100) + 50;
        let maxDist = 0;
        for (let i = 0; i < 10; i++) {
            const testX = Math.random() * (GAME_WIDTH - 100) + 50;
            const testY = Math.random() * (GAME_HEIGHT - 100) + 50;
            let minDist = Infinity;
            for (const player of this.players.values()) {
                const dist = Math.sqrt((testX - player.x) ** 2 + (testY - player.y) ** 2);
                minDist = Math.min(minDist, dist);
            }
            if (minDist > maxDist) {
                maxDist = minDist;
                bestX = testX;
                bestY = testY;
            }
        }
        const powerUp = {
            id: (0, uuid_1.v4)(),
            type,
            x: bestX,
            y: bestY,
            duration: this.getPowerUpDuration(type),
            effect: this.getPowerUpEffect(type),
            expiresAt: 0,
            collected: false,
        };
        this.powerUps.push(powerUp);
        this.broadcastEvent({
            type: 'powerup-spawned',
            data: { powerUp },
            timestamp: Date.now(),
        });
    }
    getPowerUpDuration(type) {
        switch (type) {
            case 'speed': return 12000;
            case 'shield': return 8000;
            case 'damage': return 15000;
            case 'health': return 0;
            case 'energy': return 0;
            default: return 5000;
        }
    }
    getPowerUpEffect(type) {
        switch (type) {
            case 'speed': return 90; // Increased from 80
            case 'shield': return 60; // Increased from 50
            case 'damage': return 25; // Increased from 20
            case 'health': return 70; // Increased from 60
            case 'energy': return 50; // Increased from 40
            default: return 10;
        }
    }
    updatePowerUps() {
        const now = Date.now();
        // Remove stale power-ups after 45 seconds
        this.powerUps = this.powerUps.filter(powerUp => !powerUp.collected);
    }
    updatePlayerEffects() {
        const now = Date.now();
        for (const player of this.players.values()) {
            const expiredPowerUps = player.activePowerUps.filter(p => p.expiresAt > 0 && now > p.expiresAt);
            for (const powerUp of expiredPowerUps) {
                this.removePowerUpEffect(player, powerUp);
            }
            player.activePowerUps = player.activePowerUps.filter(p => p.expiresAt === 0 || now <= p.expiresAt);
        }
    }
    removePowerUpEffect(player, powerUp) {
        switch (powerUp.type) {
            case 'speed':
                player.speed = Math.max(150, player.speed - powerUp.effect);
                break;
            case 'damage':
                player.attackPower = Math.max(25, player.attackPower - powerUp.effect);
                break;
        }
    }
    broadcastEvent(event) {
        this.io.to(this.roomId).emit('game-event', event);
    }
    broadcastGameState() {
        this.io.to(this.roomId).emit('game-state-update', this.getSerializableGameState());
    }
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
            matchNumber: this.matchNumber,
        };
    }
    getSerializableGameState() {
        return {
            players: Object.fromEntries(this.players),
            nexuses: this.nexuses.map(n => ({
                ...n,
                contestProgress: Object.fromEntries(n.contestProgress),
            })),
            powerUps: this.powerUps,
            gamePhase: this.gamePhase,
            phaseStartTime: this.phaseStartTime,
            gameStartTime: this.gameStartTime,
            winner: this.winner,
            leaderboard: this.generateLeaderboard(),
            matchNumber: this.matchNumber,
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
            killStreak: player.killStreak,
            damageDealt: player.damageDealt,
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
    // Allow restarting a game
    restartGame() {
        if (this.gamePhase !== 'ended')
            return;
        // Reset all player stats
        for (const player of this.players.values()) {
            player.x = 400;
            player.y = 300;
            player.targetX = 400;
            player.targetY = 300;
            player.energy = 0;
            player.influence = 0;
            player.health = player.maxHealth;
            player.isAlive = true;
            player.kills = 0;
            player.deaths = 0;
            player.score = 0;
            player.damageDealt = 0;
            player.nexusesCaptured = 0;
            player.comboCount = 0;
            player.killStreak = 0;
            player.activePowerUps = [];
        }
        // Reset nexuses
        this.initializeNexuses();
        this.powerUps = [];
        this.winner = null;
        this.gamePhase = 'waiting';
        if (this.players.size >= 2) {
            this.startGame();
        }
    }
}
exports.GameRoom = GameRoom;
//# sourceMappingURL=GameRoom.js.map