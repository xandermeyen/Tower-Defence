// lightweight particle for deaths, meteors, lightning sparks and nova bursts
class Particle {
    constructor({
        position,
        velocity = { x: 0, y: 0 },
        color = 'white',
        radius = 3,
        gravity = 0,
        friction = 0.98,
        fade = 0.025
    }) {
        this.position = { x: position.x, y: position.y }
        this.velocity = { x: velocity.x, y: velocity.y }
        this.color = color
        this.radius = radius
        this.gravity = gravity
        this.friction = friction
        this.fade = fade
        this.alpha = 1
    }

    update() {
        this.velocity.x *= this.friction
        this.velocity.y *= this.friction
        this.velocity.y += this.gravity
        this.position.x += this.velocity.x
        this.position.y += this.velocity.y
        this.alpha -= this.fade

        c.save()
        c.globalAlpha = Math.max(this.alpha, 0)
        c.beginPath()
        c.arc(this.position.x, this.position.y, Math.max(this.radius, 0.5), 0, Math.PI * 2)
        c.fillStyle = this.color
        c.fill()
        c.restore()
    }
}

// helper: spawn a burst of particles into a target array
function particleBurst(arr, { x, y, count = 10, colors = ['white'], speed = 4, radius = 3, gravity = 0, fade = 0.03 }) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const power = Math.random() * speed
        arr.push(
            new Particle({
                position: { x, y },
                velocity: { x: Math.cos(angle) * power, y: Math.sin(angle) * power },
                color: colors[Math.floor(Math.random() * colors.length)],
                radius: radius * (0.5 + Math.random()),
                gravity,
                fade: fade * (0.7 + Math.random() * 0.6)
            })
        )
    }
}
