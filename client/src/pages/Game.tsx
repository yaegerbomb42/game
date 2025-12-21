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
  energy: number
  influence: number
  color: string
  isAlive: boolean
}

interface GameState {
  players: Map<string, Player>
  nexuses: any[]
  gamePhase: string
  phaseStartTime: number
  gameStartTime: number
  winner: string | null
}

interface GameOverData {
  winner: Player | null
  reason: string
  finalScores: Array<{
    id: string
    name: string
    influence: number
    energy: number
  }>
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

  useEffect(() => {
    if (!roomId) {
      navigate('/')
      return
    }

    // Use existing socket from navigation state or create new one
    const existingSocket = location.state?.socket
    const socket = existingSocket || io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001')
    socketRef.current = socket

    if (!existingSocket) {
      socket.on('connect', () => {
        console.log('Connected to game server')
        // Try to rejoin the room (in case of reconnection)
        const playerName = localStorage.getItem('playerName') || 'Player'
        socket.emit('join-room', { roomId, playerName })
      })
    } else {
      console.log('Using existing socket connection for game')
    }

    socket.on('joined-room', (data) => {
      console.log('Rejoined room:', data)
      setGameState(data.gameState)
      setCurrentPlayer(data.player)
    })

    socket.on('game-state-update', (newGameState: GameState) => {
      setGameState(newGameState)
    })

    socket.on('game-event', (event) => {
      console.log('Game event:', event)
      
      if (event.type === 'game-ended') {
        setGameOverData(event.data)
      }
    })

    socket.on('room-full', () => {
      alert('Room is full!')
      navigate('/')
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from game server')
    })

    return () => {
      // Only close socket if we created it (not passed from lobby)
      if (!existingSocket) {
        socket.close()
      }
    }
  }, [roomId, navigate])

  useEffect(() => {
    if (gameState && currentPlayer && !gameRef.current) {
      // Initialize Phaser game
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        parent: 'game-container',
        backgroundColor: '#2c3e50',
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
      
      // Pass socket and game data to the scene
      gameRef.current.events.once('ready', () => {
        const scene = gameRef.current?.scene.getScene('GameScene') as GameScene
        if (scene) {
          scene.initializeGame(socketRef.current!, currentPlayer, gameState)
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

  // Update time remaining
  useEffect(() => {
    if (!gameState || gameState.gamePhase === 'waiting' || gameState.gamePhase === 'ended') {
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - gameState.phaseStartTime
      
      let phaseDuration = 0
      switch (gameState.gamePhase) {
        case 'spawn': phaseDuration = 10000; break
        case 'expansion': phaseDuration = 35000; break
        case 'conflict': phaseDuration = 30000; break
        case 'pulse': phaseDuration = 15000; break
      }
      
      const remaining = Math.max(0, phaseDuration - elapsed)
      setTimeRemaining(remaining)
    }, 100)

    return () => clearInterval(interval)
  }, [gameState])

  const handleReturnToLobby = () => {
    navigate('/')
  }

  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000)
    return `${seconds}s`
  }

  const getPhaseDescription = (phase: string) => {
    switch (phase) {
      case 'spawn': return 'Spawn Phase - Scout the battlefield!'
      case 'expansion': return 'Expansion Phase - Claim nexuses!'
      case 'conflict': return 'Conflict Phase - Battle for control!'
      case 'pulse': return 'Pulse Phase - Final energy burst!'
      case 'ended': return 'Game Over'
      default: return 'Waiting for players...'
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

  return (
    <div className="game-container">
      <div id="game-container" className="game-canvas"></div>
      
      <div className="ui-overlay">
        {/* HUD */}
        <div className="hud">
          <h3>{currentPlayer.name}</h3>
          <div>⚡ Energy: {currentPlayer.energy}</div>
          <div>🎯 Influence: {currentPlayer.influence}</div>
          <div style={{ 
            width: '20px', 
            height: '20px', 
            backgroundColor: currentPlayer.color,
            borderRadius: '50%',
            display: 'inline-block',
            marginRight: '8px',
            border: '2px solid white'
          }}></div>
        </div>

        {/* Phase Indicator */}
        <div className="phase-indicator">
          <h3>{getPhaseDescription(gameState.gamePhase)}</h3>
          {timeRemaining > 0 && (
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {formatTime(timeRemaining)}
            </div>
          )}
        </div>

        {/* Player List */}
        <div className="player-list">
          <h4>Players ({Object.values(gameState.players).length})</h4>
          {Object.values(gameState.players)
            .sort((a, b) => b.influence - a.influence)
            .map((player) => (
            <div key={player.id} className="player-item">
              <div 
                className="player-color" 
                style={{ backgroundColor: player.color }}
              ></div>
              <div style={{ flex: 1 }}>
                <div>{player.name}</div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                  ⚡{player.energy} 🎯{player.influence}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Controls Help */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '15px',
          borderRadius: '8px',
          fontSize: '12px',
          maxWidth: '200px'
        }}>
          <h4>Controls</h4>
          <div>WASD - Move</div>
          <div>E - Harvest nexus</div>
          <div>Space - Deploy beacon</div>
          <div>Q - Boost nexus</div>
          <div>Click - Attack/Move</div>
        </div>
      </div>

      {/* Game Over Modal */}
      {gameOverData && (
        <div className="game-over-modal">
          <div className="modal-content">
            <h2>🎮 Game Over!</h2>
            
            {gameOverData.winner ? (
              <div>
                <h3 className="winner">
                  🏆 {gameOverData.winner.name} Wins!
                </h3>
                <p>Victory by {gameOverData.reason}</p>
              </div>
            ) : (
              <h3>Draw!</h3>
            )}

            <div className="score-list">
              <h4>Final Scores</h4>
              {gameOverData.finalScores
                .sort((a, b) => b.influence - a.influence)
                .map((score, index) => (
                <div key={score.id} className="score-item">
                  <span>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                    {' '}{score.name}
                  </span>
                  <span>🎯 {score.influence}</span>
                </div>
              ))}
            </div>

            <button className="btn" onClick={handleReturnToLobby}>
              🏠 Return to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Game
