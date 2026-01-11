import { useState, useEffect, useRef } from 'react'
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
  const [selectedAbility, setSelectedAbility] = useState('dash')
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [showTutorial, setShowTutorial] = useState(false)
  const navigate = useNavigate()
  const roomStateRef = useRef<RoomState | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    roomStateRef.current = roomState
  }, [roomState])

  useEffect(() => {
    socketRef.current = socket
  }, [socket])

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

      // Navigate immediately if game is already started
      if (data.gameState.gamePhase !== 'waiting') {
        navigate(`/game/${data.roomId}`, {
          state: { socket: newSocket, playerName: localStorage.getItem('playerName') },
        })
      }
    })

    newSocket.on('room-full', () => {
      setError('Room is full (max 10 players)')
      setIsConnecting(false)
    })

    newSocket.on('game-event', (event) => {
      if (event.type === 'player-joined' || event.type === 'player-left') {
        // Handled by game-state-update
      } else if (event.type === 'game-started') {
        const currentRoomState = roomStateRef.current
        const currentSocket = socketRef.current
        if (currentRoomState && currentSocket) {
          navigate(`/game/${currentRoomState.roomId}`, {
            state: { socket: currentSocket, playerName: localStorage.getItem('playerName') },
          })
        }
      }
    })

    newSocket.on('game-state-update', (gameState) => {
      const currentRoomState = roomStateRef.current
      if (currentRoomState) {
        const wasWaiting = currentRoomState.gamePhase === 'waiting'
        const isNowStarted = gameState.gamePhase !== 'waiting'

        const nextRoomState: RoomState = {
          ...currentRoomState,
          players: Object.values(gameState.players),
          gamePhase: gameState.gamePhase
        }
        setRoomState(nextRoomState)

        const currentSocket = socketRef.current
        if (wasWaiting && isNowStarted && currentSocket) {
          navigate(`/game/${nextRoomState.roomId}`, {
            state: { socket: currentSocket, playerName: localStorage.getItem('playerName') },
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

    newSocket.on('connect_error', (err: any) => {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
      const message =
        typeof err?.message === 'string' && err.message.length > 0 ? ` (${err.message})` : ''
      setError(`Failed to connect to server: ${serverUrl}${message}`)
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

  // Initialize userId if not present
  useEffect(() => {
    if (!localStorage.getItem('userId')) {
      localStorage.setItem('userId', crypto.randomUUID());
    }
  }, []);

  const getUserId = () => localStorage.getItem('userId');

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    setIsConnecting(true)
    setError('')
    localStorage.setItem('playerName', playerName.trim())
    socket?.emit('join-room', {
      playerName: playerName.trim(),
      abilityType: selectedAbility,
      userId: getUserId()
    })
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
      playerName: playerName.trim(),
      abilityType: selectedAbility,
      userId: getUserId()
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
        playerName: playerName.trim(),
        abilityType: selectedAbility,
        userId: getUserId()
      })
    } else {
      // Create new room
      socket?.emit('join-room', {
        playerName: playerName.trim(),
        abilityType: selectedAbility,
        userId: getUserId()
      })
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
        <div className="lobby-card">
          <h1 className="lobby-title">Nexus Wars</h1>

          <div className="mb-4">
            <h2 className="text-center text-primary">ROOM: {roomState.roomId}</h2>
            <div className="text-center">
              <button className="btn btn-secondary copy-btn" onClick={copyRoomId}>
                COPY ACCESS CODE
              </button>
              <p className="text-dim text-small mt-4">SHARE WITH SQUAD</p>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-small text-dim">AGENTS ({roomState.players.length}/10)</h3>
            <div className="game-list">
              {roomState.players.map((player) => {
                const ability = ABILITY_INFO[player.abilityType] || ABILITY_INFO.dash
                return (
                  <div key={player.id} className="room-list-item">
                    <div className="player-item-content">
                      <div
                        className="player-avatar"
                        style={{ backgroundColor: player.color, boxShadow: `0 0 10px ${player.color}` }}
                      />
                      <span className="player-name">{player.name}</span>
                      <span className="text-small text-primary">
                        {ability.icon} {ability.name}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className={`system-status ${roomState.players.length >= 2 ? 'status-ready' : 'status-waiting'}`}>
            <h3 className={`status-text ${roomState.players.length >= 2 ? 'text-success' : ''}`}>
              {roomState.gamePhase === 'waiting'
                ? roomState.players.length >= 2
                  ? 'SYSTEM READY'
                  : 'AWAITING AGENTS...'
                : 'CONFLICT IN PROGRESS'
              }
            </h3>
            {roomState.players.length < 2 && (
              <p className="text-dim text-small min-players-text">MINIMUM 2 AGENTS REQUIRED</p>
            )}
          </div>

          <div className="mb-4 text-center">
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (socketRef.current) {
                  socketRef.current.emit('add-bot', roomState.roomId);
                }
              }}
            >
              🤖 ADD TRAINING BOT
            </button>
          </div>

          <button className="btn btn-secondary" onClick={handleLeaveRoom}>
            ABORT MISSION
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1 className="lobby-title">NEXUS WARS</h1>
        <p className="text-dim game-title-subtitle">Tactical Multiplayer Strategy</p>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        <div className="input-group">
          <label className="input-label" htmlFor="playerName">AGENT IDENTITY</label>
          <input
            id="playerName"
            className="game-input"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="ENTER CODENAME"
            maxLength={15}
            disabled={isConnecting}
          />
        </div>

        <div className="mb-4">
          <label className="input-label">TACTICAL LOADOUT</label>
          <div className="ability-grid">
            {Object.entries(ABILITY_INFO).map(([type, info]) => (
              <div
                key={type}
                className={`ability-card ${selectedAbility === type ? 'selected' : ''}`}
                onClick={() => !isConnecting && setSelectedAbility(type)}
              >
                <div className="ability-icon">{info.icon}</div>
                <div className="ability-name">{info.name}</div>
              </div>
            ))}
          </div>
          <div className="ability-description">
            {ABILITY_INFO[selectedAbility].description}
          </div>
        </div>

        {/* Quick Match - Primary CTA */}
        <button
          className="btn btn-primary mb-4"
          onClick={handleQuickMatch}
          disabled={isConnecting || !playerName.trim()}
        >
          {isConnecting ? 'INITIALIZING LINK...' : '⚡ QUICK DEPLOY'}
        </button>

        <div className="flex-gap mb-4">
          <button
            className="btn btn-secondary"
            onClick={handleCreateRoom}
            disabled={isConnecting || !playerName.trim()}
          >
            CREATE PRIVATE SECTOR
          </button>
        </div>

        {/* Available Rooms */}
        {availableRooms.length > 0 && (
          <div className="mb-4">
            <h4 className="rooms-header text-dim text-small">ACTIVE SECTORS</h4>
            <div className="game-list">
              {availableRooms.slice(0, 3).map(room => (
                <div key={room.roomId} className="room-list-item">
                  <span className="room-id-text">SECTOR {room.roomId}</span>
                  <span className="text-dim text-small">{room.playerCount}/{room.maxPlayers}</span>
                  <button
                    className="btn btn-secondary join-btn"
                    onClick={() => handleJoinRoom(room.roomId)}
                    disabled={isConnecting}
                  >
                    INFILTRATE
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="divider-container">
          <hr className="divider-line" />
          <span className="divider-text">SECURE CHANNEL</span>
          <hr className="divider-line" />
        </div>

        <div className="flex-gap">
          <input
            className="game-input room-input"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            placeholder="ACCESS CODE"
            maxLength={6}
            disabled={isConnecting}
          />
          <button
            className="btn btn-secondary connect-btn"
            onClick={() => handleJoinRoom()}
            disabled={isConnecting || !playerName.trim() || !roomId.trim()}
          >
            CONNECT
          </button>
        </div>

        {/* Tutorial Toggle */}
        <button
          onClick={() => setShowTutorial(!showTutorial)}
          className="text-small mt-4 w-full tutorial-toggle"
        >
          {showTutorial ? '⛔ CLOSE DATABASE' : 'ℹ️ ACCESS TACTICAL DATA'}
        </button>

        {showTutorial && (
          <div className="tutorial-content">
            <h4 className="tutorial-section-title">MISSION OBJECTIVE</h4>
            <p className="text-dim mb-4">
              Capture Energy Nexuses to generate influence. Eliminate hostile agents to gain score. The agent with the highest score after the Final Pulse wins.
            </p>

            <h4 className="tutorial-section-title">CONTROLS</h4>
            <div className="tutorial-grid">
              <div><kbd>WASD</kbd> VECTOR</div>
              <div><kbd>L-CLICK</kbd> ATTACK/MOVE</div>
              <div><kbd>E</kbd> HARVEST</div>
              <div><kbd>Q</kbd> BOOST</div>
              <div><kbd>SPACE</kbd> BEACON</div>
              <div><kbd>R</kbd> ABILITY</div>
            </div>

            <h4 className="tutorial-section-title">TACTICS</h4>
            <ul className="text-dim tutorial-list">
              <li>Nexuses charge faster when connected to beacons.</li>
              <li>Combos generate 2x energy.</li>
              <li>Maintain kill streaks for ability cooldown reduction.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default Lobby
