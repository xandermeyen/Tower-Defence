// sprite sheets rendered from the KayKit Adventurers 3D models
// each enemy has three sheets: walking right (flipped for left), down and up
const ENEMY_TYPES = {
    orc: {
        sheet: 'rogue',
        framesMax: 8,
        health: 100,
        speed: 3,
        gold: 25,
        scale: 1,
        filter: 'none',
        heartDamage: 1
    },
    speedy: {
        sheet: 'rogue_hooded',
        framesMax: 8,
        health: 60,
        speed: 4.5,
        gold: 20,
        scale: 0.8,
        filter: 'none',
        heartDamage: 1
    },
    tank: {
        sheet: 'knight',
        framesMax: 8,
        health: 300,
        speed: 1.6,
        gold: 50,
        scale: 1.25,
        filter: 'none',
        heartDamage: 2
    },
    boss: {
        sheet: 'barbarian',
        framesMax: 8,
        health: 1200,
        speed: 1.1,
        gold: 250,
        scale: 1.8,
        filter: 'none',
        heartDamage: 5
    },
    healer: {
        sheet: 'rogue',
        framesMax: 8,
        health: 160,
        speed: 2.2,
        gold: 40,
        scale: 0.95,
        filter: 'hue-rotate(90deg) saturate(1.6)',
        heartDamage: 1
    },
    splitter: {
        sheet: 'barbarian',
        framesMax: 8,
        health: 280,
        speed: 2,
        gold: 45,
        scale: 1.15,
        filter: 'hue-rotate(260deg) saturate(1.5)',
        heartDamage: 2
    },
    mini: {
        sheet: 'rogue_hooded',
        framesMax: 8,
        health: 50,
        speed: 4,
        gold: 8,
        scale: 0.55,
        filter: 'hue-rotate(260deg) saturate(1.5)',
        heartDamage: 1
    }
}

class Enemy extends Sprite {
    constructor({
        position = { x: 0, y: 0 },
        type = 'orc',
        healthMultiplier = 1,
        waypointIndex = 0,
        healthOverride = null
    }) {
        const stats = ENEMY_TYPES[type]
        super({
            position,
            imageSrc: `img/${stats.sheet}.png`,
            frames: { max: stats.framesMax },
            scale: stats.scale,
            filter: stats.filter,
            // keep the sprite centered on the path regardless of scale
            offset: {
                x: -(100 * (stats.scale - 1)) / 2,
                y: -(100 * (stats.scale - 1)) / 2
            }
        })
        this.type = type
        this.position = position
        this.width = 100 * stats.scale
        this.height = 100 * stats.scale
        this.waypointIndex = waypointIndex
        this.radius = 50 * stats.scale
        this.maxHealth = healthOverride || Math.round(stats.health * healthMultiplier)
        this.health = this.maxHealth
        this.speed = stats.speed
        this.gold = stats.gold
        this.heartDamage = stats.heartDamage
        this.dead = false
        this.slowTimer = 0
        this.slowFactor = 1
        this.frozenTimer = 0
        this.healTick = Math.floor(Math.random() * 30)
        this.healPulse = 0

        // direction sheets (right is the default loaded by Sprite)
        this.sheets = { right: this.image }
        for (const dir of ['down', 'up']) {
            const img = new Image()
            img.src = `img/${stats.sheet}_${dir}.png`
            this.sheets[dir] = img
        }
        this.center = {
            x: this.position.x + 50,
            y: this.position.y + 50
        }
        this.velocity = { x: 0, y: 0 }
    }

    draw() {
        super.draw()

        // frost ring while slowed
        if (this.slowTimer > 0 && this.frozenTimer <= 0) {
            c.beginPath()
            c.arc(this.center.x, this.center.y + 18, this.radius * 0.45, 0, Math.PI * 2)
            c.lineWidth = 3
            c.strokeStyle = 'rgba(130, 220, 255, 0.85)'
            c.stroke()
        }

        // solid ice crystal while frozen
        if (this.frozenTimer > 0) {
            c.save()
            c.globalAlpha = 0.65
            c.beginPath()
            c.arc(this.center.x, this.center.y + 10, this.radius * 0.55, 0, Math.PI * 2)
            c.fillStyle = 'rgba(140, 225, 255, 0.45)'
            c.fill()
            c.lineWidth = 3
            c.strokeStyle = 'rgba(220, 250, 255, 0.95)'
            c.stroke()
            // little shine
            c.beginPath()
            c.moveTo(this.center.x - 10, this.center.y)
            c.lineTo(this.center.x + 4, this.center.y - 14)
            c.lineWidth = 2
            c.stroke()
            c.restore()
        }

        // green pulse when the healer heals
        if (this.healPulse > 0) {
            c.beginPath()
            c.arc(
                this.center.x,
                this.center.y + 10,
                this.radius * (1.6 - this.healPulse / 30),
                0,
                Math.PI * 2
            )
            c.lineWidth = 3
            c.strokeStyle = `rgba(90, 255, 120, ${this.healPulse / 30})`
            c.stroke()
        }

        // health bar
        const barWidth = this.width
        const barX = this.position.x + this.offset.x
        const barY = this.position.y + this.offset.y - 12
        c.fillStyle = 'rgba(255, 0, 0, 0.85)'
        c.fillRect(barX, barY, barWidth, 8)
        c.fillStyle = 'rgba(0, 200, 60, 0.95)'
        c.fillRect(barX, barY, (barWidth * this.health) / this.maxHealth, 8)
    }

    update() {
        this.draw()

        // frozen solid: no walking, no animation
        if (this.frozenTimer > 0) {
            this.frozenTimer--
            if (this.healPulse > 0) this.healPulse--
            return
        }

        super.update()

        // healers mend nearby raiders every ~50 frames
        if (this.type === 'healer') {
            this.healTick++
            if (this.healTick >= 50) {
                this.healTick = 0
                let healedSomeone = false
                for (const other of enemies) {
                    if (other.dead || other === this) continue
                    const distance = Math.hypot(
                        other.center.x - this.center.x,
                        other.center.y - this.center.y
                    )
                    if (distance < 170 && other.health < other.maxHealth) {
                        other.health = Math.min(
                            other.maxHealth,
                            other.health + Math.round(other.maxHealth * 0.04)
                        )
                        healedSomeone = true
                        particleBurst(particles, {
                            x: other.center.x,
                            y: other.center.y,
                            count: 3,
                            colors: ['#5aff78', '#c0ffc9'],
                            speed: 1.5,
                            radius: 2,
                            fade: 0.04
                        })
                    }
                }
                if (healedSomeone) this.healPulse = 30
            }
        }
        if (this.healPulse > 0) this.healPulse--

        const waypoint = waypoints[this.waypointIndex]
        const yDistance = waypoint.y - this.center.y
        const xDistance = waypoint.x - this.center.x
        const angle = Math.atan2(yDistance, xDistance)

        if (this.slowTimer > 0) this.slowTimer--
        const effectiveSpeed =
            this.slowTimer > 0 ? this.speed * this.slowFactor : this.speed

        this.velocity.x = Math.cos(angle) * effectiveSpeed
        this.velocity.y = Math.sin(angle) * effectiveSpeed

        this.position.x += this.velocity.x
        this.position.y += this.velocity.y

        // face the direction we walk in
        if (Math.abs(this.velocity.x) >= Math.abs(this.velocity.y)) {
            this.image = this.sheets.right
            this.flip = this.velocity.x < 0
        } else {
            this.image = this.velocity.y > 0 ? this.sheets.down : this.sheets.up
            this.flip = false
        }

        this.center = {
            x: this.position.x + 50,
            y: this.position.y + 50
        }

        if (
            Math.abs(Math.round(this.center.x) - Math.round(waypoint.x)) <
                Math.abs(this.velocity.x) + this.speed &&
            Math.abs(Math.round(this.center.y) - Math.round(waypoint.y)) <
                Math.abs(this.velocity.y) + this.speed &&
            this.waypointIndex < waypoints.length - 1
        ) {
            this.waypointIndex++
        }
    }

    // how far along the path this enemy is, used for tower targeting
    get progress() {
        const waypoint = waypoints[this.waypointIndex]
        const distanceToNext = Math.hypot(
            waypoint.x - this.center.x,
            waypoint.y - this.center.y
        )
        return this.waypointIndex * 10000 - distanceToNext
    }
}
