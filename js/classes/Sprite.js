class Sprite {
    constructor({
        position = { x: 0, y: 0 },
        imageSrc,
        frames = { max: 1 },
        offset = { x: 0, y: 0 },
        scale = 1,
        filter = 'none',
        flip = false
    }) {
        this.position = position
        this.image = new Image()
        this.image.src = imageSrc
        this.frames = {
            max: frames.max,
            current: 0,
            elapsed: 0,
            hold: 5
        }
        this.offset = offset
        this.scale = scale
        this.filter = filter
        this.flip = flip
    }

    draw() {
        const cropWidth = this.image.width / this.frames.max
        const crop = {
            position: {
                x: cropWidth * this.frames.current,
                y: 0
            },
            width: cropWidth,
            height: this.image.height
        }

        const drawX = this.position.x + this.offset.x
        const drawY = this.position.y + this.offset.y
        const drawWidth = crop.width * this.scale
        const drawHeight = crop.height * this.scale

        if (this.filter !== 'none') c.filter = this.filter
        if (this.flip) {
            c.save()
            // mirror around the sprite's horizontal center
            c.translate(drawX + drawWidth / 2, 0)
            c.scale(-1, 1)
            c.translate(-(drawX + drawWidth / 2), 0)
        }
        c.drawImage(
            this.image,
            crop.position.x,
            crop.position.y,
            crop.width,
            crop.height,
            drawX,
            drawY,
            drawWidth,
            drawHeight
        )
        if (this.flip) c.restore()
        if (this.filter !== 'none') c.filter = 'none'
    }

    update() {
        // animation
        this.frames.elapsed++
        if (this.frames.elapsed % this.frames.hold === 0) {
            this.frames.current++
            if (this.frames.current >= this.frames.max) {
                this.frames.current = 0
            }
        }
    }
}
