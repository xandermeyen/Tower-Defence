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
    }
}

class Enemy extends Sprite {
    constructor({ position = { x: 0, y: 0 }, type = 'orc', healthMultiplier = 1 }) {
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
        this.waypointIndex = 0
        this.radius = 50 * stats.scale
        this.maxHealth = Math.round(stats.health * healthMultiplier)
        this.health = this.maxHealth
        this.speed = stats.speed
        this.gold = stats.gold
        this.heartDamage = stats.heartDamage
        this.dead = false
        this.slowTimer = 0
        this.slowFactor = 1

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
        if (this.slowTimer > 0) {
            c.beginPath()
            c.arc(this.center.x, this.center.y + 18, this.radius * 0.45, 0, Math.PI * 2)
            c.lineWidth = 3
            c.strokeStyle = 'rgba(130, 220, 255, 0.85)'
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
        super.update()

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
