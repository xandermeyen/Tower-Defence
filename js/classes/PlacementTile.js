class PlacementTile {
    constructor({ position = { x: 0, y: 0 } }) {
        this.position = position
        this.size = 64
        this.color = 'rgba(255, 255, 255, 0.15)'
        this.isOccupied = false
    }

    draw() {
        c.fillStyle = this.color
        c.fillRect(this.position.x, this.position.y, this.size, this.size)
    }

    update(mouse, coins, buildCost = TOWER_LEVELS[0].cost) {
        this.draw()
        if (
            mouse.x > this.position.x &&
            mouse.x < this.position.x + this.size &&
            mouse.y > this.position.y &&
            mouse.y < this.position.y + this.size
        ) {
            if (this.isOccupied) {
                this.color = 'rgba(255, 255, 255, 0.4)'
            } else if (coins >= buildCost) {
                this.color = 'rgba(120, 255, 120, 0.6)'
            } else {
                this.color = 'rgba(255, 80, 80, 0.6)'
            }
        } else this.color = 'rgba(255, 255, 255, 0.15)'
    }
}
