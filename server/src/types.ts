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
  gamePhase: 'waiting' | 'spawn' | 'expansion' | 'conflict' | 'pulse' | 'ended';
  phaseStartTime: number;
  gameStartTime: number;
  winner: string | null;
}

export interface PlayerAction {
  type: 'move' | 'harvest' | 'deploy-beacon' | 'boost-nexus' | 'attack' | 'defend';
  data: {
    x?: number;
    y?: number;
    targetId?: string;
    nexusId?: string;
  };
  timestamp: number;
}

export interface GameEvent {
  type: 'player-joined' | 'player-left' | 'nexus-captured' | 'energy-pulse' | 'game-started' | 'game-ended';
  data: any;
  timestamp: number;
}
