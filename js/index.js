const canvas = document.querySelector('canvas')
const c = canvas.getContext('2d')

canvas.width = 1280
canvas.height = 768

// ----- placement tiles -----
const placementTilesData2D = []
for (let i = 0; i < placementTilesData.length; i += 20) {
    placementTilesData2D.push(placementTilesData.slice(i, i + 20))
}

const placementTiles = []
placementTilesData2D.forEach((row, y) => {
    row.forEach((symbol, x) => {
        if (symbol === 14) {
            placementTiles.push(
                new PlacementTile({
                    position: { x: x * 64, y: y * 64 }
                })
            )
        }
    })
})

// ----- difficulty -----
const DIFFICULTIES = {
    easy: {
        label: 'Easy', coins: 150, hearts: 10,
        waveBase: 1, speedyFrom: 4, tankFrom: 6,
        hpLinear: 0.1, hpExp: 1.08, bonusBase: 30, bonusPerWave: 8
    },
    normal: {
        label: 'Normal', coins: 125, hearts: 10,
        waveBase: 2, speedyFrom: 3, tankFrom: 5,
        hpLinear: 0.12, hpExp: 1.1, bonusBase: 25, bonusPerWave: 6
    },
    hard: {
        label: 'Hard', coins: 100, hearts: 7,
        waveBase: 3, speedyFrom: 3, tankFrom: 4,
        hpLinear: 0.15, hpExp: 1.12, bonusBase: 20, bonusPerWave: 5
    }
}
let difficulty = DIFFICULTIES.normal

// ----- game state -----
let state = 'menu' // menu | playing | gameover
let paused = false
let gameSpeed = 1
let hearts = 10
let coins = 150
let wave = 0
let kills = 0
let goldEarned = 0

const enemies = []
const buildings = []
const explosions = []
const floatingTexts = []
const particles = []
const lightningBolts = []
const meteors = []
const spawnQueue = []
let spawnTimer = 0
let waveCountdown = 0
let activeTile = undefined
let selectedBuilding = null
const shake = { duration: 0, intensity: 5 }

const mouse = { x: undefined, y: undefined }
let frameCount = 0

// ----- DOM -----
const el = (id) => document.getElementById(id)
const ui = {
    coins: el('coins'),
    hearts: el('hearts'),
    wave: el('wave'),
    banner: el('banner'),
    bannerSub: el('bannerSub'),
    startScreen: el('startScreen'),
    gameOver: el('gameOver'),
    finalStats: el('finalStats'),
    pausedOverlay: el('pausedOverlay'),
    towerPanel: el('towerPanel'),
    towerInfo: el('towerInfo'),
    towerTitle: el('towerTitle'),
    upgradeBtn: el('upgradeBtn'),
    sellBtn: el('sellBtn'),
    speedBtn: el('speedBtn'),
    muteBtn: el('muteBtn'),
    shopCannon: el('shopCannon'),
    shopFrost: el('shopFrost'),
    shopTesla: el('shopTesla'),
    spellMeteor: el('spellMeteor'),
    spellNova: el('spellNova'),
    bestScore: el('bestScore')
}

let selectedTowerType = 'cannon'

function refreshShop() {
    const buttons = { cannon: ui.shopCannon, frost: ui.shopFrost, tesla: ui.shopTesla }
    for (const [type, btn] of Object.entries(buttons)) {
        btn.classList.toggle('selected', selectedTowerType === type)
        btn.disabled = coins < TOWER_TYPES[type].levels[0].cost
    }
}

function selectTowerType(type) {
    selectedTowerType = type
    refreshShop()
}

ui.shopCannon.addEventListener('click', () => selectTowerType('cannon'))
ui.shopFrost.addEventListener('click', () => selectTowerType('frost'))
ui.shopTesla.addEventListener('click', () => selectTowerType('tesla'))

function updateHUD() {
    ui.coins.innerHTML = coins
    ui.hearts.innerHTML = hearts
    ui.wave.innerHTML = wave
    refreshShop()
}

let bannerTimeout
function showBanner(text, sub = '', duration = 2500) {
    ui.banner.firstElementChild.innerHTML = text
    ui.bannerSub.innerHTML = sub
    ui.banner.style.opacity = 1
    clearTimeout(bannerTimeout)
    if (duration > 0) {
        bannerTimeout = setTimeout(() => (ui.banner.style.opacity = 0), duration)
    }
}

// ----- tower panel -----
function refreshTowerPanel() {
    if (!selectedBuilding) {
        ui.towerPanel.style.display = 'none'
        return
    }
    const b = selectedBuilding
    ui.towerPanel.style.display = 'block'
    ui.towerTitle.innerHTML = TOWER_TYPES[b.type].name.toUpperCase() + ' TOWER'
    ui.towerInfo.innerHTML =
        `Level ${b.level} &nbsp;|&nbsp; Damage ${b.stats.damage} &nbsp;|&nbsp; Range ${b.radius}` +
        (b.stats.slow
            ? `<br>Slows enemies to ${Math.round(b.stats.slow * 100)}% speed`
            : '')
    if (b.upgradeCost !== null) {
        ui.upgradeBtn.style.display = 'inline-block'
        ui.upgradeBtn.innerHTML = `Upgrade (${b.upgradeCost})`
        ui.upgradeBtn.disabled = coins < b.upgradeCost
    } else {
        ui.upgradeBtn.style.display = 'none'
    }
    ui.sellBtn.innerHTML = `Sell (+${b.sellValue})`
}

ui.upgradeBtn.addEventListener('click', () => {
    const b = selectedBuilding
    if (!b || b.upgradeCost === null || coins < b.upgradeCost) return
    coins -= b.upgradeCost
    b.upgrade()
    sfx.play('upgrade')
    floatingTexts.push(
        new FloatingText({
            position: { x: b.center.x - 30, y: b.center.y - 60 },
            text: 'LEVEL UP!',
            color: '#7df9ff',
            size: 22
        })
    )
    updateHUD()
    refreshTowerPanel()
})

ui.sellBtn.addEventListener('click', () => {
    const b = selectedBuilding
    if (!b) return
    coins += b.sellValue
    goldEarned += b.sellValue
    if (b.tile) b.tile.isOccupied = false
    buildings.splice(buildings.indexOf(b), 1)
    selectedBuilding = null
    sfx.play('sell')
    updateHUD()
    refreshTowerPanel()
})

// ----- spells -----
const SPELLS = {
    meteor: { cooldown: 2400, timer: 0, btn: () => ui.spellMeteor, label: '&#9732; Meteor' },
    nova: { cooldown: 1800, timer: 0, btn: () => ui.spellNova, label: '&#10052; Nova' }
}
let meteorTargeting = false

function refreshSpellBar() {
    for (const [name, spell] of Object.entries(SPELLS)) {
        const btn = spell.btn()
        if (spell.timer > 0) {
            btn.disabled = true
            btn.innerHTML = `${spell.label}<br><span>${Math.ceil(spell.timer / 60)}s</span>`
        } else {
            btn.disabled = false
            btn.innerHTML =
                `${spell.label}<br><span>${name === 'meteor' ? 'Q' : 'E'}</span>`
        }
    }
    ui.spellMeteor.classList.toggle('targeting', meteorTargeting)
}

function castMeteor() {
    if (SPELLS.meteor.timer > 0 || state !== 'playing') return
    meteorTargeting = !meteorTargeting
    refreshSpellBar()
}

function launchMeteor(x, y) {
    meteorTargeting = false
    SPELLS.meteor.timer = SPELLS.meteor.cooldown
    meteors.push({
        position: { x: x + 260, y: -120 },
        target: { x, y },
        speed: 14
    })
    sfx.play('meteorLaunch')
    refreshSpellBar()
}

function castNova() {
    if (SPELLS.nova.timer > 0 || state !== 'playing') return
    SPELLS.nova.timer = SPELLS.nova.cooldown
    for (const enemy of enemies) {
        enemy.frozenTimer = 210
        particleBurst(particles, {
            x: enemy.center.x,
            y: enemy.center.y,
            count: 8,
            colors: ['#bfeeff', '#7df9ff', 'white'],
            speed: 3,
            radius: 2.5,
            fade: 0.03
        })
    }
    shake.duration = 8
    sfx.play('nova')
    showBanner('FROST NOVA', 'The horde is frozen solid!', 1500)
    refreshSpellBar()
}

ui.spellMeteor.addEventListener('click', castMeteor)
ui.spellNova.addEventListener('click', castNova)

// damage + kill bookkeeping in one place (towers, lightning and meteors use this)
function damageEnemy(enemy, damage, color = 'white', size = 16) {
    if (enemy.dead) return
    enemy.health -= damage
    floatingTexts.push(
        new FloatingText({
            position: {
                x: enemy.center.x + (Math.random() - 0.5) * 30,
                y: enemy.center.y - 30
            },
            text: damage,
            color,
            size
        })
    )
    if (enemy.health <= 0) {
        const index = enemies.indexOf(enemy)
        if (index > -1) killEnemy(enemy, index)
    }
}

// ----- waves -----
function buildWaveQueue(waveNumber) {
    const queue = []
    const normals = difficulty.waveBase + waveNumber * 2
    const speedies =
        waveNumber >= difficulty.speedyFrom ? Math.floor(waveNumber * 0.6) : 0
    const tanks =
        waveNumber >= difficulty.tankFrom
            ? Math.max(1, Math.floor(waveNumber / 2) - 2)
            : 0
    const bosses = waveNumber % 5 === 0 ? waveNumber / 5 : 0
    const healers = waveNumber >= 4 ? Math.floor(waveNumber / 3) : 0
    const splitters = waveNumber >= 6 ? Math.floor(waveNumber / 4) : 0

    for (let i = 0; i < normals; i++) queue.push('orc')
    for (let i = 0; i < speedies; i++) queue.push('speedy')
    for (let i = 0; i < tanks; i++) queue.push('tank')
    for (let i = 0; i < healers; i++) queue.push('healer')
    for (let i = 0; i < splitters; i++) queue.push('splitter')

    // shuffle the regular enemies
    for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[queue[i], queue[j]] = [queue[j], queue[i]]
    }
    // bosses always arrive last
    for (let i = 0; i < bosses; i++) queue.push('boss')
    return queue
}

function startWave() {
    wave++
    spawnQueue.push(...buildWaveQueue(wave))
    spawnTimer = 0
    sfx.play('wave')
    const isBossWave = wave % 5 === 0
    showBanner(
        isBossWave ? `WAVE ${wave} &mdash; BOSS!` : `WAVE ${wave}`,
        isBossWave ? 'Something big is coming...' : ''
    )
    updateHUD()
}

function spawnEnemy(type) {
    enemies.push(
        new Enemy({
            position: {
                x: waypoints[0].x - 100,
                y: waypoints[0].y - 50
            },
            type,
            // gentle at the start, exponential later so the endgame stays a challenge
            healthMultiplier:
                1 +
                (wave - 1) * difficulty.hpLinear +
                Math.pow(difficulty.hpExp, wave - 1) -
                1
        })
    )
}

function killEnemy(enemy, index) {
    enemy.dead = true
    enemies.splice(index, 1)
    coins += enemy.gold
    goldEarned += enemy.gold
    kills++
    sfx.play('death')

    // death poof + a few gold sparks
    particleBurst(particles, {
        x: enemy.center.x,
        y: enemy.center.y,
        count: 10,
        colors: ['#999', '#ccc', '#666'],
        speed: 3,
        radius: 3,
        fade: 0.04
    })
    particleBurst(particles, {
        x: enemy.center.x,
        y: enemy.center.y - 10,
        count: 4,
        colors: ['gold', '#ffe97d'],
        speed: 2.5,
        radius: 2,
        gravity: 0.08,
        fade: 0.025
    })

    // splitters burst into two angry minis
    if (enemy.type === 'splitter') {
        for (let k = 0; k < 2; k++) {
            enemies.push(
                new Enemy({
                    position: {
                        x: enemy.position.x + (k === 0 ? -30 : 30),
                        y: enemy.position.y + (k === 0 ? -12 : 12)
                    },
                    type: 'mini',
                    waypointIndex: enemy.waypointIndex,
                    healthOverride: Math.max(20, Math.round(enemy.maxHealth * 0.2))
                })
            )
        }
        sfx.play('split')
        floatingTexts.push(
            new FloatingText({
                position: { x: enemy.center.x - 25, y: enemy.center.y - 50 },
                text: 'SPLIT!',
                color: '#caa6ff',
                size: 20
            })
        )
    }
    floatingTexts.push(
        new FloatingText({
            position: { x: enemy.center.x - 15, y: enemy.center.y - 40 },
            text: `+${enemy.gold}`,
            color: 'gold',
            size: 20
        })
    )
    updateHUD()
}

// ----- high score -----
function loadBest() {
    try {
        return JSON.parse(localStorage.getItem('orcSiegeBest')) || null
    } catch {
        return null
    }
}

function showBest() {
    const best = loadBest()
    ui.bestScore.innerHTML = best
        ? `Best run: wave <b>${best.wave}</b> on ${best.difficulty}`
        : ''
}

function gameOver() {
    state = 'gameover'
    sfx.play('gameover')

    const best = loadBest()
    let recordLine = ''
    if (!best || wave > best.wave) {
        localStorage.setItem(
            'orcSiegeBest',
            JSON.stringify({ wave, difficulty: difficulty.label })
        )
        recordLine = `<br><span style="color: gold">NEW RECORD!</span>`
    } else {
        recordLine = `<br><span style="color: #888">Best: wave ${best.wave} on ${best.difficulty}</span>`
    }

    ui.finalStats.innerHTML =
        `You survived <b>${wave}</b> waves on ${difficulty.label}<br>` +
        `${kills} enemies slain &nbsp;&bull;&nbsp; ${goldEarned} gold earned` +
        recordLine
    ui.gameOver.style.display = 'flex'
}

// ----- main loop -----
function step() {
    c.save()
    if (shake.duration > 0) {
        shake.duration--
        c.translate(
            (Math.random() - 0.5) * shake.intensity * 2,
            (Math.random() - 0.5) * shake.intensity * 2
        )
    }

    c.drawImage(mapImage, 0, 0)

    // spawning
    if (spawnQueue.length > 0) {
        spawnTimer--
        if (spawnTimer <= 0) {
            const type = spawnQueue.shift()
            spawnEnemy(type)
            spawnTimer = type === 'boss' ? 90 : 35
        }
    }

    // enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i]
        enemy.update()

        if (enemy.position.x > canvas.width) {
            hearts -= enemy.heartDamage
            enemy.dead = true
            enemies.splice(i, 1)
            shake.duration = 14
            sfx.play('leak')
            updateHUD()

            if (hearts <= 0) {
                hearts = 0
                updateHUD()
                gameOver()
                c.restore()
                return
            }
        }
    }

    // wave cleared
    if (spawnQueue.length === 0 && enemies.length === 0) {
        if (waveCountdown <= 0) {
            if (wave > 0) {
                const bonus = difficulty.bonusBase + wave * difficulty.bonusPerWave
                coins += bonus
                goldEarned += bonus
                showBanner(`Wave ${wave} cleared!`, `+${bonus} bonus gold`, 0)
                updateHUD()
            }
            waveCountdown = 240
        } else {
            waveCountdown--
            if (waveCountdown < 180) {
                ui.bannerSub.innerHTML =
                    `Next wave in ${Math.ceil(waveCountdown / 60)}... (N to skip)`
            }
            if (waveCountdown <= 0) startWave()
        }
    }

    // placement tiles
    const buildCost = TOWER_TYPES[selectedTowerType].levels[0].cost
    placementTiles.forEach((tile) => {
        tile.update(mouse, coins, buildCost)
    })

    // range indicators
    if (selectedBuilding) selectedBuilding.drawRange()
    if (activeTile && activeTile.isOccupied) {
        const hovered = buildings.find((b) => b.tile === activeTile)
        if (hovered && hovered !== selectedBuilding)
            hovered.drawRange('rgba(255, 255, 255, 0.08)')
    }

    // buildings & projectiles
    buildings.forEach((building) => {
        building.update()
        building.target = null
        const validEnemies = enemies.filter((enemy) => {
            const distance = Math.hypot(
                enemy.center.x - building.center.x,
                enemy.center.y - building.center.y
            )
            return distance < enemy.radius + building.radius
        })
        // target the enemy furthest along the path
        if (validEnemies.length > 0) {
            building.target = validEnemies.reduce((best, enemy) =>
                enemy.progress > best.progress ? enemy : best
            )
        }

        for (let i = building.projectiles.length - 1; i >= 0; i--) {
            const projectile = building.projectiles[i]
            projectile.update()

            // out of bounds cleanup (top margin is large because towers
            // on the top row launch projectiles from above the canvas)
            if (
                projectile.position.x < -150 ||
                projectile.position.x > canvas.width + 150 ||
                projectile.position.y < -170 ||
                projectile.position.y > canvas.height + 150
            ) {
                building.projectiles.splice(i, 1)
                continue
            }

            const enemy = projectile.enemy
            const hitRadius =
                (enemy.dead ? 12 : enemy.radius) + projectile.radius
            const distance = Math.hypot(
                projectile.target.x - projectile.position.x,
                projectile.target.y - projectile.position.y
            )

            if (distance < hitRadius) {
                if (!enemy.dead) {
                    if (projectile.slow) {
                        enemy.slowTimer = projectile.slowDuration
                        enemy.slowFactor = projectile.slow
                    }
                    sfx.play(projectile.crit ? 'crit' : 'hit')
                    if (projectile.crit) {
                        floatingTexts.push(
                            new FloatingText({
                                position: {
                                    x: enemy.center.x - 20,
                                    y: enemy.center.y - 55
                                },
                                text: 'CRIT!',
                                color: '#ff9d2e',
                                size: 20
                            })
                        )
                    }
                    damageEnemy(
                        enemy,
                        projectile.damage,
                        projectile.crit ? '#ff9d2e' : 'white',
                        projectile.crit ? 20 : 16
                    )
                }
                explosions.push(
                    new Sprite({
                        position: {
                            x: projectile.position.x,
                            y: projectile.position.y
                        },
                        imageSrc: './img/explosion.png',
                        frames: { max: 4 },
                        offset: { x: 0, y: 0 },
                        // frost impacts get an icy blue tint
                        filter: projectile.slow
                            ? 'hue-rotate(180deg) saturate(1.5)'
                            : 'none'
                    })
                )
                building.projectiles.splice(i, 1)
            }
        }
    })

    // meteors
    for (let i = meteors.length - 1; i >= 0; i--) {
        const meteor = meteors[i]
        const angle = Math.atan2(
            meteor.target.y - meteor.position.y,
            meteor.target.x - meteor.position.x
        )
        meteor.position.x += Math.cos(angle) * meteor.speed
        meteor.position.y += Math.sin(angle) * meteor.speed

        // fiery trail
        particleBurst(particles, {
            x: meteor.position.x,
            y: meteor.position.y,
            count: 3,
            colors: ['#ff6b35', '#ffb627', '#fff3b0'],
            speed: 1.5,
            radius: 4,
            fade: 0.06
        })

        // the rock itself
        c.beginPath()
        c.arc(meteor.position.x, meteor.position.y, 14, 0, Math.PI * 2)
        c.fillStyle = '#5a3825'
        c.fill()
        c.lineWidth = 4
        c.strokeStyle = '#ff8c42'
        c.stroke()

        // impact
        if (
            Math.hypot(
                meteor.target.x - meteor.position.x,
                meteor.target.y - meteor.position.y
            ) < meteor.speed
        ) {
            meteors.splice(i, 1)
            shake.duration = 22
            sfx.play('meteorImpact')
            particleBurst(particles, {
                x: meteor.target.x,
                y: meteor.target.y,
                count: 40,
                colors: ['#ff6b35', '#ffb627', '#fff3b0', '#777'],
                speed: 8,
                radius: 4,
                gravity: 0.12,
                fade: 0.025
            })
            for (let j = enemies.length - 1; j >= 0; j--) {
                const enemy = enemies[j]
                const distance = Math.hypot(
                    enemy.center.x - meteor.target.x,
                    enemy.center.y - meteor.target.y
                )
                if (distance < 150 + enemy.radius * 0.4) {
                    damageEnemy(enemy, 260, '#ff9d2e', 20)
                }
            }
        }
    }

    // meteor targeting reticle
    if (meteorTargeting && mouse.x !== undefined) {
        c.beginPath()
        c.arc(mouse.x, mouse.y, 150, 0, Math.PI * 2)
        c.fillStyle = 'rgba(255, 110, 40, 0.15)'
        c.fill()
        c.setLineDash([12, 8])
        c.lineWidth = 3
        c.strokeStyle = 'rgba(255, 140, 66, 0.9)'
        c.stroke()
        c.setLineDash([])
    }

    // lightning bolts
    for (let i = lightningBolts.length - 1; i >= 0; i--) {
        lightningBolts[i].update()
        if (lightningBolts[i].life <= 0) lightningBolts.splice(i, 1)
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update()
        if (particles[i].alpha <= 0) particles.splice(i, 1)
    }

    // spell cooldowns
    let spellTicked = false
    for (const spell of Object.values(SPELLS)) {
        if (spell.timer > 0) {
            spell.timer--
            spellTicked = true
        }
    }
    if (spellTicked && frameCount % 15 === 0) refreshSpellBar()
    frameCount++

    // explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i]
        explosion.draw()
        explosion.update()
        if (explosion.frames.current >= explosion.frames.max - 1) {
            explosions.splice(i, 1)
        }
    }

    // floating text
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update()
        if (floatingTexts[i].alpha <= 0) floatingTexts.splice(i, 1)
    }

    c.restore()
}

function animate() {
    requestAnimationFrame(animate)
    if (state !== 'playing' || paused) return
    for (let s = 0; s < gameSpeed; s++) {
        step()
        if (state !== 'playing') break
    }
}

// ----- input -----
function setMousePosition(event) {
    const rect = canvas.getBoundingClientRect()
    mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width)
    mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height)
}

canvas.addEventListener('click', (event) => {
    if (state !== 'playing') return
    setMousePosition(event)

    // meteor targeting takes priority over building
    if (meteorTargeting) {
        launchMeteor(mouse.x, mouse.y)
        return
    }

    if (activeTile && !activeTile.isOccupied) {
        const cost = TOWER_TYPES[selectedTowerType].levels[0].cost
        if (coins >= cost) {
            coins -= cost
            const building = new Building({
                position: { ...activeTile.position },
                tile: activeTile,
                type: selectedTowerType
            })
            buildings.push(building)
            activeTile.isOccupied = true
            buildings.sort((a, b) => a.position.y - b.position.y)
            selectedBuilding = building
            sfx.play('build')
            updateHUD()
        }
    } else if (activeTile && activeTile.isOccupied) {
        selectedBuilding = buildings.find((b) => b.tile === activeTile) || null
    } else {
        selectedBuilding = null
    }
    refreshTowerPanel()
})

window.addEventListener('mousemove', (event) => {
    setMousePosition(event)
    activeTile = null
    for (let i = 0; i < placementTiles.length; i++) {
        const tile = placementTiles[i]
        if (
            mouse.x > tile.position.x &&
            mouse.x < tile.position.x + tile.size &&
            mouse.y > tile.position.y &&
            mouse.y < tile.position.y + tile.size
        ) {
            activeTile = tile
            break
        }
    }
})

window.addEventListener('keydown', (event) => {
    if (state !== 'playing') return
    switch (event.key.toLowerCase()) {
        case 'p':
            togglePause()
            break
        case 'm':
            toggleMute()
            break
        case 'f':
            toggleSpeed()
            break
        case 'n':
            if (waveCountdown > 0 && enemies.length === 0 && spawnQueue.length === 0) {
                waveCountdown = 1
            }
            break
        case '1':
            selectTowerType('cannon')
            break
        case '2':
            selectTowerType('frost')
            break
        case '3':
            selectTowerType('tesla')
            break
        case 'q':
            castMeteor()
            break
        case 'e':
            castNova()
            break
        case 'escape':
            meteorTargeting = false
            refreshSpellBar()
            break
    }
})

function togglePause() {
    paused = !paused
    ui.pausedOverlay.style.display = paused ? 'flex' : 'none'
}

function toggleMute() {
    sfx.muted = !sfx.muted
    ui.muteBtn.innerHTML = sfx.muted ? '&#128263;' : '&#128266;'
}

function toggleSpeed() {
    gameSpeed = gameSpeed === 1 ? 2 : 1
    ui.speedBtn.innerHTML = gameSpeed + 'x'
}

el('pauseBtn').addEventListener('click', togglePause)
el('resumeBtn').addEventListener('click', togglePause)
ui.muteBtn.addEventListener('click', toggleMute)
ui.speedBtn.addEventListener('click', toggleSpeed)
function startGame(difficultyKey) {
    difficulty = DIFFICULTIES[difficultyKey]
    coins = difficulty.coins
    hearts = difficulty.hearts
    sfx.init()
    ui.startScreen.style.display = 'none'
    state = 'playing'
    waveCountdown = 300
    showBanner('Get ready!', 'Click the green tiles to build towers')
    updateHUD()
    refreshSpellBar()
}

el('startEasy').addEventListener('click', () => startGame('easy'))
el('startNormal').addEventListener('click', () => startGame('normal'))
el('startHard').addEventListener('click', () => startGame('hard'))
el('restartBtn').addEventListener('click', () => location.reload())

// ----- boot -----
const mapImage = new Image()
mapImage.onload = () => {
    c.drawImage(mapImage, 0, 0)
    animate()
}
mapImage.src = 'img/TowerDefMap.png'
updateHUD()
showBest()
