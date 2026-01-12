<<<<<<< HEAD
import { useState, useEffect, useCallback, useRef } from 'react'
=======
import { useState, useEffect, useRef } from 'react'
>>>>>>> main
import { useNavigate } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'

interface Player {
  id: string
  name: string
  color: string
  abilityType: string
  isReady?: boolean
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
  gamePhase?: string
  canJoin?: boolean
}

const ABILITY_INFO: Record<string, { icon: string; name: string; description: string }> = {
  dash: { icon: '⚡', name: 'Dash', description: 'Quick dash in any direction' },
  heal: { icon: '💚', name: 'Heal', description: 'Restore health instantly' },
  shield: { icon: '🛡️', name: 'Shield', description: 'Temporary damage reduction' },
  scan: { icon: '👁️', name: 'Scan', description: 'Reveal all players and nexuses' },
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

const Lobby = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '')
  const [roomId, setRoomId] = useState('')
  const [selectedAbility, setSelectedAbility] = useState('dash')
  const [timer, setTimer] = useState<number | null>(null)
  const [isReady, setIsReady] = useState(false)

  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [error, setError] = useState('')
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [showTutorial, setShowTutorial] = useState(false)
  const [serverStats, setServerStats] = useState<{ rooms: number; totalPlayers: number } | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5
  const navigate = useNavigate()
  const roomStateRef = useRef<RoomState | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    roomStateRef.current = roomState
  }, [roomState])

  useEffect(() => {
    socketRef.current = socket
  }, [socket])

  const fetchServerStats = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/health`)
      const data = await response.json()
      setServerStats({ rooms: data.rooms, totalPlayers: data.totalPlayers || 0 })
    } catch (e) {
      // Ignore
    }
  }, [])

  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    setConnectionStatus('connecting')
    
    const newSocket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })
    setSocket(newSocket)

    newSocket.on('connect', () => {
<<<<<<< HEAD
      console.log('Connected to server')
      setConnectionStatus('connected')
      setError('')
      reconnectAttempts.current = 0
=======
>>>>>>> main
      fetchAvailableRooms()
      
      // Try to reconnect to previous room if exists
      const previousRoomId = sessionStorage.getItem('currentRoomId')
      const previousPlayerId = sessionStorage.getItem('currentPlayerId')
      if (previousRoomId && previousPlayerId) {
        newSocket.emit('reconnect-attempt', { playerId: previousPlayerId, roomId: previousRoomId })
      }
    })

    newSocket.on('reconnected', (data) => {
      console.log('Reconnected successfully!')
      setRoomState({
        roomId: data.gameState.roomId,
        players: Object.values(data.gameState.players),
        gamePhase: data.gameState.gamePhase
      })
      fetchServerStats()
    })

    newSocket.on('joined-room', (data) => {
      setRoomState({
        roomId: data.roomId,
        players: Object.values(data.gameState.players),
        gamePhase: data.gameState.gamePhase
      })
      setIsConnecting(false)
<<<<<<< HEAD
      
      // Store for reconnection
      sessionStorage.setItem('currentRoomId', data.roomId)
      sessionStorage.setItem('currentPlayerId', data.player.id)
=======

      // Navigate immediately if game is already started
      if (data.gameState.gamePhase !== 'waiting') {
        navigate(`/game/${data.roomId}`, {
          state: { socket: newSocket, playerName: localStorage.getItem('playerName') },
        })
      }
>>>>>>> main
    })

    newSocket.on('room-full', () => {
      setError('Room is full (max 10 players)')
      setIsConnecting(false)
    })

    // Timer events
    newSocket.on('game-event', (event) => {
      if (event.type === 'timer-started') {
        const endTime = event.data.startTime + event.data.duration;
        const updateTimer = () => {
          const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
          setTimer(remaining);
          if (remaining <= 0) {
            setTimer(null);
          }
        };
        updateTimer();
        // Set interval and declare as void/any if strict type checking complains about NodeJS.Timeout vs number
        const timerInterval = setInterval(updateTimer, 1000);

        // Store interval clean up if needed, but for now relying on component unmount or next event
        return () => clearInterval(timerInterval);
      } else if (event.type === 'timer-cancelled') {
        setTimer(null);
      } else if (event.type === 'player-ready') {
        setRoomState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            players: prev.players.map(p =>
              p.id === event.data.playerId ? { ...p, isReady: event.data.isReady } : p
            )
          };
        });

        // Update local ready state if it's us
        if (socketRef.current && event.data.playerId === socketRef.current.id) {
          setIsReady(event.data.isReady);
        }
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

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason)
      setConnectionStatus('disconnected')
      setRoomState(null)
      setIsConnecting(false)
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        newSocket.connect()
      }
    })

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err)
      reconnectAttempts.current++
      setConnectionStatus('disconnected')
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        setError(`Unable to connect to server. Please check your connection and try again.`)
      } else {
        setError(`Connecting to server... (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`)
      }
      setIsConnecting(false)
    })

<<<<<<< HEAD
    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts')
      setConnectionStatus('connected')
      setError('')
=======
    newSocket.on('connect_error', (err: any) => {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
      const message =
        typeof err?.message === 'string' && err.message.length > 0 ? ` (${err.message})` : ''
      setError(`Failed to connect to server: ${serverUrl}${message}`)
      setIsConnecting(false)
>>>>>>> main
    })

    // Fetch available rooms periodically
    const interval = setInterval(() => {
      fetchAvailableRooms()
      fetchServerStats()
    }, 5000)

    return () => {
      newSocket.close()
      clearInterval(interval)
    }
  }, [navigate, fetchServerStats])

  const fetchAvailableRooms = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/rooms`)
      const data = await response.json()
      setAvailableRooms(data.rooms || [])
    } catch (e) {
      // Ignore fetch errors
    }
  }, [])

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

  const handleQuickMatch = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name')
      return
    }

    if (!socket || !socket.connected) {
      setError('Not connected to server. Please wait...')
      return
    }

    setIsConnecting(true)
    setError('')
    localStorage.setItem('playerName', playerName.trim())
<<<<<<< HEAD
    
    try {
      // Use the quickjoin API endpoint for best room selection
      const response = await fetch(`${SERVER_URL}/quickjoin`)
      const data = await response.json()
      
      if (data.roomId) {
        socket?.emit('join-room', { 
          roomId: data.roomId, 
          playerName: playerName.trim() 
        })
      } else {
        // Fallback to socket-based quick match
        socket?.emit('quick-match', { playerName: playerName.trim() })
      }
    } catch (e) {
      // Fallback: check available rooms or create new
      if (availableRooms.length > 0) {
        const bestRoom = availableRooms.find(r => r.playerCount < 6 && r.canJoin !== false) || availableRooms[0]
        socket?.emit('join-room', { 
          roomId: bestRoom.roomId, 
          playerName: playerName.trim() 
        })
      } else {
        // Create new room
        socket?.emit('join-room', { playerName: playerName.trim() })
      }
=======

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

  const handleToggleReady = () => {
    if (roomState && socket) {
      socket.emit('toggle-ready', roomState.roomId);
>>>>>>> main
    }
  }

  const handleLeaveRoom = () => {
    socket?.disconnect()
    socket?.connect()
    setRoomState(null)
    setTimer(null)
    setIsReady(false)
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
                const isPlayerReady = player.isReady;
                return (
                  <div key={player.id} className="room-list-item">
                    <div className="player-item-content player-item-wrapper">
                      <div
                        className="player-avatar"
                        style={{ '--player-color': player.color } as React.CSSProperties}
                      />
                      <span className="player-name">{player.name}</span>
                      <span className={`text-small status-text-bold mr-10 ${isPlayerReady ? 'text-success' : 'text-dim'}`}>
                        {isPlayerReady ? 'READY' : 'WAITING'}
                      </span>
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
              {timer !== null
                ? `AUTO-START IN ${timer}s`
                : roomState.gamePhase === 'waiting'
                  ? roomState.players.length >= 2
                    ? 'WAITING FOR READY SIGNAL...'
                    : 'AWAITING AGENTS...'
                  : 'CONFLICT IN PROGRESS'
              }
            </h3>
            {roomState.players.length < 2 && (
              <p className="text-dim text-small min-players-text">MINIMUM 2 AGENTS REQUIRED</p>
            )}

            {roomState.players.length >= 2 && (
              <div className="mt-4">
                <button
                  className={`btn ${isReady ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={handleToggleReady}
                >
                  {isReady ? 'CANCEL READY' : 'READY TO DEPLOY'}
                </button>
              </div>
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
<<<<<<< HEAD
      <div className="lobby-card" style={{ maxWidth: '600px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '5px' }}>🎮 Nexus Wars</h1>
        <p style={{ opacity: 0.8, marginBottom: '10px' }}>Fast-paced 2D multiplayer strategy</p>
        
        {/* Connection Status */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '15px',
          fontSize: '13px'
        }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: connectionStatus === 'connected' ? '#27ae60' : 
                       connectionStatus === 'connecting' ? '#f39c12' : '#e74c3c',
            boxShadow: connectionStatus === 'connected' ? '0 0 10px #27ae60' : 'none'
          }} />
          <span style={{ opacity: 0.7 }}>
            {connectionStatus === 'connected' ? 'Connected' : 
             connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </span>
          {serverStats && connectionStatus === 'connected' && (
            <span style={{ opacity: 0.5, marginLeft: '10px' }}>
              • {serverStats.totalPlayers} players online • {serverStats.rooms} rooms
            </span>
          )}
        </div>

        {error && (
          <div style={{ 
            background: error.includes('Connecting') ? 'rgba(243, 156, 18, 0.2)' : 'rgba(231, 76, 60, 0.2)', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '15px',
            border: `1px solid ${error.includes('Connecting') ? 'rgba(243, 156, 18, 0.5)' : 'rgba(231, 76, 60, 0.5)'}`
          }}>
            {error.includes('Connecting') ? '🔄' : '⚠️'} {error}
=======
      <div className="lobby-card">
        <h1 className="lobby-title">NEXUS WARS</h1>
        <p className="text-dim game-title-subtitle">Tactical Multiplayer Strategy</p>

        {error && (
          <div className="error-message">
            ⚠️ {error}
>>>>>>> main
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
<<<<<<< HEAD
          disabled={isConnecting || !playerName.trim() || connectionStatus !== 'connected'}
          style={{ 
            fontSize: '18px', 
            padding: '15px 30px',
            background: connectionStatus === 'connected' 
              ? 'linear-gradient(135deg, #27ae60, #2ecc71)'
              : 'linear-gradient(135deg, #7f8c8d, #95a5a6)',
            marginBottom: '10px',
            width: '100%'
          }}
        >
          {isConnecting ? '🔄 Finding match...' : 
           connectionStatus !== 'connected' ? '⏳ Connecting...' : '⚡ Quick Match'}
=======
          disabled={isConnecting || !playerName.trim()}
        >
          {isConnecting ? 'INITIALIZING LINK...' : '⚡ QUICK DEPLOY'}
>>>>>>> main
        </button>

        <div className="flex-gap mb-4">
          <button
            className="btn btn-secondary"
            onClick={handleCreateRoom}
<<<<<<< HEAD
            disabled={isConnecting || !playerName.trim() || connectionStatus !== 'connected'}
            style={{ flex: 1 }}
=======
            disabled={isConnecting || !playerName.trim()}
>>>>>>> main
          >
            CREATE PRIVATE SECTOR
          </button>
        </div>

        {/* Available Rooms */}
        {availableRooms.length > 0 && (
<<<<<<< HEAD
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '10px' }}>🌐 Active Games</h4>
            <div style={{ display: 'grid', gap: '8px' }}>
              {availableRooms.slice(0, 5).map(room => {
                const phaseColors: Record<string, string> = {
                  waiting: '#27ae60',
                  spawn: '#3498db',
                  expansion: '#9b59b6',
                  conflict: '#e74c3c',
                  pulse: '#f39c12',
                }
                const phaseColor = phaseColors[room.gamePhase || 'waiting'] || '#95a5a6'
                
                return (
                  <div key={room.roomId} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.1)',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    borderLeft: `3px solid ${phaseColor}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 'bold' }}>{room.roomId}</span>
                      {room.gamePhase && (
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '2px 6px', 
                          background: `${phaseColor}33`,
                          borderRadius: '4px',
                          color: phaseColor
                        }}>
                          {room.gamePhase === 'waiting' ? '⏳ Waiting' : `🎮 ${room.gamePhase}`}
                        </span>
                      )}
                    </div>
                    <span style={{ opacity: 0.7, fontSize: '14px' }}>{room.playerCount}/{room.maxPlayers}</span>
                    <button 
                      className="btn btn-secondary"
                      onClick={() => handleJoinRoom(room.roomId)}
                      disabled={isConnecting || connectionStatus !== 'connected' || room.canJoin === false}
                      style={{ padding: '5px 15px', fontSize: '14px' }}
                    >
                      Join
                    </button>
                  </div>
                )
              })}
=======
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
>>>>>>> main
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
<<<<<<< HEAD
            disabled={isConnecting || connectionStatus !== 'connected'}
            style={{ flex: 1, fontSize: '16px', padding: '12px', textAlign: 'center', letterSpacing: '2px' }}
=======
            disabled={isConnecting}
>>>>>>> main
          />
          <button
            className="btn btn-secondary connect-btn"
            onClick={() => handleJoinRoom()}
            disabled={isConnecting || !playerName.trim() || !roomId.trim() || connectionStatus !== 'connected'}
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
