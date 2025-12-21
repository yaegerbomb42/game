export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  energy: number;
  influence: number;
  color: string;
  isAlive: boolean;
  lastAction: number;
  // Combat properties
  health: number;
  maxHealth: number;
  attackPower: number;
  attackRange: number;
  lastAttack: number;
  attackCooldown: number;
  // Stats
  kills: number;
  deaths: number;
  score: number;
  // Power-ups
  activePowerUps: PowerUp[];
  // Movement
  speed: number;
  lastMovement: number;
}

export interface PowerUp {
  id: string;
  type: 'speed' | 'shield' | 'damage' | 'health' | 'energy';
  x: number;
  y: number;
  duration: number;
  effect: number;
  expiresAt: number;
  collected: boolean;
}

export interface Nexus {
  id: string;
  x: number;
  y: number;
  energy: number;
  controlledBy: string | null;
  lastPulse: number;
  chargeLevel: number;
}

export interface GameState {
  players: Map<string, Player>;
  nexuses: Nexus[];
  powerUps: PowerUp[];
  gamePhase: 'waiting' | 'spawn' | 'expansion' | 'conflict' | 'pulse' | 'ended';
  phaseStartTime: number;
  gameStartTime: number;
  winner: string | null;
  leaderboard: Array<{
    playerId: string;
    playerName: string;
    score: number;
    kills: number;
    deaths: number;
  }>;
}

export interface PlayerAction {
  type: 'move' | 'harvest' | 'deploy-beacon' | 'boost-nexus' | 'attack' | 'defend' | 'collect-powerup' | 'use-ability';
  data: {
    x?: number;
    y?: number;
    targetId?: string;
    nexusId?: string;
    powerUpId?: string;
    abilityType?: string;
  };
  timestamp: number;
}

export interface GameEvent {
  type: 'player-joined' | 'player-left' | 'nexus-captured' | 'energy-pulse' | 'game-started' | 'game-ended' | 
        'player-attacked' | 'player-killed' | 'powerup-spawned' | 'powerup-collected' | 'achievement-unlocked';
  data: any;
  timestamp: number;
}
