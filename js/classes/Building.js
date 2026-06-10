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
    },
    tesla: {
        name: 'Tesla',
        imageSrc: './img/mage_tower.png',
        framesMax: 19,
        filter: 'hue-rotate(250deg) saturate(1.4)',
        projectileFilter: 'none',
        projectileOffset: { x: -20, y: -110 },
        levels: [
            { damage: 45, radius: 220, hold: 6, cost: 100, chains: 2, chainRange: 220 },
            { damage: 70, radius: 250, hold: 5, cost: 150, chains: 3, chainRange: 240 },
            { damage: 110, radius: 280, hold: 4, cost: 225, chains: 4, chainRange: 260 }
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
        const palette = {
            cannon: ['rgba(80, 160, 255, 0.15)', 'rgba(80, 160, 255, 0.5)'],
            frost: ['rgba(120, 220, 255, 0.15)', 'rgba(120, 220, 255, 0.5)'],
            tesla: ['rgba(178, 102, 255, 0.15)', 'rgba(178, 102, 255, 0.5)']
        }
        const [fill, stroke] = palette[this.type] || palette.cannon
        c.beginPath()
        c.arc(this.center.x, this.center.y, this.radius, 0, Math.PI * 2)
        c.fillStyle = color || fill
        c.fill()
        c.lineWidth = 2
        c.strokeStyle = stroke
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
        if (this.type === 'tesla') {
            this.shootLightning()
            return
        }

        // archer towers can land critical hits
        let damage = this.stats.damage
        let crit = false
        if (this.type === 'cannon' && Math.random() < 0.15) {
            damage *= 2
            crit = true
        }

        const offset = TOWER_TYPES[this.type].projectileOffset
        this.projectiles.push(
            new Projectile({
                position: {
                    x: this.center.x + offset.x,
                    y: this.center.y + offset.y
                },
                enemy: this.target,
                damage,
                crit,
                slow: this.stats.slow || null,
                slowDuration: this.stats.slowDuration || 0,
                filter: TOWER_TYPES[this.type].projectileFilter
            })
        )
        sfx.play('shoot')
    }

    // instant chain lightning, jumps to nearby enemies with falling damage
    shootLightning() {
        if (!this.target || this.target.dead) return

        const hits = [this.target]
        let last = this.target
        while (hits.length < this.stats.chains) {
            let next = null
            let bestDistance = this.stats.chainRange
            for (const enemy of enemies) {
                if (enemy.dead || hits.includes(enemy)) continue
                const distance = Math.hypot(
                    enemy.center.x - last.center.x,
                    enemy.center.y - last.center.y
                )
                if (distance < bestDistance) {
                    bestDistance = distance
                    next = enemy
                }
            }
            if (!next) break
            hits.push(next)
            last = next
        }

        // bolt from the tower top to the first enemy, then enemy to enemy
        let from = { x: this.center.x, y: this.center.y - 90 }
        hits.forEach((enemy, i) => {
            const to = { x: enemy.center.x, y: enemy.center.y }
            lightningBolts.push(new LightningBolt(from, to))
            particleBurst(particles, {
                x: to.x,
                y: to.y,
                count: 5,
                colors: ['#f4ecff', '#b266ff', '#7df9ff'],
                speed: 3,
                radius: 2,
                fade: 0.06
            })
            // each jump deals 75% of the previous hit
            const damage = Math.round(this.stats.damage * Math.pow(0.75, i))
            damageEnemy(enemy, damage, i === 0 ? 'white' : '#caa6ff')
            from = to
        })

        sfx.play('lightning')
    }
}
