const TOWER_TYPES = {
    cannon: {
        name: 'Archer',
        imageSrc: './img/tower.png',
        framesMax: 19,
        filter: 'none',
        projectileFilter: 'none',
        projectileOffset: { x: -20, y: -110 },
        levels: [
            { damage: 35, radius: 250, hold: 5, cost: 50 },
            { damage: 55, radius: 290, hold: 4, cost: 75 },
            { damage: 90, radius: 330, hold: 3, cost: 125 }
        ]
    },
    frost: {
        name: 'Frost',
        imageSrc: './img/tower.png',
        framesMax: 19,
        filter: 'hue-rotate(190deg) saturate(1.5) brightness(1.1)',
        projectileFilter: 'hue-rotate(190deg) saturate(2.5) brightness(1.3)',
        projectileOffset: { x: -20, y: -110 },
        levels: [
            { damage: 12, radius: 200, hold: 5, cost: 75, slow: 0.5, slowDuration: 90 },
            { damage: 20, radius: 240, hold: 4, cost: 100, slow: 0.45, slowDuration: 120 },
            { damage: 32, radius: 280, hold: 3, cost: 150, slow: 0.4, slowDuration: 150 }
        ]
    }
}

// kept for older references (placement cost checks etc.)
const TOWER_LEVELS = TOWER_TYPES.cannon.levels

class Building extends Sprite {
    constructor({ position = { x: 0, y: 0 }, tile = null, type = 'cannon' }) {
        super({
            position,
            imageSrc: TOWER_TYPES[type].imageSrc,
            frames: {
                max: TOWER_TYPES[type].framesMax
            },
            offset: {
                x: 0,
                y: -80
            },
            filter: TOWER_TYPES[type].filter
        })

        this.type = type
        this.width = 64 * 2
        this.height = 64
        this.center = {
            x: this.position.x + this.width / 2,
            y: this.position.y + this.height / 2
        }
        this.projectiles = []
        this.level = 1
        this.invested = this.levels[0].cost
        this.tile = tile
        this.target = null
    }

    get levels() {
        return TOWER_TYPES[this.type].levels
    }

    get stats() {
        return this.levels[this.level - 1]
    }

    get radius() {
        return this.stats.radius
    }

    get upgradeCost() {
        return this.level < this.levels.length
            ? this.levels[this.level].cost
            : null
    }

    get sellValue() {
        return Math.floor(this.invested / 2)
    }

    upgrade() {
        if (this.level >= this.levels.length) return false
        this.invested += this.levels[this.level].cost
        this.level++
        return true
    }

    draw() {
        super.draw()

        // level gems above the tower base
        for (let i = 0; i < this.level; i++) {
            c.beginPath()
            c.arc(this.position.x + 22 + i * 14, this.position.y + 70, 5, 0, Math.PI * 2)
            c.fillStyle = ['#ffd700', '#7df9ff', '#ff5cf4'][i]
            c.fill()
            c.lineWidth = 1.5
            c.strokeStyle = 'black'
            c.stroke()
        }
    }

    drawRange(color) {
        const isFrost = this.type === 'frost'
        c.beginPath()
        c.arc(this.center.x, this.center.y, this.radius, 0, Math.PI * 2)
        c.fillStyle =
            color || (isFrost ? 'rgba(120, 220, 255, 0.15)' : 'rgba(80, 160, 255, 0.15)')
        c.fill()
        c.lineWidth = 2
        c.strokeStyle = isFrost
            ? 'rgba(120, 220, 255, 0.5)'
            : 'rgba(80, 160, 255, 0.5)'
        c.stroke()
    }

    update() {
        this.draw()
        this.frames.hold = this.stats.hold
        if (this.target || (!this.target && this.frames.current !== 0))
            super.update()

        // skip the follow-through part of the animation while enemies are
        // in range, so the tower fires noticeably faster
        if (this.target && this.frames.current > 11) this.frames.current = 0

        if (
            this.target &&
            this.frames.current === 6 &&
            this.frames.elapsed % this.frames.hold === 0
        )
            this.shoot()
    }

    shoot() {
        const offset = TOWER_TYPES[this.type].projectileOffset
        this.projectiles.push(
            new Projectile({
                position: {
                    x: this.center.x + offset.x,
                    y: this.center.y + offset.y
                },
                enemy: this.target,
                damage: this.stats.damage,
                slow: this.stats.slow || null,
                slowDuration: this.stats.slowDuration || 0,
                filter: TOWER_TYPES[this.type].projectileFilter
            })
        )
        sfx.play('shoot')
    }
}
