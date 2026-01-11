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
  health: number
  maxHealth: number
  attackPower: number
  attackRange: number
  kills: number
  deaths: number
  score: number
  activePowerUps: any[]
  speed: number
}

interface Nexus {
  id: string
  x: number
  y: number
  energy: number
  controlledBy: string | null
  chargeLevel: number
}

interface PowerUp {
  id: string
  type: 'speed' | 'shield' | 'damage' | 'health' | 'energy'
  x: number
  y: number
  duration: number
  effect: number
  collected: boolean
}

interface GameState {
  players: Record<string, Player>
  nexuses: Nexus[]
  powerUps: PowerUp[]
  gamePhase: string
  leaderboard: Array<{
    playerId: string
    playerName: string
    score: number
    kills: number
    deaths: number
  }>
}

export class GameScene extends Phaser.Scene {
  // Constants
  private static readonly BOUNDARY_PADDING = 20
  private static readonly MAP_WIDTH = 780
  private static readonly MAP_HEIGHT = 580
  private static readonly INTERPOLATION_SPEED = 0.015
  private static readonly POWERUP_COLLECTION_RADIUS = 35
  private static readonly COLOR_CONTESTED = '#ff6b6b'
  private static readonly COLOR_SUCCESS = '#ffd700'
  
  private socket!: Socket
  private currentPlayer!: Player
  private gameState!: GameState
  
  // Game objects
  private playerSprites = new Map<string, Phaser.GameObjects.Arc>()
  private playerTargetPositions = new Map<string, {x: number, y: number}>()
  private playerHealthBars = new Map<string, Phaser.GameObjects.Container>()
  private nexusSprites = new Map<string, Phaser.GameObjects.Container>()
  private powerUpSprites = new Map<string, Phaser.GameObjects.Container>()
  private influenceGraphics!: Phaser.GameObjects.Graphics
  private particleEmitter!: Phaser.GameObjects.Particles.ParticleEmitter
  private leaderboardText!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private phaseText!: Phaser.GameObjects.Text
  
  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasdKeys!: Record<string, Phaser.Input.Keyboard.Key>
  
  // Movement
  private targetX = 0
  private targetY = 0
  private isMoving = false
  private lastMoveTime = 0
  private moveThrottle = 50 // Send moves every 50ms max

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
    
    // Create particle emitter for effects
    this.particleEmitter = this.add.particles(0, 0, 'pixel', {
      scale: { start: 4, end: 0 },
      speed: { min: 50, max: 150 },
      lifespan: 400,
      quantity: 1,
      emitting: false
    })

    // Setup input
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasdKeys = this.input.keyboard!.addKeys('W,S,A,D') as Record<string, Phaser.Input.Keyboard.Key>

    // Mouse input for movement and attacks
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleMouseClick(pointer.x, pointer.y)
    })

    // Keyboard input
    this.input.keyboard!.on('keydown-E', () => this.handleHarvest())
    this.input.keyboard!.on('keydown-Q', () => this.handleBoostNexus())
    this.input.keyboard!.on('keydown-SPACE', () => this.handleDeployBeacon())
    this.input.keyboard!.on('keydown-F', () => this.handleAttackNearestPlayer())

    // Create leaderboard UI
    this.leaderboardText = this.add.text(10, 10, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 10, y: 10 }
    }).setScrollFactor(0).setDepth(1000)
    
    // Create stats display
    this.statsText = this.add.text(10, 550, '', {
      fontSize: '12px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 8, y: 5 }
    }).setScrollFactor(0).setDepth(1000)
    
    // Phase indicator
    this.phaseText = this.add.text(400, 10, '', {
      fontSize: '16px',
      color: '#ffd700',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 15, y: 8 }
    }).setScrollFactor(0).setDepth(1000).setOrigin(0.5, 0)
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

  update(_time: number, delta: number) {
    this.handleMovement()
    this.updatePlayerPosition()
    this.interpolateOtherPlayers(delta)
    this.checkPowerUpProximity()
    this.updateStatsDisplay()
  }

  private handleMovement() {
    if (!this.currentPlayer?.isAlive) return
    
    const speed = this.currentPlayer.speed || 150
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

    // Apply movement with throttling
    if (velocityX !== 0 || velocityY !== 0) {
      const now = Date.now()
      if (now - this.lastMoveTime < this.moveThrottle) {
        // Ensure any existing movement (e.g. mouse-driven) is cancelled even when throttled
        this.isMoving = false
        return
      }
      this.lastMoveTime = now
      
      // Normalize diagonal movement
      if (velocityX !== 0 && velocityY !== 0) {
        const factor = 0.707 // 1/sqrt(2)
        velocityX *= factor
        velocityY *= factor
      }
      
      const dt = 1/60
      const newX = Phaser.Math.Clamp(this.currentPlayer.x + velocityX * dt, GameScene.BOUNDARY_PADDING, GameScene.MAP_WIDTH)
      const newY = Phaser.Math.Clamp(this.currentPlayer.y + velocityY * dt, GameScene.BOUNDARY_PADDING, GameScene.MAP_HEIGHT)
      
      // Optimistic update
      this.currentPlayer.x = newX
      this.currentPlayer.y = newY
      
      this.sendPlayerAction('move', { x: newX, y: newY })
      this.isMoving = false // Cancel mouse movement when using keys
    }
  }
  
  private interpolateOtherPlayers(delta: number) {
    const lerpFactor = Math.min(1, delta * GameScene.INTERPOLATION_SPEED) // Smooth interpolation
    
    this.playerSprites.forEach((sprite, playerId) => {
      if (playerId === this.currentPlayer?.id) return
      
      const targetPos = this.playerTargetPositions.get(playerId)
      if (!targetPos) return
      
      // Smooth interpolation to target position
      const newX = Phaser.Math.Linear(sprite.x, targetPos.x, lerpFactor)
      const newY = Phaser.Math.Linear(sprite.y, targetPos.y, lerpFactor)
      
      sprite.setPosition(newX, newY)
      
      // Update name text
      const nameText = sprite.getData('nameText')
      if (nameText) {
        nameText.setPosition(newX, newY - 25)
      }
    })
  }
  
  private checkPowerUpProximity() {
    if (!this.gameState?.powerUps || !this.currentPlayer?.isAlive) return
    
    for (const powerUp of this.gameState.powerUps) {
      if (powerUp.collected) continue
      
      const distance = Phaser.Math.Distance.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        powerUp.x, powerUp.y
      )
      
      if (distance < GameScene.POWERUP_COLLECTION_RADIUS) {
        this.sendPlayerAction('collect-powerup', { powerUpId: powerUp.id })
        break // Only collect one per frame
      }
    }
  }
  
  private updateStatsDisplay() {
    if (!this.currentPlayer) return
    
    this.statsText.setText(
      `K: ${this.currentPlayer.kills} | D: ${this.currentPlayer.deaths} | Score: ${this.currentPlayer.score}`
    )
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
    if (!this.isMoving || !this.currentPlayer?.isAlive) return
    
    const distance = Phaser.Math.Distance.Between(
      this.currentPlayer.x, this.currentPlayer.y,
      this.targetX, this.targetY
    )

    if (distance < 5) {
      this.isMoving = false
      return
    }

    const now = Date.now()
    if (now - this.lastMoveTime < this.moveThrottle) return
    this.lastMoveTime = now

    const angle = Phaser.Math.Angle.Between(
      this.currentPlayer.x, this.currentPlayer.y,
      this.targetX, this.targetY
    )

    const speed = this.currentPlayer.speed || 150
    const dt = 1/60
    const moveDistance = Math.min(speed * dt, distance)
    const newX = Phaser.Math.Clamp(this.currentPlayer.x + Math.cos(angle) * moveDistance, GameScene.BOUNDARY_PADDING, GameScene.MAP_WIDTH)
    const newY = Phaser.Math.Clamp(this.currentPlayer.y + Math.sin(angle) * moveDistance, GameScene.BOUNDARY_PADDING, GameScene.MAP_HEIGHT)

    // Optimistic update
    this.currentPlayer.x = newX
    this.currentPlayer.y = newY
    
    this.sendPlayerAction('move', { x: newX, y: newY })
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
    const updatedPlayer = Object.values(newGameState.players)
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
    this.renderHealthBars()
    this.renderPowerUps()
    this.renderLeaderboard()
  }

  private renderInfluenceMap() {
    this.influenceGraphics.clear()
    
    // Create a simple influence visualization
    const players = Object.values(this.gameState.players)
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
        const controllingPlayer = Object.values(this.gameState.players)
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
    const players = Object.values(this.gameState.players)
    
    players.forEach(player => {
      // Store target position for interpolation
      this.playerTargetPositions.set(player.id, { x: player.x, y: player.y })
      
      let sprite = this.playerSprites.get(player.id)
      
      if (!sprite) {
        // Create player as a circle
        sprite = this.add.circle(player.x, player.y, 12, Phaser.Display.Color.HexStringToColor(player.color).color)
        sprite.setStrokeStyle(3, 0xffffff)
        sprite.setDepth(100)
        
        // Add player name text
        const nameText = this.add.text(player.x, player.y - 25, player.name, {
          fontSize: '12px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2
        }).setOrigin(0.5).setDepth(101)
        
        sprite.setData('nameText', nameText)
        this.playerSprites.set(player.id, sprite)
      }

      // For current player, update position immediately
      if (player.id === this.currentPlayer?.id) {
        sprite.setPosition(player.x, player.y)
        const nameText = sprite.getData('nameText') as Phaser.GameObjects.Text
        if (nameText) nameText.setPosition(player.x, player.y - 25)
        sprite.setScale(1.3)
        sprite.setAlpha(1)
        sprite.setStrokeStyle(4, 0xffd700) // Gold outline for self
      } else {
        // Other players will be interpolated in update loop
        sprite.setScale(1)
        sprite.setAlpha(player.isAlive ? 0.9 : 0.3)
        sprite.setStrokeStyle(2, 0xffffff)
      }
      
      // Update color in case of power-ups
      const baseColor = Phaser.Display.Color.HexStringToColor(player.color).color
      sprite.fillColor = baseColor
    })

    // Remove sprites for disconnected players
    this.playerSprites.forEach((sprite, playerId) => {
      if (!players.find(p => p.id === playerId)) {
        const nameText = sprite.getData('nameText')
        if (nameText) nameText.destroy()
        sprite.destroy()
        this.playerSprites.delete(playerId)
        this.playerTargetPositions.delete(playerId)
        this.playerHealthBars.get(playerId)?.destroy()
        this.playerHealthBars.delete(playerId)
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
    return Object.values(this.gameState.players).find(player => {
      const distance = Phaser.Math.Distance.Between(player.x, player.y, x, y)
      return distance < 25
    }) || null
  }

  private handleGameEvent(event: any) {
    switch (event.type) {
      case 'nexus-captured':
        this.createCaptureEffect(event.data.nexusId)
        this.showNotification(`${event.data.playerName} captured a nexus!`, event.data.contested ? GameScene.COLOR_CONTESTED : GameScene.COLOR_SUCCESS)
        break
      case 'energy-pulse':
        this.createPulseEffect()
        break
      case 'player-attacked':
        this.handlePlayerAttackedEvent(event.data)
        break
      case 'player-killed':
        this.handlePlayerKilledEvent(event.data)
        break
      case 'powerup-spawned':
        // Power-ups are handled in renderPowerUps
        break
      case 'powerup-collected':
        this.handlePowerUpCollectedEvent(event.data)
        break
      case 'beacon-deployed':
        this.createBeaconEffect(event.data.x, event.data.y)
        break
      case 'phase-changed':
        this.showNotification(`Phase: ${event.data.newPhase.toUpperCase()}`, '#ffd700')
        break
    }
  }
  
  private showNotification(text: string, color: string = '#ffffff') {
    const notification = this.add.text(400, 80, text, {
      fontSize: '18px',
      color: color,
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: { x: 15, y: 8 }
    }).setOrigin(0.5).setDepth(1000).setAlpha(0)
    
    this.tweens.add({
      targets: notification,
      alpha: 1,
      y: 100,
      duration: 300,
      ease: 'Back.out',
      onComplete: () => {
        this.tweens.add({
          targets: notification,
          alpha: 0,
          y: 120,
          delay: 2000,
          duration: 500,
          onComplete: () => notification.destroy()
        })
      }
    })
  }

  private handlePlayerAttackedEvent(data: any) {
    const attacker = Object.values(this.gameState.players).find(p => p.id === data.attackerId)
    const target = Object.values(this.gameState.players).find(p => p.id === data.targetId)
    
    if (attacker && target) {
      this.createAttackEffect(attacker.x, attacker.y, target.x, target.y)
      
      // Create damage number
      const damageText = this.add.text(target.x, target.y - 20, `-${data.damage}`, {
        fontSize: '16px',
        color: '#ff0000',
        fontStyle: 'bold'
      }).setOrigin(0.5)
      
      this.tweens.add({
        targets: damageText,
        y: target.y - 40,
        alpha: 0,
        duration: 1000,
        onComplete: () => damageText.destroy()
      })
    }
  }

  private handlePlayerKilledEvent(data: any) {
    const victim = Object.values(this.gameState.players).find(p => p.id === data.victimId)
    
    if (victim) {
      // Create death effect
      this.particleEmitter.setPosition(victim.x, victim.y)
      this.particleEmitter.explode(20)
      
      // Show kill message
      const killText = this.add.text(victim.x, victim.y, `${data.killerName} eliminated ${data.victimName}!`, {
        fontSize: '14px',
        color: '#ffff00',
        backgroundColor: '#000000',
        padding: { x: 5, y: 5 }
      }).setOrigin(0.5)
      
      this.tweens.add({
        targets: killText,
        y: victim.y - 50,
        alpha: 0,
        duration: 2000,
        onComplete: () => killText.destroy()
      })
    }
  }

  private handlePowerUpCollectedEvent(data: any) {
    // Create collection effect
    const player = Object.values(this.gameState.players).find(p => p.id === data.playerId)
    
    if (player) {
      this.particleEmitter.setPosition(player.x, player.y)
      this.particleEmitter.explode(15)
      
      // Show power-up text
      const powerUpText = this.add.text(player.x, player.y - 30, `+${data.powerUpType.toUpperCase()}!`, {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 3, y: 3 }
      }).setOrigin(0.5)
      
      this.tweens.add({
        targets: powerUpText,
        y: player.y - 50,
        alpha: 0,
        duration: 1500,
        onComplete: () => powerUpText.destroy()
      })
    }
  }

  // Visual effects
  private createHarvestEffect(x: number, y: number) {
    this.particleEmitter.setPosition(x, y)
    this.particleEmitter.explode(10)
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
    this.particleEmitter.setPosition(x, y)
    this.particleEmitter.explode(15)
  }

  private createCaptureEffect(nexusId: string) {
    const nexus = this.gameState.nexuses.find(n => n.id === nexusId)
    if (nexus) {
      this.particleEmitter.setPosition(nexus.x, nexus.y)
      this.particleEmitter.explode(20)
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

  private renderHealthBars() {
    const players = Object.values(this.gameState.players)
    
    players.forEach(player => {
      let healthBarContainer = this.playerHealthBars.get(player.id)
      
      if (!healthBarContainer) {
        // Create health bar container
        healthBarContainer = this.add.container(player.x, player.y - 35)
        healthBarContainer.setDepth(150)
        
        // Background bar (dark)
        const bgBar = this.add.rectangle(0, 0, 44, 8, 0x333333)
        bgBar.setStrokeStyle(1, 0x000000)
        
        // Health bar (gradient based on health)
        const healthBar = this.add.rectangle(0, 0, 40, 6, 0x00ff00)
        healthBar.setData('isHealthBar', true)
        
        healthBarContainer.add([bgBar, healthBar])
        this.playerHealthBars.set(player.id, healthBarContainer)
      }
      
      // Get sprite position for smooth following
      const sprite = this.playerSprites.get(player.id)
      if (sprite) {
        healthBarContainer.setPosition(sprite.x, sprite.y - 35)
      }
      
      // Show/hide based on alive status
      healthBarContainer.setVisible(player.isAlive)
      
      // Update health bar width and color
      const healthBar = healthBarContainer.list.find((obj: any) => obj.getData?.('isHealthBar'))
      if (healthBar) {
        const healthPercent = player.health / player.maxHealth
        const newWidth = 40 * healthPercent
        ;(healthBar as Phaser.GameObjects.Rectangle).setSize(Math.max(0, newWidth), 6)
        ;(healthBar as Phaser.GameObjects.Rectangle).setPosition(-(40 - newWidth) / 2, 0)
        
        // Color based on health percentage
        if (healthPercent > 0.6) {
          ;(healthBar as Phaser.GameObjects.Rectangle).fillColor = 0x00ff00
        } else if (healthPercent > 0.3) {
          ;(healthBar as Phaser.GameObjects.Rectangle).fillColor = 0xffff00
        } else {
          ;(healthBar as Phaser.GameObjects.Rectangle).fillColor = 0xff0000
        }
      }
    })
    
    // Remove health bars for disconnected players
    this.playerHealthBars.forEach((container, playerId) => {
      const player = players.find(p => p.id === playerId)
      if (!player) {
        container.destroy()
        this.playerHealthBars.delete(playerId)
      }
    })
  }

  private renderPowerUps() {
    if (!this.gameState.powerUps) return
    
    this.gameState.powerUps.forEach(powerUp => {
      if (powerUp.collected) return
      
      let sprite = this.powerUpSprites.get(powerUp.id)
      
      if (!sprite) {
        // Create power-up as a diamond shape
        const color = this.getPowerUpColor(powerUp.type)
        const graphics = this.add.graphics()
        graphics.fillStyle(color, 0.9)
        graphics.fillRoundedRect(-12, -12, 24, 24, 6)
        graphics.lineStyle(2, 0xffffff, 1)
        graphics.strokeRoundedRect(-12, -12, 24, 24, 6)
        
        // Create container for the power-up
        const container = this.add.container(powerUp.x, powerUp.y, [graphics])
        container.setDepth(80)
        sprite = container
        
        // Add icon text
        const iconText = this.add.text(0, 0, this.getPowerUpIcon(powerUp.type), {
          fontSize: '14px',
        }).setOrigin(0.5)
        container.add(iconText)
        
        // Add pulsing animation
        this.tweens.add({
          targets: sprite,
          scaleX: 1.15,
          scaleY: 1.15,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
        
        // Floating animation
        this.tweens.add({
          targets: sprite,
          y: powerUp.y - 5,
          duration: 1200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        })
        
        this.powerUpSprites.set(powerUp.id, sprite as any)
      }
    })
    
    // Remove collected or expired power-ups
    this.powerUpSprites.forEach((sprite, powerUpId) => {
      const powerUp = this.gameState.powerUps?.find(p => p.id === powerUpId && !p.collected)
      if (!powerUp) {
        this.tweens.killTweensOf(sprite)
        sprite.destroy()
        this.powerUpSprites.delete(powerUpId)
      }
    })
  }
  
  private getPowerUpIcon(type: string): string {
    switch (type) {
      case 'speed': return '⚡'
      case 'shield': return '🛡️'
      case 'damage': return '⚔️'
      case 'health': return '❤️'
      case 'energy': return '🔋'
      default: return '✨'
    }
  }

  private getPowerUpColor(type: string): number {
    switch (type) {
      case 'speed': return 0x00ffff    // Cyan
      case 'shield': return 0x0000ff   // Blue
      case 'damage': return 0xff0000   // Red
      case 'health': return 0x00ff00   // Green
      case 'energy': return 0xffff00   // Yellow
      default: return 0xffffff         // White
    }
  }

  private renderLeaderboard() {
    if (!this.gameState.leaderboard) return
    
    let leaderboardText = '🏆 LEADERBOARD\n'
    this.gameState.leaderboard.slice(0, 5).forEach((entry, index) => {
      const isCurrentPlayer = entry.playerId === this.currentPlayer?.id
      const prefix = isCurrentPlayer ? '► ' : '  '
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`
      leaderboardText += `${prefix}${medal} ${entry.playerName.slice(0, 10)}: ${entry.score}\n`
    })
    
    this.leaderboardText.setText(leaderboardText)
    
    // Update phase text
    if (this.phaseText && this.gameState.gamePhase) {
      const phaseNames: Record<string, string> = {
        'waiting': '⏳ Waiting...',
        'spawn': '🎯 SPAWN',
        'expansion': '🌍 EXPAND',
        'conflict': '⚔️ CONFLICT',
        'pulse': '💥 PULSE',
        'ended': '🏁 GAME OVER'
      }
      this.phaseText.setText(phaseNames[this.gameState.gamePhase] || this.gameState.gamePhase)
    }
  }

  private handleAttackNearestPlayer() {
    if (!this.currentPlayer || !this.gameState?.players) return
    
    const players = Object.values(this.gameState.players)
    let nearestPlayer: Player | null = null
    let nearestDistance = Infinity
    
    for (const player of players) {
      if (player.id === this.currentPlayer.id || !player.isAlive) continue
      
      const distance = Phaser.Math.Distance.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        player.x, player.y
      )
      
      if (distance < nearestDistance && distance <= this.currentPlayer.attackRange) {
        nearestDistance = distance
        nearestPlayer = player
      }
    }
    
    if (nearestPlayer) {
      const target = nearestPlayer
      this.socket.emit('player-action', {
        type: 'attack',
        data: { targetId: target.id }
      })
      
      // Visual feedback
      this.createAttackEffect(
        this.currentPlayer.x, this.currentPlayer.y,
        target.x, target.y
      )
    }
  }
}
