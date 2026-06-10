// jagged lightning bolt between two points, fades out over a few frames
class LightningBolt {
    constructor(from, to) {
        this.from = { x: from.x, y: from.y }
        this.to = { x: to.x, y: to.y }
        this.life = 14
        this.maxLife = 14
        this.points = this.generate()
    }

    generate() {
        const points = [{ x: this.from.x, y: this.from.y }]
        const segments = 8
        const dx = this.to.x - this.from.x
        const dy = this.to.y - this.from.y
        const length = Math.hypot(dx, dy)
        // perpendicular direction for the jitter
        const nx = -dy / (length || 1)
        const ny = dx / (length || 1)

        for (let i = 1; i < segments; i++) {
            const t = i / segments
            const wobble = (Math.random() - 0.5) * length * 0.22
            points.push({
                x: this.from.x + dx * t + nx * wobble,
                y: this.from.y + dy * t + ny * wobble
            })
        }
        points.push({ x: this.to.x, y: this.to.y })
        return points
    }

    update() {
        this.life--
        // re-jitter every few frames so the bolt flickers
        if (this.life % 4 === 0) this.points = this.generate()

        const alpha = Math.max(this.life / this.maxLife, 0)
        c.save()
        c.lineJoin = 'round'
        c.lineCap = 'round'

        // outer glow
        c.globalAlpha = alpha * 0.45
        c.strokeStyle = '#b266ff'
        c.lineWidth = 6
        this.trace()

        // bright core
        c.globalAlpha = alpha
        c.strokeStyle = '#f4ecff'
        c.lineWidth = 2
        this.trace()

        c.restore()
    }

    trace() {
        c.beginPath()
        c.moveTo(this.points[0].x, this.points[0].y)
        for (let i = 1; i < this.points.length; i++) {
            c.lineTo(this.points[i].x, this.points[i].y)
        }
        c.stroke()
    }
}
