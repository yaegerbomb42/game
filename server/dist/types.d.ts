export interface Player {
    id: string;
    userId: string;
    name: string;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    velocityX: number;
    velocityY: number;
    energy: number;
    influence: number;
    color: string;
    isAlive: boolean;
    isConnected: boolean;
    lastAction: number;
    health: number;
    maxHealth: number;
    attackPower: number;
    attackRange: number;
    lastAttack: number;
    attackCooldown: number;
    comboCount: number;
    lastComboTime: number;
    killStreak: number;
    kills: number;
    deaths: number;
    score: number;
    damageDealt: number;
    nexusesCaptured: number;
    activePowerUps: PowerUp[];
    speed: number;
    lastMovement: number;
    invincibleUntil: number;
    abilityType: 'dash' | 'heal' | 'shield' | 'scan';
    abilityCooldown: number;
    lastAbilityUse: number;
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
    contestProgress: Map<string, number>;
    isContested: boolean;
    captureRate: number;
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
        killStreak: number;
        damageDealt: number;
    }>;
    matchNumber: number;
}
export interface MatchResult {
    winnerId: string;
    winnerName: string;
    duration: number;
    playerStats: Array<{
        playerId: string;
        playerName: string;
        score: number;
        kills: number;
        deaths: number;
        damageDealt: number;
        nexusesCaptured: number;
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
<<<<<<< HEAD
    type: 'player-joined' | 'player-left' | 'nexus-captured' | 'energy-pulse' | 'game-started' | 'game-ended' | 'player-attacked' | 'player-killed' | 'powerup-spawned' | 'powerup-collected' | 'achievement-unlocked' | 'beacon-deployed' | 'attack-blocked' | 'player-respawned' | 'ability-used' | 'phase-changed' | 'critical-hit';
=======
    type: 'player-joined' | 'player-left' | 'player-reconnected' | 'nexus-captured' | 'energy-pulse' | 'game-started' | 'game-ended' | 'player-attacked' | 'player-killed' | 'powerup-spawned' | 'powerup-collected' | 'achievement-unlocked' | 'beacon-deployed' | 'attack-blocked' | 'player-respawned' | 'ability-used' | 'phase-changed';
>>>>>>> main
    data: any;
    timestamp: number;
}
//# sourceMappingURL=types.d.ts.map