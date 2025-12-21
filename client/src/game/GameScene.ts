import * as Phaser from 'phaser'
import { Socket } from 'socket.io-client'

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

interface Nexus {
  id: string
  x: number
  y: number
  energy: number
  controlledBy: string | null
  chargeLevel: number
}

interface GameState {
  players: Map<string, Player>
  nexuses: Nexus[]
  gamePhase: string
}

export class GameScene extends Phaser.Scene {
  private socket!: Socket
  private currentPlayer!: Player
  private gameState!: GameState
  
  // Game objects
  private playerSprites = new Map<string, Phaser.GameObjects.Sprite>()
  private nexusSprites = new Map<string, Phaser.GameObjects.Container>()
  private influenceGraphics!: Phaser.GameObjects.Graphics
  private particleManager!: Phaser.GameObjects.Particles.ParticleEmitterManager
  
  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasdKeys!: any
  private actionKeys!: any
  
  // Movement
  private targetX = 0
  private targetY = 0
  private isMoving = false

  constructor() {
    super({ key: 'GameScene' })
  }

  preload() {
    // Create simple colored graphics programmatically instead of loading images
    this.load.image('pixel', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
  }

  create() {
    // Create graphics for influence visualization
    this.influenceGraphics = this.add.graphics()
    
    // Create particle manager for effects
    this.particleManager = this.add.particles(0, 0, 'pixel', {
      scale: { start: 0.5, end: 0 },
      speed: { min: 50, max: 100 },
      lifespan: 500,
      emitting: false
    })

    // Setup input
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasdKeys = this.input.keyboard!.addKeys('W,S,A,D')
    this.actionKeys = this.input.keyboard!.addKeys('E,Q,SPACE')

    // Mouse input for movement and attacks
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleMouseClick(pointer.x, pointer.y)
    })

    // Keyboard input
    this.input.keyboard!.on('keydown-E', () => this.handleHarvest())
    this.input.keyboard!.on('keydown-Q', () => this.handleBoostNexus())
    this.input.keyboard!.on('keydown-SPACE', () => this.handleDeployBeacon())
  }

  initializeGame(socket: Socket, player: Player, gameState: GameState) {
    this.socket = socket
    this.currentPlayer = player
    this.gameState = gameState

    // Listen for game state updates
    this.socket.on('game-state-update', (newGameState: GameState) => {
      this.updateGameState(newGameState)
    })

    this.socket.on('game-event', (event) => {
      this.handleGameEvent(event)
    })

    // Initial render
    this.renderGameState()
  }

  update() {
    this.handleMovement()
    this.updatePlayerPosition()
  }

  private handleMovement() {
    const speed = 200
    let velocityX = 0
    let velocityY = 0

    // WASD movement
    if (this.wasdKeys.A.isDown || this.cursors.left!.isDown) {
      velocityX = -speed
    } else if (this.wasdKeys.D.isDown || this.cursors.right!.isDown) {
      velocityX = speed
    }

    if (this.wasdKeys.W.isDown || this.cursors.up!.isDown) {
      velocityY = -speed
    } else if (this.wasdKeys.S.isDown || this.cursors.down!.isDown) {
      velocityY = speed
    }

    // Apply movement
    if (velocityX !== 0 || velocityY !== 0) {
      const newX = Phaser.Math.Clamp(this.currentPlayer.x + velocityX * (1/60), 0, 800)
      const newY = Phaser.Math.Clamp(this.currentPlayer.y + velocityY * (1/60), 0, 600)
      
      this.sendPlayerAction('move', { x: newX, y: newY })
    }
  }

  private handleMouseClick(x: number, y: number) {
    // Check if clicking on another player (for attack)
    const clickedPlayer = this.getPlayerAtPosition(x, y)
    if (clickedPlayer && clickedPlayer.id !== this.currentPlayer.id) {
      this.sendPlayerAction('attack', { targetId: clickedPlayer.id })
      this.createAttackEffect(this.currentPlayer.x, this.currentPlayer.y, x, y)
      return
    }

    // Otherwise, move to position
    this.targetX = x
    this.targetY = y
    this.isMoving = true
  }

  private handleHarvest() {
    const nearbyNexus = this.getNearbyNexus()
    if (nearbyNexus) {
      this.sendPlayerAction('harvest', { nexusId: nearbyNexus.id })
      this.createHarvestEffect(nearbyNexus.x, nearbyNexus.y)
    }
  }

  private handleBoostNexus() {
    const nearbyNexus = this.getNearbyNexus()
    if (nearbyNexus && nearbyNexus.controlledBy === this.currentPlayer.id) {
      this.sendPlayerAction('boost-nexus', { nexusId: nearbyNexus.id })
      this.createBoostEffect(nearbyNexus.x, nearbyNexus.y)
    }
  }

  private handleDeployBeacon() {
    this.sendPlayerAction('deploy-beacon', {})
    this.createBeaconEffect(this.currentPlayer.x, this.currentPlayer.y)
  }

  private updatePlayerPosition() {
    if (this.isMoving) {
      const distance = Phaser.Math.Distance.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        this.targetX, this.targetY
      )

      if (distance < 5) {
        this.isMoving = false
        return
      }

      const angle = Phaser.Math.Angle.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        this.targetX, this.targetY
      )

      const speed = 150
      const newX = this.currentPlayer.x + Math.cos(angle) * speed * (1/60)
      const newY = this.currentPlayer.y + Math.sin(angle) * speed * (1/60)

      this.sendPlayerAction('move', { x: newX, y: newY })
    }
  }

  private sendPlayerAction(type: string, data: any) {
    this.socket.emit('player-action', {
      type,
      data,
      timestamp: Date.now()
    })
  }

  private updateGameState(newGameState: GameState) {
    this.gameState = newGameState
    
    // Update current player data
    const updatedPlayer = Array.from(newGameState.players.values())
      .find(p => p.id === this.currentPlayer.id)
    if (updatedPlayer) {
      this.currentPlayer = updatedPlayer
    }

    this.renderGameState()
  }

  private renderGameState() {
    this.renderInfluenceMap()
    this.renderNexuses()
    this.renderPlayers()
  }

  private renderInfluenceMap() {
    this.influenceGraphics.clear()
    
    // Create a simple influence visualization
    const players = Array.from(this.gameState.players.values())
    players.forEach(player => {
      if (player.influence > 0) {
        const radius = Math.min(player.influence * 2, 100)
        this.influenceGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(player.color).color, 0.1)
        this.influenceGraphics.fillCircle(player.x, player.y, radius)
      }
    })
  }

  private renderNexuses() {
    this.gameState.nexuses.forEach(nexus => {
      let container = this.nexusSprites.get(nexus.id)
      
      if (!container) {
        container = this.add.container(nexus.x, nexus.y)
        
        // Nexus base
        const base = this.add.circle(0, 0, 25, 0x3498db)
        base.setStrokeStyle(3, 0x2980b9)
        
        // Energy indicator
        const energyBar = this.add.rectangle(-20, -35, 40, 6, 0x2c3e50)
        const energyFill = this.add.rectangle(-20, -35, 0, 6, 0x27ae60)
        
        // Charge level indicators
        const chargeDots: Phaser.GameObjects.Arc[] = []
        for (let i = 0; i < 3; i++) {
          const dot = this.add.circle(-10 + i * 10, 35, 3, 0x95a5a6)
          chargeDots.push(dot)
        }
        
        container.add([base, energyBar, energyFill, ...chargeDots])
        container.setData('energyFill', energyFill)
        container.setData('chargeDots', chargeDots)
        
        this.nexusSprites.set(nexus.id, container)
      }

      // Update energy bar
      const energyFill = container.getData('energyFill')
      energyFill.width = (nexus.energy / 100) * 40
      
      // Update charge level
      const chargeDots = container.getData('chargeDots')
      chargeDots.forEach((dot: Phaser.GameObjects.Arc, index: number) => {
        dot.fillColor = index < nexus.chargeLevel ? 0xf39c12 : 0x95a5a6
      })

      // Update control color
      const base = container.list[0] as Phaser.GameObjects.Arc
      if (nexus.controlledBy) {
        const controllingPlayer = Array.from(this.gameState.players.values())
          .find(p => p.id === nexus.controlledBy)
        if (controllingPlayer) {
          base.fillColor = Phaser.Display.Color.HexStringToColor(controllingPlayer.color).color
        }
      } else {
        base.fillColor = 0x3498db
      }
    })
  }

  private renderPlayers() {
    const players = Array.from(this.gameState.players.values())
    
    players.forEach(player => {
      let sprite = this.playerSprites.get(player.id)
      
      if (!sprite) {
        // Create player as a circle instead of sprite
        sprite = this.add.circle(player.x, player.y, 10, Phaser.Display.Color.HexStringToColor(player.color).color) as any
        sprite.setStrokeStyle(2, 0xffffff)
        
        // Add player name text
        const nameText = this.add.text(player.x, player.y - 25, player.name, {
          fontSize: '12px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2
        }).setOrigin(0.5)
        
        sprite.setData('nameText', nameText)
        this.playerSprites.set(player.id, sprite)
      }

      // Update position
      sprite.setPosition(player.x, player.y)
      const nameText = sprite.getData('nameText')
      nameText.setPosition(player.x, player.y - 25)

      // Highlight current player
      if (player.id === this.currentPlayer.id) {
        sprite.setScale(1.2)
        sprite.setAlpha(1)
      } else {
        sprite.setScale(1)
        sprite.setAlpha(0.8)
      }
    })

    // Remove sprites for disconnected players
    this.playerSprites.forEach((sprite, playerId) => {
      if (!players.find(p => p.id === playerId)) {
        const nameText = sprite.getData('nameText')
        nameText.destroy()
        sprite.destroy()
        this.playerSprites.delete(playerId)
      }
    })
  }

  private getNearbyNexus(): Nexus | null {
    return this.gameState.nexuses.find(nexus => {
      const distance = Phaser.Math.Distance.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        nexus.x, nexus.y
      )
      return distance < 50
    }) || null
  }

  private getPlayerAtPosition(x: number, y: number): Player | null {
    return Array.from(this.gameState.players.values()).find(player => {
      const distance = Phaser.Math.Distance.Between(player.x, player.y, x, y)
      return distance < 25
    }) || null
  }

  private handleGameEvent(event: any) {
    switch (event.type) {
      case 'nexus-captured':
        this.createCaptureEffect(event.data.nexusId)
        break
      case 'energy-pulse':
        this.createPulseEffect()
        break
    }
  }

  // Visual effects
  private createHarvestEffect(x: number, y: number) {
    this.particleManager.setPosition(x, y)
    this.particleManager.setTint(0x27ae60)
    this.particleManager.explode(10)
  }

  private createAttackEffect(fromX: number, fromY: number, toX: number, toY: number) {
    const line = this.add.line(0, 0, fromX, fromY, toX, toY, 0xff6b6b, 1)
    line.setLineWidth(3)
    
    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: 200,
      onComplete: () => line.destroy()
    })
  }

  private createBeaconEffect(x: number, y: number) {
    const beacon = this.add.circle(x, y, 5, 0xf39c12, 0.8)
    
    this.tweens.add({
      targets: beacon,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 1000,
      onComplete: () => beacon.destroy()
    })
  }

  private createBoostEffect(x: number, y: number) {
    this.particleManager.setPosition(x, y)
    this.particleManager.setTint(0xf39c12)
    this.particleManager.explode(15)
  }

  private createCaptureEffect(nexusId: string) {
    const nexus = this.gameState.nexuses.find(n => n.id === nexusId)
    if (nexus) {
      this.particleManager.setPosition(nexus.x, nexus.y)
      this.particleManager.setTint(0xffd700)
      this.particleManager.explode(20)
    }
  }

  private createPulseEffect() {
    this.gameState.nexuses.forEach(nexus => {
      if (nexus.controlledBy) {
        const pulse = this.add.circle(nexus.x, nexus.y, 30, 0xffd700, 0.6)
        
        this.tweens.add({
          targets: pulse,
          scaleX: 4,
          scaleY: 4,
          alpha: 0,
          duration: 2000,
          onComplete: () => pulse.destroy()
        })
      }
    })
  }
}
