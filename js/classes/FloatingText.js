class FloatingText {
    constructor({ position, text, color = 'white', size = 18 }) {
        this.position = { x: position.x, y: position.y }
        this.text = text
        this.color = color
        this.size = size
        this.alpha = 1
    }

    update() {
        this.position.y -= 0.8
        this.alpha -= 0.02

        c.save()
        c.globalAlpha = Math.max(this.alpha, 0)
        c.font = `${this.size}px 'Changa One', sans-serif`
        c.fillStyle = this.color
        c.lineWidth = 3
        c.strokeStyle = 'rgba(0, 0, 0, 0.7)'
        c.strokeText(this.text, this.position.x, this.position.y)
        c.fillText(this.text, this.position.x, this.position.y)
        c.restore()
    }
}
