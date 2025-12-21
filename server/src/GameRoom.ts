import { EventEmitter } from 'events';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Player, Nexus, GameState, PlayerAction, GameEvent } from './types';

export class GameRoom extends EventEmitter {
  private roomId: string;
  private io: Server;
  private players = new Map<string, Player>();
  private sockets = new Map<string, Socket>();
  private nexuses: Nexus[] = [];
  private gamePhase: GameState['gamePhase'] = 'waiting';
  private phaseStartTime = Date.now();
  private gameStartTime = 0;
  private winner: string | null = null;
  private gameLoop: NodeJS.Timeout | null = null;

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
    const targetPlayer = this.players.get(action.data.targetId || '');
    if (!targetPlayer) return;

    const distance = Math.sqrt((player.x - targetPlayer.x) ** 2 + (player.y - targetPlayer.y) ** 2);
    if (distance > 60) return;

    // Transfer energy from target to attacker
    const stealAmount = Math.min(10, targetPlayer.energy);
    targetPlayer.energy -= stealAmount;
    player.energy += stealAmount * 0.7; // Attacker gets 70% of stolen energy
  }

  private handleDefend(player: Player, action: PlayerAction) {
    if (player.energy < 10) return;
    
    player.energy -= 10;
    // Defensive boost logic would go here
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
      this.broadcastGameState();
    }, 1000); // Update every second
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
      gamePhase: this.gamePhase,
      phaseStartTime: this.phaseStartTime,
      gameStartTime: this.gameStartTime,
      winner: this.winner,
    };
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
}
