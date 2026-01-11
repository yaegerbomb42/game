import * as Phaser from 'phaser'
import { Socket } from 'socket.io-client'

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
  activePowerUps: any[]
  speed: number
  comboCount: number
  killStreak: number
  invincibleUntil: number
  abilityType: string
  abilityCooldown: number
  lastAbilityUse: number
}

interface Nexus {
  id: string
  x: number
  y: number
  energy: number
  controlledBy: string | null
  chargeLevel: number
  contestProgress: Record<string, number>
  isContested: boolean
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
    killStreak: number
    damageDealt: number
  }>
}

export class GameScene extends Phaser.Scene {
  private socket!: Socket
  private currentPlayer!: Player
  private gameState!: GameState
  
  // Game objects
  private playerSprites = new Map<string, Phaser.GameObjects.Container>()
  private nexusSprites = new Map<string, Phaser.GameObjects.Container>()
  private powerUpSprites = new Map<string, Phaser.GameObjects.Container>()
  private influenceGraphics!: Phaser.GameObjects.Graphics
  private leaderboardText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private abilityIndicator!: Phaser.GameObjects.Container
  
  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasdKeys!: Record<string, Phaser.Input.Keyboard.Key>
  
  // Movement
  private targetX = 0
  private targetY = 0
  private isMovingToTarget = false

  // Visual effects queue
  private effectsQueue: Array<() => void> = []

  constructor() {
    super({ key: 'GameScene' })
  }

  preload() {
    // Create particle texture programmatically
    const graphics = this.add.graphics()
    graphics.fillStyle(0xffffff)
    graphics.fillCircle(4, 4, 4)
    graphics.generateTexture('particle', 8, 8)
    graphics.destroy()
  }

  create() {
    // Create graphics for influence visualization
    this.influenceGraphics = this.add.graphics()
    
    // Setup input
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasdKeys = this.input.keyboard!.addKeys('W,S,A,D,E,Q,F,R,SPACE') as Record<string, Phaser.Input.Keyboard.Key>

    // Mouse input for movement and attacks
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleMouseClick(pointer.x, pointer.y)
    })

    // Keyboard actions
    this.input.keyboard!.on('keydown-E', () => this.handleHarvest())
    this.input.keyboard!.on('keydown-Q', () => this.handleBoostNexus())
    this.input.keyboard!.on('keydown-SPACE', () => this.handleDeployBeacon())
    this.input.keyboard!.on('keydown-F', () => this.handleAttackNearestPlayer())
    this.input.keyboard!.on('keydown-R', () => this.handleUseAbility())

    // Create UI elements
    this.createUI()
  }

  private createUI() {
    // Leaderboard
    this.leaderboardText = this.add.text(10, 10, '', {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: { x: 10, y: 8 }
    }).setScrollFactor(0).setDepth(1000)

    // Combo counter
    this.comboText = this.add.text(400, 50, '', {
      fontSize: '24px',
      color: '#ffff00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setAlpha(0)

    // Ability indicator
    this.abilityIndicator = this.add.container(700, 550)
    const abilityBg = this.add.circle(0, 0, 30, 0x333333, 0.8)
    const abilityText = this.add.text(0, 0, 'R', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5)
    this.abilityIndicator.add([abilityBg, abilityText])
    this.abilityIndicator.setScrollFactor(0).setDepth(1000)
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
    if (!this.currentPlayer || !this.gameState) return
    
    this.handleMovement(delta)
    this.updatePlayerPosition(delta)
    this.updateAbilityIndicator()
    
    // Process visual effects
    while (this.effectsQueue.length > 0) {
      const effect = this.effectsQueue.shift()
      if (effect) effect()
    }
  }

  private handleMovement(delta: number) {
    let velocityX = 0
    let velocityY = 0

    if (this.wasdKeys.A?.isDown || this.cursors.left?.isDown) velocityX = -1
    else if (this.wasdKeys.D?.isDown || this.cursors.right?.isDown) velocityX = 1

    if (this.wasdKeys.W?.isDown || this.cursors.up?.isDown) velocityY = -1
    else if (this.wasdKeys.S?.isDown || this.cursors.down?.isDown) velocityY = 1

    if (velocityX !== 0 || velocityY !== 0) {
      this.isMovingToTarget = false
      const speed = this.currentPlayer.speed * (delta / 1000)
      
      // Normalize diagonal movement
      if (velocityX !== 0 && velocityY !== 0) {
        const factor = 0.707
        velocityX *= factor
        velocityY *= factor
      }

      const newX = Phaser.Math.Clamp(this.currentPlayer.x + velocityX * speed, 20, 780)
      const newY = Phaser.Math.Clamp(this.currentPlayer.y + velocityY * speed, 20, 580)
      
      this.sendPlayerAction('move', { x: newX, y: newY })
    }
  }

  private handleMouseClick(x: number, y: number) {
    // Check if clicking on another player (for attack)
    const clickedPlayer = this.getPlayerAtPosition(x, y)
    if (clickedPlayer && clickedPlayer.id !== this.currentPlayer.id) {
      this.sendPlayerAction('attack', { targetId: clickedPlayer.id })
      return
    }

    // Otherwise, move to position
    this.targetX = x
    this.targetY = y
    this.isMovingToTarget = true
    
    // Visual feedback for target
    this.createMoveTargetEffect(x, y)
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
    if (this.currentPlayer.energy >= 25) {
      this.sendPlayerAction('deploy-beacon', {})
      this.createBeaconEffect(this.currentPlayer.x, this.currentPlayer.y)
    }
  }

  private handleAttackNearestPlayer() {
    const players = Object.values(this.gameState.players)
    let nearestPlayerId: string | null = null
    let nearestDistance = Infinity
    
    for (const player of players) {
      if (player.id === this.currentPlayer.id || !player.isAlive) continue
      
      const distance = Phaser.Math.Distance.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        player.x, player.y
      )
      
      if (distance < nearestDistance && distance <= this.currentPlayer.attackRange) {
        nearestDistance = distance
        nearestPlayerId = player.id
      }
    }
    
    if (nearestPlayerId) {
      this.sendPlayerAction('attack', { targetId: nearestPlayerId })
    }
  }

  private handleUseAbility() {
    const now = Date.now()
    const cooldownRemaining = this.currentPlayer.lastAbilityUse + this.currentPlayer.abilityCooldown - now
    
    if (cooldownRemaining <= 0) {
      this.sendPlayerAction('use-ability', { 
        abilityType: this.currentPlayer.abilityType,
        x: this.targetX || this.currentPlayer.x,
        y: this.targetY || this.currentPlayer.y
      })
    }
  }

  private updateAbilityIndicator() {
    if (!this.currentPlayer) return
    
    const now = Date.now()
    const cooldownRemaining = Math.max(0, this.currentPlayer.lastAbilityUse + this.currentPlayer.abilityCooldown - now)
    const bg = this.abilityIndicator.list[0] as Phaser.GameObjects.Arc
    const text = this.abilityIndicator.list[1] as Phaser.GameObjects.Text
    
    if (cooldownRemaining > 0) {
      bg.fillColor = 0x666666
      text.setText(Math.ceil(cooldownRemaining / 1000).toString())
    } else {
      bg.fillColor = this.getAbilityColor(this.currentPlayer.abilityType)
      text.setText('R')
    }
  }

  private getAbilityColor(abilityType: string): number {
    switch (abilityType) {
      case 'dash': return 0x00ffff
      case 'heal': return 0x00ff00
      case 'shield': return 0x0000ff
      case 'scan': return 0xff00ff
      default: return 0xffffff
    }
  }

  private updatePlayerPosition(delta: number) {
    if (this.isMovingToTarget) {
      const distance = Phaser.Math.Distance.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        this.targetX, this.targetY
      )

      if (distance < 5) {
        this.isMovingToTarget = false
        return
      }

      const angle = Phaser.Math.Angle.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        this.targetX, this.targetY
      )

      const speed = this.currentPlayer.speed * (delta / 1000)
      const newX = this.currentPlayer.x + Math.cos(angle) * speed
      const newY = this.currentPlayer.y + Math.sin(angle) * speed

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
    this.renderPowerUps()
    this.renderLeaderboard()
  }

  private renderInfluenceMap() {
    this.influenceGraphics.clear()
    
    const players = Object.values(this.gameState.players)
    players.forEach(player => {
      if (player.influence > 0) {
        const radius = Math.min(player.influence * 1.5, 80)
        const color = Phaser.Display.Color.HexStringToColor(player.color).color
        this.influenceGraphics.fillStyle(color, 0.08)
        this.influenceGraphics.fillCircle(player.x, player.y, radius)
      }
    })

    // Draw nexus influence zones
    this.gameState.nexuses.forEach(nexus => {
      if (nexus.controlledBy) {
        const player = this.gameState.players[nexus.controlledBy]
        if (player) {
          const color = Phaser.Display.Color.HexStringToColor(player.color).color
          this.influenceGraphics.lineStyle(2, color, 0.3)
          this.influenceGraphics.strokeCircle(nexus.x, nexus.y, 70)
        }
      }
    })
  }

  private renderNexuses() {
    this.gameState.nexuses.forEach(nexus => {
      let container = this.nexusSprites.get(nexus.id)
      
      if (!container) {
        container = this.createNexusSprite(nexus)
        this.nexusSprites.set(nexus.id, container)
      }

      this.updateNexusSprite(container, nexus)
    })
  }

  private createNexusSprite(nexus: Nexus): Phaser.GameObjects.Container {
    const container = this.add.container(nexus.x, nexus.y)
    
    // Outer glow
    const glow = this.add.circle(0, 0, 35, 0x3498db, 0.3)
    
    // Nexus base
    const base = this.add.circle(0, 0, 25, 0x3498db)
    base.setStrokeStyle(3, 0x2980b9)
    
    // Inner core
    const core = this.add.circle(0, 0, 10, 0xffffff, 0.8)
    
    // Energy bar background
    const energyBg = this.add.rectangle(0, -40, 50, 8, 0x2c3e50)
    energyBg.setStrokeStyle(1, 0x34495e)
    
    // Energy bar fill
    const energyFill = this.add.rectangle(-25, -40, 0, 6, 0x27ae60)
    energyFill.setOrigin(0, 0.5)
    
    // Contest bar (shows capture progress)
    const contestBg = this.add.rectangle(0, -50, 50, 4, 0x1a1a2e)
    const contestFill = this.add.rectangle(-25, -50, 0, 4, 0xf39c12)
    contestFill.setOrigin(0, 0.5)
    
    // Charge level indicators
    const chargeDots: Phaser.GameObjects.Arc[] = []
    for (let i = 0; i < 5; i++) {
      const dot = this.add.circle(-20 + i * 10, 40, 4, 0x95a5a6)
      chargeDots.push(dot)
    }
    
    // Contested indicator
    const contestedText = this.add.text(0, -60, '⚔️', {
      fontSize: '16px'
    }).setOrigin(0.5).setVisible(false)
    
    container.add([glow, base, core, energyBg, energyFill, contestBg, contestFill, ...chargeDots, contestedText])
    container.setData('glow', glow)
    container.setData('base', base)
    container.setData('core', core)
    container.setData('energyFill', energyFill)
    container.setData('contestFill', contestFill)
    container.setData('chargeDots', chargeDots)
    container.setData('contestedText', contestedText)
    
    return container
  }

  private updateNexusSprite(container: Phaser.GameObjects.Container, nexus: Nexus) {
    const base = container.getData('base') as Phaser.GameObjects.Arc
    const glow = container.getData('glow') as Phaser.GameObjects.Arc
    const energyFill = container.getData('energyFill') as Phaser.GameObjects.Rectangle
    const contestFill = container.getData('contestFill') as Phaser.GameObjects.Rectangle
    const chargeDots = container.getData('chargeDots') as Phaser.GameObjects.Arc[]
    const contestedText = container.getData('contestedText') as Phaser.GameObjects.Text
    
    // Update energy bar
    energyFill.width = (nexus.energy / 100) * 48
    
    // Update charge level
    chargeDots.forEach((dot, index) => {
      dot.fillColor = index < nexus.chargeLevel ? 0xf39c12 : 0x95a5a6
    })

    // Update control color
    if (nexus.controlledBy) {
      const controllingPlayer = this.gameState.players[nexus.controlledBy]
      if (controllingPlayer) {
        const color = Phaser.Display.Color.HexStringToColor(controllingPlayer.color).color
        base.fillColor = color
        glow.fillColor = color
      }
    } else {
      base.fillColor = 0x3498db
      glow.fillColor = 0x3498db
    }

    // Update contest progress for current player
    const myProgress = nexus.contestProgress[this.currentPlayer?.id] || 0
    contestFill.width = (myProgress / 100) * 48
    
    // Show contested indicator
    contestedText.setVisible(nexus.isContested)
  }

  private renderPlayers() {
    const players = Object.values(this.gameState.players)
    
    players.forEach(player => {
      let container = this.playerSprites.get(player.id)
      
      if (!container) {
        container = this.createPlayerSprite(player)
        this.playerSprites.set(player.id, container)
      }

      this.updatePlayerSprite(container, player)
    })

    // Remove sprites for disconnected players
    this.playerSprites.forEach((container, playerId) => {
      if (!players.find(p => p.id === playerId)) {
        container.destroy()
        this.playerSprites.delete(playerId)
      }
    })
  }

  private createPlayerSprite(player: Player): Phaser.GameObjects.Container {
    const container = this.add.container(player.x, player.y)
    
    // Shadow
    const shadow = this.add.ellipse(2, 3, 22, 10, 0x000000, 0.3)
    
    // Player body
    const color = Phaser.Display.Color.HexStringToColor(player.color).color
    const body = this.add.circle(0, 0, 12, color)
    body.setStrokeStyle(2, 0xffffff)
    
    // Direction indicator
    const direction = this.add.triangle(15, 0, 0, -5, 0, 5, 8, 0, color)
    direction.setAlpha(0.8)
    
    // Health bar background
    const healthBg = this.add.rectangle(0, -22, 30, 5, 0xff0000)
    
    // Health bar fill
    const healthFill = this.add.rectangle(-15, -22, 30, 5, 0x00ff00)
    healthFill.setOrigin(0, 0.5)
    
    // Player name
    const nameText = this.add.text(0, -32, player.name, {
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5)
    
    // Kill streak badge
    const killStreakBadge = this.add.text(0, 18, '', {
      fontSize: '10px',
      color: '#ff0000',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false)
    
    // Invincibility indicator
    const invincibleRing = this.add.circle(0, 0, 18, 0xffffff, 0)
    invincibleRing.setStrokeStyle(3, 0xffffff, 0.5)
    invincibleRing.setVisible(false)
    
    container.add([shadow, body, direction, healthBg, healthFill, nameText, killStreakBadge, invincibleRing])
    container.setData('body', body)
    container.setData('direction', direction)
    container.setData('healthFill', healthFill)
    container.setData('nameText', nameText)
    container.setData('killStreakBadge', killStreakBadge)
    container.setData('invincibleRing', invincibleRing)
    
    return container
  }

  private updatePlayerSprite(container: Phaser.GameObjects.Container, player: Player) {
    // Smooth position interpolation
    const lerpFactor = 0.3
    container.x = Phaser.Math.Linear(container.x, player.x, lerpFactor)
    container.y = Phaser.Math.Linear(container.y, player.y, lerpFactor)
    
    const healthFill = container.getData('healthFill') as Phaser.GameObjects.Rectangle
    const killStreakBadge = container.getData('killStreakBadge') as Phaser.GameObjects.Text
    const invincibleRing = container.getData('invincibleRing') as Phaser.GameObjects.Arc
    const body = container.getData('body') as Phaser.GameObjects.Arc
    
    // Update health bar
    const healthPercent = player.health / player.maxHealth
    healthFill.width = 30 * healthPercent
    healthFill.fillColor = healthPercent > 0.5 ? 0x00ff00 : healthPercent > 0.25 ? 0xffff00 : 0xff0000
    
    // Update kill streak badge
    if (player.killStreak >= 3) {
      killStreakBadge.setText(`🔥${player.killStreak}`)
      killStreakBadge.setVisible(true)
    } else {
      killStreakBadge.setVisible(false)
    }
    
    // Update invincibility
    const isInvincible = Date.now() < player.invincibleUntil
    invincibleRing.setVisible(isInvincible)
    if (isInvincible) {
      invincibleRing.alpha = 0.5 + Math.sin(Date.now() / 100) * 0.3
    }
    
    // Highlight current player
    if (player.id === this.currentPlayer?.id) {
      body.setStrokeStyle(3, 0xffffff)
      container.setScale(1.1)
    } else {
      body.setStrokeStyle(2, 0xffffff)
      container.setScale(1)
    }
    
    // Fade dead players
    container.setAlpha(player.isAlive ? 1 : 0.3)
  }

  private renderPowerUps() {
    if (!this.gameState.powerUps) return
    
    this.gameState.powerUps.forEach(powerUp => {
      if (powerUp.collected) return
      
      let container = this.powerUpSprites.get(powerUp.id)
      
      if (!container) {
        container = this.createPowerUpSprite(powerUp)
        this.powerUpSprites.set(powerUp.id, container)
      }
    })
    
    // Remove collected power-ups
    this.powerUpSprites.forEach((container, powerUpId) => {
      const powerUp = this.gameState.powerUps?.find(p => p.id === powerUpId)
      if (!powerUp || powerUp.collected) {
        container.destroy()
        this.powerUpSprites.delete(powerUpId)
      }
    })
  }

  private createPowerUpSprite(powerUp: PowerUp): Phaser.GameObjects.Container {
    const container = this.add.container(powerUp.x, powerUp.y)
    const color = this.getPowerUpColor(powerUp.type)
    
    // Glow effect
    const glow = this.add.circle(0, 0, 18, color, 0.3)
    
    // Main shape
    const shape = this.add.circle(0, 0, 12, color)
    shape.setStrokeStyle(2, 0xffffff)
    
    // Icon
    const icon = this.add.text(0, 0, this.getPowerUpIcon(powerUp.type), {
      fontSize: '14px'
    }).setOrigin(0.5)
    
    container.add([glow, shape, icon])
    
    // Pulsing animation
    this.tweens.add({
      targets: container,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })
    
    // Float animation
    this.tweens.add({
      targets: container,
      y: powerUp.y - 5,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })
    
    return container
  }

  private getPowerUpColor(type: string): number {
    switch (type) {
      case 'speed': return 0x00ffff
      case 'shield': return 0x3498db
      case 'damage': return 0xff4444
      case 'health': return 0x00ff00
      case 'energy': return 0xf1c40f
      default: return 0xffffff
    }
  }

  private getPowerUpIcon(type: string): string {
    switch (type) {
      case 'speed': return '⚡'
      case 'shield': return '🛡️'
      case 'damage': return '⚔️'
      case 'health': return '❤️'
      case 'energy': return '✨'
      default: return '?'
    }
  }

  private getNearbyNexus(): Nexus | null {
    return this.gameState.nexuses.find(nexus => {
      const distance = Phaser.Math.Distance.Between(
        this.currentPlayer.x, this.currentPlayer.y,
        nexus.x, nexus.y
      )
      return distance < 60
    }) || null
  }

  private getPlayerAtPosition(x: number, y: number): Player | null {
    return Object.values(this.gameState.players).find(player => {
      const distance = Phaser.Math.Distance.Between(player.x, player.y, x, y)
      return distance < 25 && player.isAlive
    }) || null
  }

  private handleGameEvent(event: any) {
    switch (event.type) {
      case 'nexus-captured':
        this.effectsQueue.push(() => this.createCaptureEffect(event.data.nexusId))
        this.showNotification(`${event.data.playerName} captured a nexus!`, 0xffd700)
        break
      case 'energy-pulse':
        this.effectsQueue.push(() => this.createPulseEffect())
        break
      case 'player-attacked':
        this.effectsQueue.push(() => this.handlePlayerAttackedEvent(event.data))
        break
      case 'player-killed':
        this.effectsQueue.push(() => this.handlePlayerKilledEvent(event.data))
        break
      case 'player-respawned':
        this.effectsQueue.push(() => this.createRespawnEffect(event.data.x, event.data.y))
        break
      case 'powerup-collected':
        this.effectsQueue.push(() => this.handlePowerUpCollectedEvent(event.data))
        break
      case 'beacon-deployed':
        this.effectsQueue.push(() => this.createBeaconEffect(event.data.x, event.data.y))
        break
      case 'ability-used':
        this.effectsQueue.push(() => this.handleAbilityUsedEvent(event.data))
        break
      case 'achievement-unlocked':
        this.showAchievement(event.data.achievement)
        break
    }
  }

  private handlePlayerAttackedEvent(data: any) {
    const attacker = this.gameState.players[data.attackerId]
    const target = this.gameState.players[data.targetId]
    
    if (attacker && target) {
      this.createAttackEffect(attacker.x, attacker.y, target.x, target.y)
      
      // Damage number
      const damageText = this.add.text(target.x, target.y - 20, `-${data.damage}`, {
        fontSize: '18px',
        color: '#ff4444',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5)
      
      this.tweens.add({
        targets: damageText,
        y: target.y - 50,
        alpha: 0,
        scale: 1.3,
        duration: 800,
        ease: 'Power2',
        onComplete: () => damageText.destroy()
      })

      // Show combo text for current player
      if (data.attackerId === this.currentPlayer?.id && data.comboCount > 1) {
        this.showCombo(data.comboCount)
      }
    }
  }

  private handlePlayerKilledEvent(data: any) {
    const victim = this.gameState.players[data.victimId]
    
    if (victim) {
      this.createDeathEffect(victim.x, victim.y)
      
      // Kill notification
      const killText = this.add.text(400, 100, 
        `💀 ${data.killerName} eliminated ${data.victimName}!`, {
        fontSize: '16px',
        color: '#ff4444',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: { x: 15, y: 8 }
      }).setOrigin(0.5).setDepth(2000)
      
      this.tweens.add({
        targets: killText,
        y: 80,
        alpha: 0,
        duration: 2500,
        ease: 'Power2',
        onComplete: () => killText.destroy()
      })

      // Kill streak notification
      if (data.killStreak >= 3) {
        this.showAchievement(`${data.killerName}: ${data.killStreak} Kill Streak! 🔥`)
      }
    }
  }

  private handlePowerUpCollectedEvent(data: any) {
    const player = this.gameState.players[data.playerId]
    if (player) {
      const color = this.getPowerUpColor(data.powerUpType)
      this.createCollectionEffect(player.x, player.y, color)
      
      if (data.playerId === this.currentPlayer?.id) {
        this.showNotification(`+${data.powerUpType.toUpperCase()}!`, color)
      }
    }
  }

  private handleAbilityUsedEvent(data: any) {
    switch (data.ability) {
      case 'dash':
        this.createDashEffect(data.x, data.y)
        break
      case 'heal':
        const player = this.gameState.players[data.playerId]
        if (player) this.createHealEffect(player.x, player.y)
        break
      case 'shield':
        const shieldPlayer = this.gameState.players[data.playerId]
        if (shieldPlayer) this.createShieldEffect(shieldPlayer.x, shieldPlayer.y)
        break
      case 'scan':
        this.createScanEffect()
        break
    }
  }

  // Visual Effects
  private createMoveTargetEffect(x: number, y: number) {
    const ring = this.add.circle(x, y, 10, 0xffffff, 0)
    ring.setStrokeStyle(2, 0xffffff, 0.8)
    
    this.tweens.add({
      targets: ring,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 400,
      onComplete: () => ring.destroy()
    })
  }

  private createHarvestEffect(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const particle = this.add.circle(x, y, 4, 0x27ae60)
      
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * 40,
        y: y + Math.sin(angle) * 40,
        alpha: 0,
        scale: 0,
        duration: 500,
        ease: 'Power2',
        onComplete: () => particle.destroy()
      })
    }
  }

  private createAttackEffect(fromX: number, fromY: number, toX: number, toY: number) {
    // Attack line
    const line = this.add.line(0, 0, fromX, fromY, toX, toY, 0xff4444, 1)
    line.setLineWidth(4)
    
    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: 150,
      onComplete: () => line.destroy()
    })

    // Impact effect at target
    const impact = this.add.circle(toX, toY, 5, 0xff4444)
    this.tweens.add({
      targets: impact,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 200,
      onComplete: () => impact.destroy()
    })
  }

  private createBeaconEffect(x: number, y: number) {
    const beacon = this.add.circle(x, y, 8, 0xf39c12, 0.8)
    
    const ring1 = this.add.circle(x, y, 8, 0xf39c12, 0)
    ring1.setStrokeStyle(3, 0xf39c12, 0.8)
    
    const ring2 = this.add.circle(x, y, 8, 0xf39c12, 0)
    ring2.setStrokeStyle(2, 0xf39c12, 0.5)

    // First ring animation
    this.tweens.add({
      targets: ring1,
      scaleX: 8,
      scaleY: 8,
      alpha: 0,
      duration: 1500,
      onComplete: () => ring1.destroy()
    })
    
    // Second ring animation with delay
    this.tweens.add({
      targets: ring2,
      scaleX: 8,
      scaleY: 8,
      alpha: 0,
      duration: 1500,
      delay: 200,
      onComplete: () => ring2.destroy()
    })

    this.tweens.add({
      targets: beacon,
      alpha: 0,
      duration: 2000,
      onComplete: () => beacon.destroy()
    })
  }

  private createBoostEffect(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const particle = this.add.circle(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, 3, 0xf39c12)
      
      this.tweens.add({
        targets: particle,
        x: x,
        y: y,
        alpha: 0,
        scale: 2,
        duration: 400,
        ease: 'Power2',
        onComplete: () => particle.destroy()
      })
    }
  }

  private createCaptureEffect(nexusId: string) {
    const nexus = this.gameState.nexuses.find(n => n.id === nexusId)
    if (!nexus) return
    
    // Burst of particles
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const particle = this.add.circle(nexus.x, nexus.y, 5, 0xffd700)
      
      this.tweens.add({
        targets: particle,
        x: nexus.x + Math.cos(angle) * 60,
        y: nexus.y + Math.sin(angle) * 60,
        alpha: 0,
        scale: 0,
        duration: 600,
        ease: 'Power2',
        onComplete: () => particle.destroy()
      })
    }

    // Flash effect
    const flash = this.add.circle(nexus.x, nexus.y, 30, 0xffd700, 0.8)
    this.tweens.add({
      targets: flash,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy()
    })
  }

  private createPulseEffect() {
    this.gameState.nexuses.forEach(nexus => {
      if (nexus.controlledBy) {
        const player = this.gameState.players[nexus.controlledBy]
        const color = player ? Phaser.Display.Color.HexStringToColor(player.color).color : 0xffd700
        
        for (let i = 0; i < 3; i++) {
          const pulse = this.add.circle(nexus.x, nexus.y, 30, color, 0)
          pulse.setStrokeStyle(4, color, 0.8)
          
          this.tweens.add({
            targets: pulse,
            scaleX: 4,
            scaleY: 4,
            alpha: 0,
            duration: 1500,
            delay: i * 300,
            ease: 'Power2',
            onComplete: () => pulse.destroy()
          })
        }
      }
    })
  }

  private createDeathEffect(x: number, y: number) {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 30 + Math.random() * 50
      const particle = this.add.circle(x, y, 3 + Math.random() * 3, 0xff0000)
      
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0,
        duration: 400 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => particle.destroy()
      })
    }
  }

  private createRespawnEffect(x: number, y: number) {
    const ring = this.add.circle(x, y, 50, 0x00ff00, 0)
    ring.setStrokeStyle(4, 0x00ff00, 0.8)
    
    this.tweens.add({
      targets: ring,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => ring.destroy()
    })
  }

  private createCollectionEffect(x: number, y: number, color: number) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const particle = this.add.circle(x + Math.cos(angle) * 30, y + Math.sin(angle) * 30, 4, color)
      
      this.tweens.add({
        targets: particle,
        x: x,
        y: y - 20,
        alpha: 0,
        duration: 400,
        ease: 'Power2',
        onComplete: () => particle.destroy()
      })
    }
  }

  private createDashEffect(x: number, y: number) {
    const trail = this.add.circle(x, y, 15, 0x00ffff, 0.5)
    this.tweens.add({
      targets: trail,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 300,
      onComplete: () => trail.destroy()
    })
  }

  private createHealEffect(x: number, y: number) {
    const cross1 = this.add.rectangle(x, y, 6, 24, 0x00ff00)
    const cross2 = this.add.rectangle(x, y, 24, 6, 0x00ff00)
    
    this.tweens.add({
      targets: [cross1, cross2],
      y: y - 30,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => { cross1.destroy(); cross2.destroy() }
    })
  }

  private createShieldEffect(x: number, y: number) {
    const shield = this.add.circle(x, y, 20, 0x3498db, 0)
    shield.setStrokeStyle(4, 0x3498db, 0.8)
    
    this.tweens.add({
      targets: shield,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 500,
      yoyo: true,
      repeat: 2,
      onComplete: () => shield.destroy()
    })
  }

  private createScanEffect() {
    const scan = this.add.circle(this.currentPlayer.x, this.currentPlayer.y, 10, 0xff00ff, 0)
    scan.setStrokeStyle(2, 0xff00ff, 0.8)
    
    this.tweens.add({
      targets: scan,
      scaleX: 50,
      scaleY: 50,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => scan.destroy()
    })
  }

  private showCombo(count: number) {
    this.comboText.setText(`${count}x COMBO!`)
    this.comboText.setAlpha(1)
    this.comboText.setScale(0.5)
    
    this.tweens.add({
      targets: this.comboText,
      scale: 1.2,
      duration: 200,
      yoyo: true,
      onComplete: () => {
        this.tweens.add({
          targets: this.comboText,
          alpha: 0,
          delay: 800,
          duration: 300
        })
      }
    })
  }

  private showNotification(text: string, color: number) {
    const notification = this.add.text(400, 150, text, {
      fontSize: '18px',
      color: '#' + color.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(2000)
    
    this.tweens.add({
      targets: notification,
      y: 120,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => notification.destroy()
    })
  }

  private showAchievement(text: string) {
    const achievement = this.add.text(400, 200, `🏆 ${text}`, {
      fontSize: '20px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: { x: 15, y: 10 }
    }).setOrigin(0.5).setDepth(2001).setScale(0)
    
    this.tweens.add({
      targets: achievement,
      scale: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: achievement,
          y: 180,
          alpha: 0,
          delay: 2000,
          duration: 500,
          onComplete: () => achievement.destroy()
        })
      }
    })
  }

  private renderLeaderboard() {
    if (!this.gameState.leaderboard) return
    
    let text = '🏆 LEADERBOARD\n'
    this.gameState.leaderboard.slice(0, 5).forEach((entry, index) => {
      const isMe = entry.playerId === this.currentPlayer?.id
      const prefix = isMe ? '► ' : '  '
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`
      const streak = entry.killStreak >= 3 ? ` 🔥${entry.killStreak}` : ''
      text += `${prefix}${medal} ${entry.playerName}: ${entry.score}${streak}\n`
    })
    
    this.leaderboardText.setText(text)
  }
}
