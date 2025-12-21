import { EventEmitter } from 'events';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Player, Nexus, GameState, PlayerAction, GameEvent, PowerUp } from './types';

export class GameRoom extends EventEmitter {
  private roomId: string;
  private io: Server;
  private players = new Map<string, Player>();
  private sockets = new Map<string, Socket>();
  private nexuses: Nexus[] = [];
  private powerUps: PowerUp[] = [];
  private gamePhase: GameState['gamePhase'] = 'waiting';
  private phaseStartTime = Date.now();
  private gameStartTime = 0;
  private winner: string | null = null;
  private gameLoop: NodeJS.Timeout | null = null;
  private powerUpSpawnTimer: NodeJS.Timeout | null = null;

  constructor(roomId: string, io: Server) {
    super();
    this.roomId = roomId;
    this.io = io;
    this.initializeNexuses();
  }

  private initializeNexuses() {
    // Create 5 nexuses at strategic positions
    const positions = [
      { x: 200, y: 150 },
      { x: 600, y: 150 },
      { x: 400, y: 300 },
      { x: 200, y: 450 },
      { x: 600, y: 450 },
    ];

    this.nexuses = positions.map(pos => ({
      id: uuidv4(),
      x: pos.x,
      y: pos.y,
      energy: 100,
      controlledBy: null,
      lastPulse: Date.now(),
      chargeLevel: 1,
    }));
  }

  addPlayer(socket: Socket, player: Player) {
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

  removePlayer(playerId: string) {
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

  handlePlayerAction(playerId: string, action: PlayerAction) {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive) return;

    // Rate limiting - max 10 actions per second
    const now = Date.now();
    if (now - player.lastAction < 100) return;
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

  private handleMove(player: Player, action: PlayerAction) {
    if (action.data.x !== undefined && action.data.y !== undefined) {
      // Validate movement bounds
      player.x = Math.max(0, Math.min(800, action.data.x));
      player.y = Math.max(0, Math.min(600, action.data.y));
    }
  }

  private handleHarvest(player: Player, action: PlayerAction) {
    const nexus = this.nexuses.find(n => n.id === action.data.nexusId);
    if (!nexus) return;

    // Check if player is close enough to nexus
    const distance = Math.sqrt((player.x - nexus.x) ** 2 + (player.y - nexus.y) ** 2);
    if (distance > 50) return;

    // Harvest energy
    const harvestAmount = Math.min(10, nexus.energy);
    nexus.energy -= harvestAmount;
    player.energy += harvestAmount;

    // Gain influence over nexus
    if (nexus.controlledBy === player.id) {
      player.influence += 2;
    } else if (nexus.controlledBy === null) {
      nexus.controlledBy = player.id;
      player.influence += 5;
      
      this.broadcastEvent({
        type: 'nexus-captured',
        data: { nexusId: nexus.id, playerId: player.id, playerName: player.name },
        timestamp: Date.now(),
      });
    }
  }

  private handleDeployBeacon(player: Player, action: PlayerAction) {
    if (player.energy < 20) return;
    
    player.energy -= 20;
    player.influence += 3;
  }

  private handleBoostNexus(player: Player, action: PlayerAction) {
    const nexus = this.nexuses.find(n => n.id === action.data.nexusId);
    if (!nexus || nexus.controlledBy !== player.id || player.energy < 15) return;

    player.energy -= 15;
    nexus.chargeLevel = Math.min(3, nexus.chargeLevel + 1);
  }

  private handleAttack(player: Player, action: PlayerAction) {
    const now = Date.now();
    
    // Check attack cooldown
    if (now - player.lastAttack < player.attackCooldown) return;
    
    const targetPlayer = this.players.get(action.data.targetId || '');
    if (!targetPlayer || !targetPlayer.isAlive) return;

    // Check attack range
    const distance = Math.sqrt((player.x - targetPlayer.x) ** 2 + (player.y - targetPlayer.y) ** 2);
    if (distance > player.attackRange) return;

    // Apply damage
    const damage = player.attackPower;
    targetPlayer.health -= damage;
    player.lastAttack = now;

    // Broadcast attack event
    this.broadcastEvent({
      type: 'player-attacked',
      data: {
        attackerId: player.id,
        targetId: targetPlayer.id,
        damage,
        targetHealth: targetPlayer.health,
      },
      timestamp: now,
    });

    // Check if target is killed
    if (targetPlayer.health <= 0) {
      this.handlePlayerKilled(player, targetPlayer);
    }
  }

  private handleDefend(player: Player, action: PlayerAction) {
    if (player.energy < 10) return;
    
    player.energy -= 10;
    // Defensive boost logic would go here
  }

  private handlePlayerKilled(attacker: Player, victim: Player) {
    // Update stats
    attacker.kills++;
    attacker.score += 100; // Base kill score
    victim.deaths++;
    victim.isAlive = false;
    victim.health = 0;

    // Broadcast kill event
    this.broadcastEvent({
      type: 'player-killed',
      data: {
        killerId: attacker.id,
        killerName: attacker.name,
        victimId: victim.id,
        victimName: victim.name,
      },
      timestamp: Date.now(),
    });

    // Respawn victim after 3 seconds
    setTimeout(() => {
      this.respawnPlayer(victim);
    }, 3000);
  }

  private respawnPlayer(player: Player) {
    if (!this.players.has(player.id)) return; // Player left the game
    
    player.isAlive = true;
    player.health = player.maxHealth;
    player.x = Math.random() * 800;
    player.y = Math.random() * 600;
    player.activePowerUps = []; // Clear power-ups on respawn
    
    this.broadcastGameState();
  }

  private handleCollectPowerUp(player: Player, action: PlayerAction) {
    const powerUpId = action.data.powerUpId;
    const powerUpIndex = this.powerUps.findIndex(p => p.id === powerUpId && !p.collected);
    
    if (powerUpIndex === -1) return;
    
    const powerUp = this.powerUps[powerUpIndex];
    const distance = Math.sqrt((player.x - powerUp.x) ** 2 + (player.y - powerUp.y) ** 2);
    
    if (distance > 30) return; // Must be close to collect
    
    // Mark as collected and add to player
    powerUp.collected = true;
    powerUp.expiresAt = Date.now() + powerUp.duration;
    player.activePowerUps.push(powerUp);
    
    // Apply power-up effect
    this.applyPowerUpEffect(player, powerUp);
    
    // Remove from world
    this.powerUps.splice(powerUpIndex, 1);
    
    // Broadcast collection event
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

  private applyPowerUpEffect(player: Player, powerUp: PowerUp) {
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

  private handleUseAbility(player: Player, action: PlayerAction) {
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

  private startGame() {
    this.gamePhase = 'spawn';
    this.gameStartTime = Date.now();
    this.phaseStartTime = Date.now();

    this.broadcastEvent({
      type: 'game-started',
      data: { gameStartTime: this.gameStartTime },
      timestamp: Date.now(),
    });

    // Start game loop
    this.gameLoop = setInterval(() => {
      this.updateGamePhase();
      this.updateNexuses();
      this.updatePowerUps();
      this.updatePlayerEffects();
      this.broadcastGameState();
    }, 1000); // Update every second

    // Start power-up spawning
    this.startPowerUpSpawning();
  }

  private updateGamePhase() {
    const elapsed = Date.now() - this.phaseStartTime;

    switch (this.gamePhase) {
      case 'spawn':
        if (elapsed > 10000) { // 10 seconds
          this.gamePhase = 'expansion';
          this.phaseStartTime = Date.now();
        }
        break;
      case 'expansion':
        if (elapsed > 35000) { // 35 seconds
          this.gamePhase = 'conflict';
          this.phaseStartTime = Date.now();
        }
        break;
      case 'conflict':
        if (elapsed > 30000) { // 30 seconds
          this.gamePhase = 'pulse';
          this.phaseStartTime = Date.now();
          this.triggerEnergyPulse();
        }
        break;
      case 'pulse':
        if (elapsed > 15000) { // 15 seconds
          this.endGame('time-up');
        }
        break;
    }
  }

  private updateNexuses() {
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

  private triggerEnergyPulse() {
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

  private endGame(reason: string) {
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

  private startPowerUpSpawning() {
    // Spawn a power-up every 15-30 seconds
    this.powerUpSpawnTimer = setInterval(() => {
      this.spawnPowerUp();
    }, 15000 + Math.random() * 15000);
  }

  private spawnPowerUp() {
    // Don't spawn too many power-ups
    if (this.powerUps.length >= 5) return;

    const powerUpTypes: PowerUp['type'][] = ['speed', 'shield', 'damage', 'health', 'energy'];
    const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
    
    const powerUp: PowerUp = {
      id: uuidv4(),
      type,
      x: Math.random() * 800,
      y: Math.random() * 600,
      duration: this.getPowerUpDuration(type),
      effect: this.getPowerUpEffect(type),
      expiresAt: 0, // Set when collected
      collected: false,
    };

    this.powerUps.push(powerUp);

    this.broadcastEvent({
      type: 'powerup-spawned',
      data: { powerUp },
      timestamp: Date.now(),
    });
  }

  private getPowerUpDuration(type: PowerUp['type']): number {
    switch (type) {
      case 'speed': return 10000; // 10 seconds
      case 'shield': return 8000;  // 8 seconds
      case 'damage': return 12000; // 12 seconds
      case 'health': return 0;     // Instant
      case 'energy': return 0;     // Instant
      default: return 5000;
    }
  }

  private getPowerUpEffect(type: PowerUp['type']): number {
    switch (type) {
      case 'speed': return 50;   // +50 speed
      case 'shield': return 50;  // 50% damage reduction
      case 'damage': return 15;  // +15 attack power
      case 'health': return 50;  // +50 health
      case 'energy': return 30;  // +30 energy
      default: return 10;
    }
  }

  private updatePowerUps() {
    // Remove power-ups that have been in the world too long (60 seconds)
    const now = Date.now();
    this.powerUps = this.powerUps.filter(powerUp => {
      if (powerUp.collected) return false;
      // Remove if it's been in the world for more than 60 seconds
      return (now - (powerUp.expiresAt || 0)) < 60000;
    });
  }

  private updatePlayerEffects() {
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

  private removePowerUpEffect(player: Player, powerUp: PowerUp) {
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

  private broadcastEvent(event: GameEvent) {
    this.io.to(this.roomId).emit('game-event', event);
  }

  private broadcastGameState() {
    this.io.to(this.roomId).emit('game-state-update', this.getSerializableGameState());
  }

  // Public methods
  getGameState(): GameState {
    return {
      players: this.players,
      nexuses: this.nexuses,
      gamePhase: this.gamePhase,
      phaseStartTime: this.phaseStartTime,
      gameStartTime: this.gameStartTime,
      winner: this.winner,
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

  private generateLeaderboard() {
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

  getPlayerCount(): number {
    return this.players.size;
  }

  isFull(): boolean {
    return this.players.size >= 10;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  getRoomId(): string {
    return this.roomId;
  }
}
