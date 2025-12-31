import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'

interface Player {
  id: string
  name: string
  color: string
  abilityType: string
}

interface RoomState {
  roomId: string
  players: Player[]
  gamePhase: string
}

interface AvailableRoom {
  roomId: string
  playerCount: number
  maxPlayers: number
}

const ABILITY_INFO: Record<string, { icon: string; name: string; description: string }> = {
  dash: { icon: '⚡', name: 'Dash', description: 'Quick dash in any direction' },
  heal: { icon: '💚', name: 'Heal', description: 'Restore health instantly' },
  shield: { icon: '🛡️', name: 'Shield', description: 'Temporary damage reduction' },
  scan: { icon: '👁️', name: 'Scan', description: 'Reveal all players and nexuses' },
}

const Lobby = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '')
  const [roomId, setRoomId] = useState('')
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [showTutorial, setShowTutorial] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001')
    setSocket(newSocket)

    newSocket.on('connect', () => {
      console.log('Connected to server')
      fetchAvailableRooms()
    })

    newSocket.on('joined-room', (data) => {
      setRoomState({
        roomId: data.roomId,
        players: Object.values(data.gameState.players),
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
        // Handled by game-state-update
      } else if (event.type === 'game-started') {
        if (roomState && socket) {
          navigate(`/game/${roomState.roomId}`, { 
            state: { socket: socket, playerName: localStorage.getItem('playerName') } 
          })
        }
      }
    })

    newSocket.on('game-state-update', (gameState) => {
      if (roomState) {
        const wasWaiting = roomState.gamePhase === 'waiting'
        const isNowStarted = gameState.gamePhase !== 'waiting'
        
        setRoomState({
          ...roomState,
          players: Object.values(gameState.players),
          gamePhase: gameState.gamePhase
        })
        
        if (wasWaiting && isNowStarted && socket) {
          navigate(`/game/${roomState.roomId}`, { 
            state: { socket: socket, playerName: localStorage.getItem('playerName') } 
          })
        }
      }
    })

    newSocket.on('quick-match-found', (data) => {
      setIsConnecting(false)
      if (data.roomId) {
        newSocket.emit('join-room', { 
          roomId: data.roomId, 
          playerName: localStorage.getItem('playerName') 
        })
      }
    })

    newSocket.on('disconnect', () => {
      setRoomState(null)
      setIsConnecting(false)
    })

    newSocket.on('connect_error', () => {
      setError('Failed to connect to server')
      setIsConnecting(false)
    })

    // Fetch available rooms periodically
    const interval = setInterval(fetchAvailableRooms, 5000)

    return () => {
      newSocket.close()
      clearInterval(interval)
    }
  }, [navigate])

  const fetchAvailableRooms = async () => {
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
      const response = await fetch(`${serverUrl}/rooms`)
      const data = await response.json()
      setAvailableRooms(data.rooms || [])
    } catch (e) {
      // Ignore fetch errors
    }
  }

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    setIsConnecting(true)
    setError('')
    localStorage.setItem('playerName', playerName.trim())
    socket?.emit('join-room', { playerName: playerName.trim() })
  }

  const handleJoinRoom = (targetRoomId?: string) => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    const joinRoomId = targetRoomId || roomId.trim().toUpperCase()
    if (!joinRoomId) {
      setError('Please enter a room ID')
      return
    }

    setIsConnecting(true)
    setError('')
    localStorage.setItem('playerName', playerName.trim())
    socket?.emit('join-room', { 
      roomId: joinRoomId, 
      playerName: playerName.trim() 
    })
  }

  const handleQuickMatch = () => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    setIsConnecting(true)
    setError('')
    localStorage.setItem('playerName', playerName.trim())
    
    // Check for available rooms first
    if (availableRooms.length > 0) {
      const bestRoom = availableRooms.find(r => r.playerCount < 6) || availableRooms[0]
      socket?.emit('join-room', { 
        roomId: bestRoom.roomId, 
        playerName: playerName.trim() 
      })
    } else {
      // Create new room
      socket?.emit('join-room', { playerName: playerName.trim() })
    }
  }

  const handleLeaveRoom = () => {
    socket?.disconnect()
    socket?.connect()
    setRoomState(null)
  }

  const copyRoomId = () => {
    if (roomState) {
      navigator.clipboard.writeText(roomState.roomId)
    }
  }

  if (roomState) {
    return (
      <div className="lobby-container">
        <div className="lobby-card" style={{ maxWidth: '500px' }}>
          <h1>🎮 Nexus Wars</h1>
          
          <div className="room-info">
            <h2>Room: {roomState.roomId}</h2>
            <button className="btn btn-secondary" onClick={copyRoomId} style={{ marginBottom: '10px' }}>
              📋 Copy Room ID
            </button>
            <p style={{ opacity: 0.7 }}>Share this code with friends!</p>
          </div>

          <div className="room-info">
            <h3>Players ({roomState.players.length}/10)</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              {roomState.players.map((player) => {
                const ability = ABILITY_INFO[player.abilityType] || ABILITY_INFO.dash
                return (
                  <div key={player.id} className="player-item" style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px',
                    background: 'rgba(255,255,255,0.1)',
                    padding: '8px 12px',
                    borderRadius: '8px'
                  }}>
                    <div 
                      className="player-color" 
                      style={{ backgroundColor: player.color, width: '24px', height: '24px', borderRadius: '50%' }}
                    />
                    <span style={{ flex: 1 }}>{player.name}</span>
                    <span title={ability.description} style={{ cursor: 'help' }}>
                      {ability.icon} {ability.name}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="room-info" style={{ 
            background: roomState.players.length >= 2 ? 'rgba(39, 174, 96, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            padding: '15px',
            borderRadius: '8px',
            border: roomState.players.length >= 2 ? '2px solid #27ae60' : '2px solid transparent'
          }}>
            <h3 style={{ margin: 0 }}>
              {roomState.gamePhase === 'waiting' 
                ? roomState.players.length >= 2 
                  ? '✅ Ready to start!'
                  : '⏳ Waiting for players...'
                : '🎮 Game in progress'
              }
            </h3>
            {roomState.players.length < 2 && (
              <p style={{ margin: '10px 0 0', opacity: 0.7 }}>Need at least 2 players</p>
            )}
          </div>

          <button className="btn" onClick={handleLeaveRoom} style={{ marginTop: '10px' }}>
            🚪 Leave Room
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="lobby-container">
      <div className="lobby-card" style={{ maxWidth: '600px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '5px' }}>🎮 Nexus Wars</h1>
        <p style={{ opacity: 0.8, marginBottom: '20px' }}>Fast-paced 2D multiplayer strategy</p>

        {error && (
          <div style={{ 
            background: 'rgba(231, 76, 60, 0.2)', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '15px',
            border: '1px solid rgba(231, 76, 60, 0.5)'
          }}>
            ⚠️ {error}
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
            maxLength={15}
            disabled={isConnecting}
            style={{ fontSize: '16px', padding: '12px' }}
          />
        </div>

        {/* Quick Match - Primary CTA */}
        <button 
          className="btn" 
          onClick={handleQuickMatch}
          disabled={isConnecting || !playerName.trim()}
          style={{ 
            fontSize: '18px', 
            padding: '15px 30px',
            background: 'linear-gradient(135deg, #27ae60, #2ecc71)',
            marginBottom: '10px'
          }}
        >
          {isConnecting ? '🔄 Finding match...' : '⚡ Quick Match'}
        </button>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={handleCreateRoom}
            disabled={isConnecting || !playerName.trim()}
            style={{ flex: 1 }}
          >
            {isConnecting ? '🔄...' : '🆕 Create Room'}
          </button>
        </div>

        {/* Available Rooms */}
        {availableRooms.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px' }}>🌐 Active Games</h4>
            <div style={{ display: 'grid', gap: '8px' }}>
              {availableRooms.slice(0, 3).map(room => (
                <div key={room.roomId} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.1)',
                  padding: '10px 15px',
                  borderRadius: '8px'
                }}>
                  <span>Room {room.roomId}</span>
                  <span style={{ opacity: 0.7 }}>{room.playerCount}/{room.maxPlayers}</span>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleJoinRoom(room.roomId)}
                    disabled={isConnecting}
                    style={{ padding: '5px 15px', fontSize: '14px' }}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', margin: '15px 0', opacity: 0.5 }}>
          <hr style={{ flex: 1, border: '1px solid rgba(255,255,255,0.3)' }} />
          <span style={{ padding: '0 15px' }}>OR JOIN BY CODE</span>
          <hr style={{ flex: 1, border: '1px solid rgba(255,255,255,0.3)' }} />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={6}
            disabled={isConnecting}
            style={{ flex: 1, fontSize: '16px', padding: '12px', textAlign: 'center', letterSpacing: '2px' }}
          />
          <button 
            className="btn btn-secondary" 
            onClick={() => handleJoinRoom()}
            disabled={isConnecting || !playerName.trim() || !roomId.trim()}
          >
            Join
          </button>
        </div>

        {/* Tutorial Toggle */}
        <button 
          onClick={() => setShowTutorial(!showTutorial)}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: '#3498db', 
            cursor: 'pointer',
            marginTop: '20px',
            fontSize: '14px'
          }}
        >
          {showTutorial ? '▼ Hide Tutorial' : '▶ How to Play'}
        </button>

        {showTutorial && (
          <div style={{ 
            textAlign: 'left', 
            marginTop: '15px', 
            padding: '20px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '12px',
            fontSize: '14px'
          }}>
            <h4 style={{ marginBottom: '15px' }}>🎯 Objective</h4>
            <p style={{ marginBottom: '15px', opacity: 0.9 }}>
              Control energy nexuses to gain influence and score. The player with the highest score when time runs out wins!
            </p>
            
            <h4 style={{ marginBottom: '10px' }}>⌨️ Controls</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '15px' }}>
              <div><kbd>WASD</kbd> Move</div>
              <div><kbd>Click</kbd> Move/Attack</div>
              <div><kbd>E</kbd> Harvest nexus</div>
              <div><kbd>Q</kbd> Boost nexus</div>
              <div><kbd>Space</kbd> Deploy beacon</div>
              <div><kbd>R</kbd> Use ability</div>
              <div><kbd>F</kbd> Attack nearest</div>
            </div>

            <h4 style={{ marginBottom: '10px' }}>⚔️ Special Abilities</h4>
            <div style={{ display: 'grid', gap: '6px' }}>
              {Object.entries(ABILITY_INFO).map(([key, info]) => (
                <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span>{info.icon}</span>
                  <span style={{ fontWeight: 'bold' }}>{info.name}:</span>
                  <span style={{ opacity: 0.8 }}>{info.description}</span>
                </div>
              ))}
            </div>

            <h4 style={{ marginTop: '15px', marginBottom: '10px' }}>💡 Tips</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', opacity: 0.9 }}>
              <li>Stay near nexuses to passively capture them</li>
              <li>Combo attacks for bonus damage and score</li>
              <li>Collect power-ups for temporary boosts</li>
              <li>Kill streaks give bonus energy!</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default Lobby
