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
    const socket = existingSocket || io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001')
    socketRef.current = socket

    if (!existingSocket) {
      socket.on('connect', () => {
        const playerName = localStorage.getItem('playerName') || 'Player'
        socket.emit('join-room', { roomId, playerName })
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
        <div className="hud" style={{ 
          background: 'rgba(0, 0, 0, 0.8)',
          borderRadius: '12px',
          padding: '15px',
          minWidth: '180px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <div style={{ 
              width: '30px', 
              height: '30px', 
              backgroundColor: currentPlayer.color,
              borderRadius: '50%',
              border: '2px solid white'
            }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px' }}>{currentPlayer.name}</h3>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>{ability.icon} {ability.name}</span>
            </div>
          </div>
          
          {/* Health Bar */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
              <span>❤️ Health</span>
              <span>{currentPlayer.health}/{currentPlayer.maxHealth}</span>
            </div>
            <div style={{ background: '#333', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
              <div style={{ 
                background: currentPlayer.health > 50 ? '#27ae60' : currentPlayer.health > 25 ? '#f39c12' : '#e74c3c',
                height: '100%',
                width: `${(currentPlayer.health / currentPlayer.maxHealth) * 100}%`,
                transition: 'width 0.3s'
              }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
            <div>⚡ {currentPlayer.energy}</div>
            <div>🎯 {currentPlayer.influence}</div>
            <div>💀 {currentPlayer.kills}</div>
            <div>☠️ {currentPlayer.deaths}</div>
          </div>
          
          <div style={{ marginTop: '10px', fontSize: '16px', fontWeight: 'bold' }}>
            Score: {currentPlayer.score}
          </div>

          {currentPlayer.killStreak >= 3 && (
            <div style={{ 
              marginTop: '8px', 
              background: 'rgba(231, 76, 60, 0.3)', 
              padding: '5px 10px', 
              borderRadius: '4px',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              🔥 {currentPlayer.killStreak} Kill Streak!
            </div>
          )}
        </div>

        {/* Phase Indicator */}
        <div className="phase-indicator" style={{
          background: 'rgba(0, 0, 0, 0.8)',
          borderRadius: '12px',
          padding: '15px 25px',
          textAlign: 'center',
          borderBottom: `3px solid ${phaseInfo.color}`
        }}>
          <h3 style={{ margin: 0, color: phaseInfo.color }}>{phaseInfo.text}</h3>
          <div style={{ opacity: 0.8, fontSize: '14px' }}>{phaseInfo.desc}</div>
          {timeRemaining > 0 && (
            <div style={{ 
              fontSize: '28px', 
              fontWeight: 'bold', 
              marginTop: '5px',
              fontFamily: 'monospace'
            }}>
              {formatTime(timeRemaining)}
            </div>
          )}
        </div>

        {/* Mini Player List */}
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.8)',
          borderRadius: '8px',
          padding: '10px',
          maxWidth: '150px'
        }}>
          <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '5px' }}>
            Players ({Object.keys(gameState.players).length})
          </div>
          {Object.values(gameState.players)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((player, idx) => (
            <div key={player.id} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              fontSize: '12px',
              padding: '3px 0',
              opacity: player.isAlive ? 1 : 0.5
            }}>
              <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : ''}</span>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                backgroundColor: player.color,
                borderRadius: '50%'
              }} />
              <span style={{ 
                flex: 1, 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                fontWeight: player.id === currentPlayer.id ? 'bold' : 'normal'
              }}>
                {player.name}
              </span>
              <span style={{ opacity: 0.7 }}>{player.score}</span>
            </div>
          ))}
        </div>

        {/* Controls Help */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '12px',
          borderRadius: '8px',
          fontSize: '11px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 15px' }}>
            <div><kbd>WASD</kbd> Move</div>
            <div><kbd>E</kbd> Harvest</div>
            <div><kbd>Space</kbd> Beacon</div>
            <div><kbd>Q</kbd> Boost</div>
            <div><kbd>Click</kbd> Attack</div>
            <div><kbd>R</kbd> {ability.icon} Ability</div>
          </div>
          {abilityCooldown > 0 && (
            <div style={{ marginTop: '8px', opacity: 0.7 }}>
              Ability: {Math.ceil(abilityCooldown / 1000)}s
            </div>
          )}
        </div>
      </div>

      {/* Game Over Modal */}
      {gameOverData && (
        <div className="game-over-modal" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
            padding: '30px 40px',
            borderRadius: '16px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            border: '2px solid #3498db'
          }}>
            <h2 style={{ textAlign: 'center', marginBottom: '5px' }}>🎮 Game Over!</h2>
            <p style={{ textAlign: 'center', opacity: 0.7, marginBottom: '20px' }}>
              Duration: {formatDuration(gameOverData.matchDuration)}
            </p>
            
            {gameOverData.winner ? (
              <div style={{ textAlign: 'center', marginBottom: '25px' }}>
                <div style={{
                  fontSize: '48px',
                  marginBottom: '10px'
                }}>🏆</div>
                <h3 style={{ 
                  color: gameOverData.winner.id === currentPlayer.id ? '#f1c40f' : '#fff',
                  fontSize: '24px',
                  margin: 0
                }}>
                  {gameOverData.winner.name} Wins!
                </h3>
                {gameOverData.winner.id === currentPlayer.id && (
                  <p style={{ color: '#27ae60', marginTop: '5px' }}>🎉 Congratulations!</p>
                )}
              </div>
            ) : (
              <h3 style={{ textAlign: 'center' }}>Draw!</h3>
            )}

            <div style={{ marginBottom: '20px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px 8px 0 0',
                fontSize: '12px',
                fontWeight: 'bold',
                opacity: 0.7
              }}>
                <span style={{ width: '30px' }}>#</span>
                <span style={{ flex: 1 }}>Player</span>
                <span style={{ width: '60px', textAlign: 'right' }}>Score</span>
                <span style={{ width: '50px', textAlign: 'right' }}>K/D</span>
              </div>
              {gameOverData.finalScores.map((score, index) => (
                <div key={score.id} style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: score.id === currentPlayer.id ? 'rgba(52, 152, 219, 0.2)' : 'rgba(255,255,255,0.05)',
                  borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <span style={{ width: '30px', fontSize: '16px' }}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                  </span>
                  <span style={{ flex: 1, fontWeight: score.id === currentPlayer.id ? 'bold' : 'normal' }}>
                    {score.name}
                  </span>
                  <span style={{ width: '60px', textAlign: 'right', fontWeight: 'bold' }}>{score.score}</span>
                  <span style={{ width: '50px', textAlign: 'right', opacity: 0.7 }}>
                    {score.kills}/{score.deaths}
                  </span>
                </div>
              ))}
            </div>

            {/* Detailed Stats Toggle */}
            <button 
              onClick={() => setShowStats(!showStats)}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: '#3498db', 
                cursor: 'pointer',
                marginBottom: '15px',
                width: '100%'
              }}
            >
              {showStats ? '▼ Hide Details' : '▶ Show Detailed Stats'}
            </button>

            {showStats && (
              <div style={{ 
                background: 'rgba(0,0,0,0.3)', 
                padding: '15px', 
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '13px'
              }}>
                {gameOverData.finalScores.slice(0, 5).map(score => (
                  <div key={score.id} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{score.name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px', opacity: 0.8 }}>
                      <div>🎯 Influence: {score.influence}</div>
                      <div>⚔️ Damage: {score.damageDealt}</div>
                      <div>🏰 Nexuses: {score.nexusesCaptured}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn"
                onClick={handlePlayAgain}
                style={{ flex: 1, background: 'linear-gradient(135deg, #27ae60, #2ecc71)' }}
              >
                🔄 Play Again
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={handleReturnToLobby}
                style={{ flex: 1 }}
              >
                🏠 Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Game
