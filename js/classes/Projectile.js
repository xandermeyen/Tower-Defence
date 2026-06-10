class Projectile extends Sprite {
    constructor({
        position = { x: 0, y: 0 },
        enemy,
        damage = 20,
        slow = null,
        slowDuration = 0,
        filter = 'none'
    }) {
        super({ position, imageSrc: 'img/projectile.png', filter })
        this.velocity = { x: 0, y: 0 }
        this.enemy = enemy
        this.damage = damage
        this.slow = slow
        this.slowDuration = slowDuration
        this.radius = 10
        // snapshot of where we are flying to, keeps working if the enemy dies
        this.target = { x: enemy.center.x, y: enemy.center.y }
    }

    update() {
        this.draw()

        if (!this.enemy.dead) {
            this.target = { x: this.enemy.center.x, y: this.enemy.center.y }
        }

        const angle = Math.atan2(
            this.target.y - this.position.y,
            this.target.x - this.position.x
        )

        const power = 8
        this.velocity.x = Math.cos(angle) * power
        this.velocity.y = Math.sin(angle) * power

        this.position.x += this.velocity.x
        this.position.y += this.velocity.y
    }
}
