import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'

interface Player {
  id: string
  name: string
  color: string
}

interface RoomState {
  roomId: string
  players: Player[]
  gamePhase: string
}

const Lobby = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001')
    setSocket(newSocket)

    newSocket.on('connect', () => {
      console.log('Connected to server')
    })

    newSocket.on('joined-room', (data) => {
      console.log('Joined room:', data)
      setRoomState({
        roomId: data.roomId,
        players: Array.from(data.gameState.players.values()),
        gamePhase: data.gameState.gamePhase
      })
      setIsConnecting(false)
    })

    newSocket.on('room-full', () => {
      setError('Room is full (max 10 players)')
      setIsConnecting(false)
    })

    newSocket.on('game-event', (event) => {
      if (event.type === 'player-joined' || event.type === 'player-left') {
        // Update player list
        // This would need to be handled by getting updated game state
      } else if (event.type === 'game-started') {
        // Navigate to game
        if (roomState) {
          navigate(`/game/${roomState.roomId}`)
        }
      }
    })

    newSocket.on('game-state-update', (gameState) => {
      if (roomState) {
        setRoomState({
          ...roomState,
          players: Array.from(gameState.players.values()),
          gamePhase: gameState.gamePhase
        })
      }
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
      setRoomState(null)
    })

    return () => {
      newSocket.close()
    }
  }, [navigate, roomState])

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    setIsConnecting(true)
    setError('')
    socket?.emit('join-room', { playerName: playerName.trim() })
  }

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    if (!roomId.trim()) {
      setError('Please enter a room ID')
      return
    }

    setIsConnecting(true)
    setError('')
    socket?.emit('join-room', { 
      roomId: roomId.trim().toUpperCase(), 
      playerName: playerName.trim() 
    })
  }

  const handleLeaveRoom = () => {
    socket?.disconnect()
    socket?.connect()
    setRoomState(null)
  }

  const copyRoomId = () => {
    if (roomState) {
      navigator.clipboard.writeText(roomState.roomId)
      // Could add a toast notification here
    }
  }

  if (roomState) {
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <h1>🎮 Nexus Wars</h1>
          
          <div className="room-info">
            <h2>Room: {roomState.roomId}</h2>
            <button className="btn btn-secondary" onClick={copyRoomId}>
              📋 Copy Room ID
            </button>
            <p>Share this room ID with friends to play together!</p>
          </div>

          <div className="room-info">
            <h3>Players ({roomState.players.length}/10)</h3>
            {roomState.players.map((player) => (
              <div key={player.id} className="player-item">
                <div 
                  className="player-color" 
                  style={{ backgroundColor: player.color }}
                ></div>
                <span>{player.name}</span>
              </div>
            ))}
          </div>

          <div className="room-info">
            <h3>Game Status</h3>
            <p>
              {roomState.gamePhase === 'waiting' 
                ? `Waiting for players... (${roomState.players.length >= 2 ? 'Ready to start!' : 'Need at least 2 players'})`
                : 'Game in progress'
              }
            </p>
          </div>

          <div>
            <button className="btn" onClick={handleLeaveRoom}>
              🚪 Leave Room
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1>🎮 Nexus Wars</h1>
        <p>Fast-paced 2D multiplayer strategy game</p>
        <p>Control energy nexuses, expand your territory, and dominate the battlefield!</p>

        {error && (
          <div style={{ 
            background: 'rgba(255, 0, 0, 0.2)', 
            padding: '10px', 
            borderRadius: '8px', 
            margin: '10px 0',
            border: '1px solid rgba(255, 0, 0, 0.5)'
          }}>
            {error}
          </div>
        )}

        <div className="input-group">
          <label htmlFor="playerName">Your Name</label>
          <input
            id="playerName"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your player name"
            maxLength={20}
            disabled={isConnecting}
          />
        </div>

        <div>
          <button 
            className="btn" 
            onClick={handleCreateRoom}
            disabled={isConnecting || !playerName.trim()}
          >
            {isConnecting ? '🔄 Creating...' : '🆕 Create New Game'}
          </button>
        </div>

        <div style={{ margin: '20px 0', opacity: 0.7 }}>
          <hr style={{ border: '1px solid rgba(255,255,255,0.3)' }} />
          <p>OR</p>
        </div>

        <div className="input-group">
          <label htmlFor="roomId">Room ID</label>
          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            placeholder="Enter room ID to join"
            maxLength={6}
            disabled={isConnecting}
          />
        </div>

        <div>
          <button 
            className="btn btn-secondary" 
            onClick={handleJoinRoom}
            disabled={isConnecting || !playerName.trim() || !roomId.trim()}
          >
            {isConnecting ? '🔄 Joining...' : '🚪 Join Game'}
          </button>
        </div>

        <div style={{ marginTop: '30px', fontSize: '14px', opacity: 0.8 }}>
          <p>🎯 <strong>How to Play:</strong></p>
          <ul style={{ textAlign: 'left', maxWidth: '400px' }}>
            <li>Move with WASD or mouse clicks</li>
            <li>Press E near nexuses to harvest energy</li>
            <li>Press Space to deploy influence beacons</li>
            <li>Control nexuses to gain influence and win!</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default Lobby
