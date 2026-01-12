import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { GameScene } from '../game/GameScene'
import * as Phaser from 'phaser'

interface Player {
  id: string
  name: string
  x: number
  y: number
  targetX: number
  targetY: number
  energy: number
  influence: number
  color: string
  isAlive: boolean
  health: number
  maxHealth: number
  attackPower: number
  attackRange: number
  kills: number
  deaths: number
  score: number
  damageDealt: number
  nexusesCaptured: number
  abilityType: string
  abilityCooldown: number
  lastAbilityUse: number
  killStreak: number
  comboCount: number
  invincibleUntil: number
  activePowerUps: unknown[]
  speed: number
}

interface GameState {
  players: Record<string, Player>
  nexuses: any[]
  gamePhase: string
  phaseStartTime: number
  gameStartTime: number
  winner: string | null
}

interface GameOverData {
  winner: Player | null
  reason: string
  matchDuration: number
  finalScores: Array<{
    id: string
    name: string
    score: number
    influence: number
    energy: number
    kills: number
    deaths: number
    damageDealt: number
    nexusesCaptured: number
  }>
}

const ABILITY_INFO: Record<string, { icon: string; name: string }> = {
  dash: { icon: '⚡', name: 'Dash' },
  heal: { icon: '💚', name: 'Heal' },
  shield: { icon: '🛡️', name: 'Shield' },
  scan: { icon: '👁️', name: 'Scan' },
}

const Game = () => {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const gameRef = useRef<Phaser.Game | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [gameOverData, setGameOverData] = useState<GameOverData | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    if (!roomId) {
      navigate('/')
      return
    }

    const existingSocket = location.state?.socket
    const socket = existingSocket || io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    if (!existingSocket) {
      socket.on('connect', () => {
        const playerName = localStorage.getItem('playerName') || 'Player'
        const userId = localStorage.getItem('userId')
        socket.emit('join-room', { roomId, playerName, userId })
      })
    } else {
      socket.emit('get-game-state')
    }

    socket.on('joined-room', (data: { gameState: GameState; player: Player; roomId: string }) => {
      setGameState(data.gameState)
      setCurrentPlayer(data.player)
    })

    socket.on('game-state-update', (newGameState: GameState) => {
      setGameState(newGameState)
      // Update current player from new state
      if (currentPlayer && newGameState.players[currentPlayer.id]) {
        setCurrentPlayer(newGameState.players[currentPlayer.id])
      }
    })

    socket.on('game-event', (event: { type: string; data: GameOverData }) => {
      if (event.type === 'game-ended') {
        setGameOverData(event.data)
      }
    })

    socket.on('room-full', () => {
      alert('Room is full!')
      navigate('/')
    })

    socket.on('connect_error', (err: unknown) => {
      console.error('Game connection error:', err)
      // Try to reconnect
      setTimeout(() => {
        socket.connect()
      }, 2000)
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from game server')
    })

    socket.on('reconnect', () => {
      console.log('Reconnected to game server')
      socket.emit('get-game-state')
    })

    return () => {
      if (!existingSocket) {
        socket.close()
      }
    }
  }, [roomId, navigate])

  useEffect(() => {
    if (gameState && currentPlayer && !gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        parent: 'game-container',
        backgroundColor: '#1a1a2e',
        scene: GameScene,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { y: 0, x: 0 },
            debug: false
          }
        }
      }

      gameRef.current = new Phaser.Game(config)

      gameRef.current.events.once('ready', () => {
        const scene = gameRef.current?.scene.getScene('GameScene') as GameScene
        if (scene && socketRef.current) {
          scene.initializeGame(socketRef.current, currentPlayer, gameState as any)
        }
      })
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [gameState, currentPlayer])

  useEffect(() => {
    if (!gameState || gameState.gamePhase === 'waiting' || gameState.gamePhase === 'ended') {
      return
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - gameState.phaseStartTime

      let phaseDuration = 0
      switch (gameState.gamePhase) {
        case 'spawn': phaseDuration = 10000; break
        case 'expansion': phaseDuration = 35000; break
        case 'conflict': phaseDuration = 30000; break
        case 'pulse': phaseDuration = 15000; break
      }

      setTimeRemaining(Math.max(0, phaseDuration - elapsed))
    }, 100)

    return () => clearInterval(interval)
  }, [gameState])

  const handleReturnToLobby = () => {
    navigate('/')
  }

  const handlePlayAgain = () => {
    socketRef.current?.emit('restart-game')
    setGameOverData(null)
  }

  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000)
    return `${seconds}s`
  }

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const getPhaseInfo = (phase: string) => {
    switch (phase) {
      case 'spawn': return { text: 'Spawn Phase', desc: 'Scout the battlefield!', color: '#3498db' }
      case 'expansion': return { text: 'Expansion Phase', desc: 'Claim nexuses!', color: '#27ae60' }
      case 'conflict': return { text: 'Conflict Phase', desc: 'Battle for control!', color: '#e74c3c' }
      case 'pulse': return { text: 'Pulse Phase', desc: 'Final energy burst!', color: '#f39c12' }
      case 'ended': return { text: 'Game Over', desc: '', color: '#9b59b6' }
      default: return { text: 'Waiting...', desc: 'for players', color: '#95a5a6' }
    }
  }

  if (!gameState || !currentPlayer) {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <h2>🔄 Connecting to game...</h2>
          <p>Room: {roomId}</p>
        </div>
      </div>
    )
  }

  const phaseInfo = getPhaseInfo(gameState.gamePhase)
  const ability = ABILITY_INFO[currentPlayer.abilityType] || ABILITY_INFO.dash
  const abilityCooldown = Math.max(0, (currentPlayer.lastAbilityUse + currentPlayer.abilityCooldown) - Date.now())

  return (
    <div className="game-container">
      <div id="game-container" className="game-canvas"></div>

      <div className="ui-overlay">
        {/* Player Stats HUD */}
        <div className="hud-panel hud-stats">
          <div className="flex-gap flex-item-center">
            <div
              className="player-list-item-content avatar-large"
              style={{ '--player-color': currentPlayer.color } as React.CSSProperties}
            />
            <div>
              <h3 className="hud-panel-title">{currentPlayer.name}</h3>
              <span className="text-small text-primary">{ability.icon} {ability.name}</span>
            </div>
          </div>

          {/* Health Bar */}
          <div className="mb-4">
            <div className="health-label">
              <span>Shield Integrity</span>
              <span>{Math.floor(currentPlayer.health)}/{currentPlayer.maxHealth}</span>
            </div>
            <div className="health-bar-container">
              <div
                className="health-bar-fill"
                style={{
                  '--health-percent': `${(currentPlayer.health / currentPlayer.maxHealth) * 100}%`,
                  '--health-color': currentPlayer.health > 50 ? 'var(--success)' : currentPlayer.health > 25 ? 'var(--warning)' : 'var(--danger)'
                } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-value">⚡ {Math.floor(currentPlayer.energy)}</div>
            <div className="stat-value">🎯 {Math.floor(currentPlayer.influence)}</div>
            <div className="stat-value">💀 {currentPlayer.kills}</div>
            <div className="stat-value">☠️ {currentPlayer.deaths}</div>
          </div>

          <div className="score-display">
            {Math.floor(currentPlayer.score)}
          </div>

          {currentPlayer.killStreak >= 3 && (
            <div className="kill-streak">
              🔥 {currentPlayer.killStreak} KILL STREAK
            </div>
          )}
        </div>

        {/* Phase Indicator */}
        <div className="phase-indicator" style={{ borderBottomColor: phaseInfo.color }}>
          <h3 className="phase-title" style={{ color: phaseInfo.color, textShadow: `0 0 10px ${phaseInfo.color}` }}>{phaseInfo.text}</h3>
          <div className="text-dim text-small phase-desc">{phaseInfo.desc}</div>
          {timeRemaining > 0 && (
            <div className={`phase-timer ${timeRemaining < 10000 ? 'timer-danger' : 'timer-normal'}`}>
              {formatTime(timeRemaining)}
            </div>
          )}
        </div>

        {/* Mini Player List */}
        <div className="hud-panel leaderboard border-bottom-none">
          <div className="text-small text-dim leaderboard-header">
            AGENTS ACTIVE ({Object.keys(gameState.players).length})
          </div>
          {Object.values(gameState.players)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((player, idx) => (
              <div key={player.id} className={`player-list-item ${!player.isAlive ? 'player-dead' : ''}`}>
                <span className="rank">{idx === 0 ? '1' : idx === 1 ? '2' : idx === 2 ? '3' : idx + 1}</span>
                <div
                  className="player-list-item-content player-avatar-small"
                  style={{ '--player-color': player.color } as React.CSSProperties}
                />
                <span className={`name ${player.id === currentPlayer.id ? 'text-highlight' : ''}`}>
                  {player.name}
                </span>
                <span className="score">{Math.floor(player.score)}</span>
              </div>
            ))}
        </div>

        {/* Controls Help */}
        <div className="hud-panel controls-hint">
          <div className="controls-grid">
            <div><kbd>WASD</kbd> MOVE</div>
            <div><kbd>E</kbd> HARVEST</div>
            <div><kbd>SPC</kbd> BEACON</div>
            <div><kbd>Q</kbd> BOOST</div>
            <div><kbd>L-CLK</kbd> FIRE</div>
            <div><kbd>R</kbd> {ability.icon} ABILITY</div>
          </div>
          {abilityCooldown > 0 && (
            <div className="ability-recharge">
              ABILITY RECHARGING: {Math.ceil(abilityCooldown / 1000)}s
            </div>
          )}
        </div>
      </div>

      {/* Game Over Modal */}
      {
        gameOverData && (
          <div className="game-over-modal">
            <div className="modal-content">
              <h2 className="lobby-title mission-complete-title">MISSION COMPLETE</h2>
              <p className="text-center text-dim mb-4">
                DURATION: {formatDuration(gameOverData.matchDuration)}
              </p>

              {gameOverData.winner ? (
                <div className="winner-section">
                  <div className="winner-avatar" style={{
                    backgroundColor: gameOverData.winner.color,
                    boxShadow: `0 0 30px ${gameOverData.winner.color}`
                  }}>
                    🏆
                  </div>
                  <h3 className={`winner-name status-text-bold ${gameOverData.winner.id === currentPlayer.id ? 'text-highlight' : ''}`} style={{ color: gameOverData.winner.id !== currentPlayer.id ? 'white' : undefined }}>
                    {gameOverData.winner.name} WINS
                  </h3>
                  {gameOverData.winner.id === currentPlayer.id && (
                    <p className="text-success victory-text">VICTORY ACHIEVED</p>
                  )}
                </div>
              ) : (
                <h3 className="stalemate-title">STALEMATE</h3>
              )}

              <div className="mb-4">
                <div className="flex-gap text-small text-dim scoreboard-header">
                  <span className="score-item-rank">#</span>
                  <span className="score-item-name">AGENT</span>
                  <span className="score-item-value">SCORE</span>
                  <span className="score-item-kd">K/D</span>
                </div>
                <div className="game-list scoreboard-list">
                  {gameOverData.finalScores.map((score, index) => (
                    <div key={score.id} className={`room-list-item ${score.id === currentPlayer.id ? 'score-item-active' : ''}`}>
                      <span className="score-item-rank">
                        {index + 1}
                      </span>
                      <span className={`score-item-name ${score.id === currentPlayer.id ? 'text-highlight' : ''}`}>
                        {score.name}
                      </span>
                      <span className="score-item-value">{Math.floor(score.score)}</span>
                      <span className="score-item-kd">
                        {score.kills}/{score.deaths}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Stats Toggle */}
              <button
                onClick={() => setShowStats(!showStats)}
                className="stats-toggle-btn"
              >
                {showStats ? '▼ HIDE BATTLE DATA' : '▶ ACCESS BATTLE DATA'}
              </button>

              {showStats && (
                <div className="detailed-stats-panel">
                  {gameOverData.finalScores.slice(0, 5).map(score => (
                    <div key={score.id} className="stat-row">
                      <div className={`stat-row-name ${score.id === currentPlayer.id ? 'text-highlight' : ''}`}>{score.name}</div>
                      <div className="stat-row-details">
                        <div>🎯 INF: {Math.floor(score.influence)}</div>
                        <div>⚔️ DMG: {Math.floor(score.damageDealt)}</div>
                        <div>🏰 CAP: {score.nexusesCaptured}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex-gap">
                <button
                  className="btn btn-primary action-buttons"
                  onClick={handlePlayAgain}
                >
                  REDEPLOY
                </button>
                <button
                  className="btn btn-secondary action-buttons"
                  onClick={handleReturnToLobby}
                >
                  RTB (LOBBY)
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  )
}

export default Game
