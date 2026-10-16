/**
 * ==============================================================================
 * NEON EVASION - ENGINE & ATTACK SCRIPT
 * ==============================================================================
 * DEAR NEXT DEVELOPER / AI:
 * This game runs on a 60 FPS frame-based system. 
 * The `frameCount` (variable `t` in attack functions) dictates exactly when 
 * attacks happen. 60 frames = 1 second.
 * 
 * HOW TO ADD/EDIT ATTACKS:
 * 1. Find the appropriate phase function (e.g., `executePhase1`).
 * 2. Use `if (t > START_FRAME && t < END_FRAME && t % SPAWN_RATE === 0)` to 
 *    trigger an event continuously.
 * 3. Use `spawnProjectile(x, y, vx, vy, size, life)` for immediate bullets.
 *    (life defaults to Infinity if not passed, deleting bullets when off-screen).
 * 4. Use `spawnWarning(x, y, vx, vy, size, delayTimer)` for telegraphs.
 * 
 * WARNING SYSTEM EXPLAINED:
 * `spawnWarning` spawns an indicator. When `delayTimer` hits 0, it explodes into 
 * projectiles inside the main `update()` loop. 
 * We use `vx` and `vy` in warnings as STRING identifiers to create complex patterns.
 * Example: `spawnWarning(x, y, "ring", 0, 40, 30)` will wait 30 frames, then the 
 * update loop reads `vx === "ring"` and spawns a circle of projectiles. To add a 
 * new custom warning/explosion, add an `else if (w.vx === "your_pattern")` inside 
 * the warning processing block in `update()`, and custom visuals in `draw()`.
 * ==============================================================================
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let animationId;
let gameActive = false;
let isPaused = false;
let frameCount = 0;
let projectiles = [];
let warnings = [];
let playerColor = '#00FFFF';

// Time tracking
let startTime;
let pauseStartTime = 0;
let totalPausedTime = 0;

let currentDifficulty = '';
let gameMode = 'full'; 
let selectedPracticePhase = '1';
let currentHpSetting = 5;
let hitsTaken = 0;

const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, s: false, a: false, d: false, ' ': false };

const player = {
    x: 0, y: 0, size: 20, speed: 6.5, health: 5,
    dashCooldown: 0, maxDashCooldown: 40, dashDistance: 180, isInvulnerable: 0
};

// Starting frames for Practice Mode jumps. 
// (e.g., '1.2' starts at 740 frames, which is ~12.3 seconds in)
const PHASE_FRAMES = {
    '1': 0, '1.1': 0, '1.2': 740, '1.3': 1560,
    '2': 2700, '2.1': 2700, '2.2': 3600, '2.3': 4500,
    '3': 5700, '3.1': 5700, '3.2': 6800, '3.3': 7900
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    canvas.style.display = 'none';
    document.getElementById('hud').style.display = 'none';
}

function setPlayerColor(color) {
    playerColor = color;
    document.getElementById('current-color-text').textContent = color;
    document.getElementById('current-color-text').style.color = color === '#000000' ? '#555' : color;
}

// Spawns a damaging block. 'life' reduces by 1 per frame; deleted if 0 or off-screen.
function spawnProjectile(x, y, vx, vy, size, life = Infinity, isBouncy = false) {
    projectiles.push({ x, y, vx, vy, size, life, isBouncy });
}

// Spawns a telegraph that counts down. When 0, the `update` loop processes it.
function spawnWarning(x, y, vx, vy, size, delayTimer) {
    warnings.push({ x, y, vx, vy, size, timer: delayTimer, maxTimer: delayTimer });
}

function setupMode(mode, phase = '1') {
    gameMode = mode;
    selectedPracticePhase = phase;
}

function goBackFromDifficulty() {
    if (gameMode === 'practice') showScreen('practice-phase-screen');
    else showScreen('menu-screen');
}

// ==========================================
// PAUSE / MENU CONTROLS
// ==========================================

function pauseGame() {
    if (!gameActive || isPaused) return;
    isPaused = true;
    pauseStartTime = Date.now();
    cancelAnimationFrame(animationId);
    document.getElementById('pause-screen').classList.add('active');
}

function resumeGame() {
    if (!isPaused) return;
    isPaused = false;
    totalPausedTime += Date.now() - pauseStartTime;
    document.getElementById('pause-screen').classList.remove('active');
    update(); // Restart the loop
}

function quitToMenu() {
    isPaused = false;
    gameActive = false;
    cancelAnimationFrame(animationId);
    document.getElementById('pause-screen').classList.remove('active');
    showScreen('menu-screen');
}

function toggleCustomHp() {
    let container = document.getElementById('custom-hp-container');
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

function handleCustomHpInput() {
    let input = document.getElementById('custom-hp-input');
    input.value = input.value.replace(/\s/g, ''); 
    let val = parseInt(input.value);
    document.getElementById('custom-hp-btn').disabled = isNaN(val) || val <= 0;
}

function startCustomGame() {
    let hp = parseInt(document.getElementById('custom-hp-input').value);
    startGame(hp, 'Custom HP');
}

// ==========================================
// INPUT HANDLING
// ==========================================

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    
    // Pause Logic
    if (e.key === 'p' || e.key === 'P') {
        if (gameActive) {
            if (!isPaused) pauseGame();
            else resumeGame();
        }
    }

    // Teleport Dash Logic
    if (e.key === ' ' && gameActive && !isPaused && player.dashCooldown <= 0) {
        let dx = 0; let dy = 0;
        if (keys.ArrowUp || keys.w) dy -= 1;
        if (keys.ArrowDown || keys.s) dy += 1;
        if (keys.ArrowLeft || keys.a) dx -= 1;
        if (keys.ArrowRight || keys.d) dx += 1;
        
        if (dx === 0 && dy === 0) dx = 1;

        let length = Math.sqrt(dx*dx + dy*dy);
        player.x += (dx / length) * player.dashDistance;
        player.y += (dy / length) * player.dashDistance;
        
        player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x));
        player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y));
        
        player.dashCooldown = player.maxDashCooldown;
        player.isInvulnerable = Math.max(player.isInvulnerable, 25); 
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});

// ==========================================
// ATTACK PATTERNS (PHASES)
// ==========================================
// Developer note: 't' is frameCount. 60t = 1 second.
// Edit these functions to change or add new attack patterns.

function executePhase1(t) {
    // 1.1: Diagonal Charging Lasers (Replaced old corner bullets)
    if (t > 120 && t < 1600 && t % 150 === 0) {
        // Spawns thin warning lines that detonate into lasers 60 frames later
        spawnWarning(0, 0, "diag_laser_1", 0, 0, 60); 
        spawnWarning(canvas.width, 0, "diag_laser_2", 0, 0, 60);
    }

    // Pre-warning for spinner
    if (t === 740) {
        spawnWarning(canvas.width/2, canvas.height/2, "spinner_warn", 0, 80, 60);
    }

    // 1.2: Middle Spinner & Lycanthropy Bouncing Ball
    if (t === 800) {
        // Spawn the bouncing head! (Lasts exactly until phase 1.2 ends at 1600)
        spawnProjectile(100, 100, 6, 6, 50, 800, true); 
    }

    if (t > 800 && t < 1600 && t % 4 === 0) {
        let angle = t * 0.15;
        let cx = canvas.width / 2; let cy = canvas.height / 2;
        spawnProjectile(cx, cy, Math.cos(angle)*7, Math.sin(angle)*7, 12);
        spawnProjectile(cx, cy, Math.cos(angle + Math.PI/2)*7, Math.sin(angle + Math.PI/2)*7, 12);
        spawnProjectile(cx, cy, Math.cos(angle + Math.PI)*7, Math.sin(angle + Math.PI)*7, 12);
        spawnProjectile(cx, cy, Math.cos(angle + Math.PI*1.5)*7, Math.sin(angle + Math.PI*1.5)*7, 12);
    }

    // 1.3: Sweeping Walls
    if (t > 1560 && t < 2360) {
        if (t % 80 === 0) {
            let dir = Math.random() > 0.5 ? 1 : -1;
            let startX = dir === 1 ? -50 : canvas.width + 50;
            let gapY = Math.random() * (canvas.height - 150) + 75;
            spawnWarning(startX, gapY, "wall_h", dir, 20, 40);
        }
        if (t % 110 === 0) {
            let dir = Math.random() > 0.5 ? 1 : -1;
            let startY = dir === 1 ? -50 : canvas.height + 50;
            let gap1X = Math.random() * (canvas.width/2 - 100) + 50;
            let gap2X = Math.random() * (canvas.width/2 - 100) + canvas.width/2 + 50;
            spawnWarning(gap1X, gap2X, "wall_v", dir, startY, 40);
        }
    }
}

function executePhase2(t) {
    // 2.1: Asteroid Rain
    if (t > 2700 && t < 3600 && t % 5 === 0) {
        let px = Math.random() * canvas.width;
        spawnProjectile(px, -30, (Math.random()-0.5)*4, 8 + Math.random()*6, Math.random()*20 + 10);
    }
    // 2.2: Firecracker Bursts
    if (t > 3600 && t < 4500 && t % 45 === 0) {
        spawnWarning(Math.random() * (canvas.width - 100) + 50, Math.random() * (canvas.height - 100) + 50, "firecracker", 0, 40, 45); 
        spawnWarning(Math.random() * (canvas.width - 100) + 50, Math.random() * (canvas.height - 100) + 50, "firecracker", 0, 40, 45); 
    }
    // 2.3: Red Rings
    if (t > 4500 && t < 5400 && t % 40 === 0) {
        spawnWarning(Math.random() * canvas.width, Math.random() * canvas.height, "ring", 0, 40, 30);
    }
}

function executePhase3(t) {
    // 3.1: All-Sides Border Shower
    if (t > 5700 && t < 6800 && t % 7 === 0) {
        let edge = Math.floor(Math.random() * 4);
        let px, py, vx, vy;
        if(edge === 0) { px=Math.random()*canvas.width; py=-20; vx=(Math.random()-0.5)*6; vy=8; } 
        if(edge === 1) { px=Math.random()*canvas.width; py=canvas.height+20; vx=(Math.random()-0.5)*6; vy=-8; } 
        if(edge === 2) { px=-20; py=Math.random()*canvas.height; vx=8; vy=(Math.random()-0.5)*6; } 
        if(edge === 3) { px=canvas.width+20; py=Math.random()*canvas.height; vx=-8; vy=(Math.random()-0.5)*6; } 
        spawnProjectile(px, py, vx, vy, Math.random()*12 + 8);
    }

    if (t === 6740) {
        spawnWarning(canvas.width / 2, canvas.height / 2, "middle_line", 0, 40, 60);
    }

    // 3.2: Split Divider Walls
    if (t === 6800) {
        // Spawn solid line in the middle
        for(let i = 0; i < canvas.width; i += 25) {
            spawnProjectile(i, canvas.height / 2, 0, 0, 15);
        }
    }
    if (t > 6800 && t < 7900 && t % 50 === 0) {
        let dir = Math.random() > 0.5 ? 1 : -1;
        let startX = dir === 1 ? -50 : canvas.width + 50;
        let gap1Y = Math.random() * (canvas.height/2 - 100) + 50;
        let gap2Y = Math.random() * (canvas.height/2 - 100) + canvas.height/2 + 50;
        spawnWarning(startX === -50 ? 50 : canvas.width - 50, gap1Y, dir, "split_wall", gap2Y, 25);
    }
    
    // Clear arena before 3.3 starts
    if (t === 7900) { projectiles = []; warnings = []; }

    // 3.3: Player Tracking + Sniper Lines
    if (t > 7960 && t < 9000) {
        // Tracker
        if (t % 20 === 0) {
            spawnWarning(player.x, player.y, "track", 0, 0, 30);
            if (t % 40 === 0) spawnProjectile(Math.random()*canvas.width, -20, 0, 10, 15);
        }
        // Snipers
        if (t % 60 === 0) {
            let startX = Math.random() > 0.5 ? -20 : canvas.width + 20;
            let startY = Math.random() * canvas.height;
            spawnWarning(startX, startY, "sniper_line", player.x, player.y, 45);
        }
    }
}

// Master Attack Controller evaluates current game state and executes phase blocks.
function executeAttacks() {
    let t = frameCount;
    let majorPhase = selectedPracticePhase.charAt(0);

    // PHASE 1
    if (gameMode === 'full' || (gameMode === 'practice' && majorPhase === '1')) executePhase1(t);

    // TRANSITION 1: THE CRUSH
    if (gameMode === 'full') {
        if (t === 2400) { projectiles = []; warnings = []; }
        if (t === 2460 || t === 2470 || t === 2480) {
            for(let i = 0; i < canvas.height; i += 20) {
                spawnProjectile(-50, i, 8, 0, 20);
                spawnProjectile(canvas.width + 50, i, -8, 0, 20);
            }
        }
    }

    // PHASE 2
    if (gameMode === 'full' || (gameMode === 'practice' && majorPhase === '2')) executePhase2(t);

    // TRANSITION 2: THE GRID
    if (gameMode === 'full') {
        if (t === 5400) { projectiles = []; warnings = []; }
        if (t === 5460) {
            // Spawn vertical and horizontal stationary laser warnings
            for(let x = 100; x < canvas.width; x += 150) {
                spawnWarning(x, 0, "grid_laser_v", 0, 0, 90); 
            }
            for(let y = 100; y < canvas.height; y += 150) {
                spawnWarning(0, y, "grid_laser_h", 0, 0, 90); 
            }
        }
    }

    // PHASE 3
    if (gameMode === 'full' || (gameMode === 'practice' && majorPhase === '3')) executePhase3(t);

    // PRACTICE MODE END CHECKS
    if (gameMode === 'practice') {
        if (selectedPracticePhase === '1.1' && t === 800) gameWon();
        if (selectedPracticePhase === '1.2' && t === 1600) gameWon();
        if (selectedPracticePhase === '1.3' && t === 2400) gameWon();
        if (selectedPracticePhase === '1' && t === 2400) gameWon();

        if (selectedPracticePhase === '2.1' && t === 3600) gameWon();
        if (selectedPracticePhase === '2.2' && t === 4500) gameWon();
        if (selectedPracticePhase === '2.3' && t === 5400) gameWon();
        if (selectedPracticePhase === '2' && t === 5400) gameWon();

        if (selectedPracticePhase === '3.1' && t === 6800) gameWon();
        if (selectedPracticePhase === '3.2' && t === 7900) gameWon();
        if (selectedPracticePhase === '3.3' && t === 9000) gameWon();
        if (selectedPracticePhase === '3' && t === 9000) gameWon();
    }

    // FULL GAME VICTORY
    if (gameMode === 'full' && t === 9000) gameWon();
}

// ==========================================
// CORE ENGINE LOOPS (Update & Draw)
// ==========================================

function update() {
    if (!gameActive || isPaused) return;

    let timeSurvived = Math.floor((Date.now() - startTime - totalPausedTime) / 1000);

    // Player Movement
    let dx = 0; let dy = 0;
    if (keys.ArrowUp || keys.w) dy -= 1;
    if (keys.ArrowDown || keys.s) dy += 1;
    if (keys.ArrowLeft || keys.a) dx -= 1;
    if (keys.ArrowRight || keys.d) dx += 1;

    if (dx !== 0 && dy !== 0) {
        let length = Math.sqrt(dx*dx + dy*dy);
        dx /= length; dy /= length;
    }

    player.x += dx * player.speed;
    player.y += dy * player.speed;
    player.x = Math.max(player.size/2, Math.min(canvas.width - player.size/2, player.x));
    player.y = Math.max(player.size/2, Math.min(canvas.height - player.size/2, player.y));

    // Cooldowns
    if (player.dashCooldown > 0) player.dashCooldown--;
    if (player.isInvulnerable > 0) player.isInvulnerable--;

    // ------------------------------------------
    // WARNING PROCESSING
    // ------------------------------------------
    // When a warning's timer hits 0, read its 'vx' or 'vy' string identifier to spawn specific bullets.
    for (let i = warnings.length - 1; i >= 0; i--) {
        let w = warnings[i];
        w.timer--;
        
        if (w.timer <= 0) {
            if (w.vx === "ring") {
                for(let j = 0; j < Math.PI * 2; j += Math.PI / 8) spawnProjectile(w.x, w.y, Math.cos(j)*9, Math.sin(j)*9, 14);
            } else if (w.vx === "track") {
                let angle = Math.atan2(player.y - w.y, player.x - w.x);
                spawnProjectile(w.x, w.y, Math.cos(angle)*12, Math.sin(angle)*12, 16);
            } else if (w.vy === "split_wall") {
                for(let j=0; j<canvas.height; j+=25) {
                    if (Math.abs(j - canvas.height/2) < 25) continue; 
                    if (Math.abs(j - w.y) > 40 && Math.abs(j - w.size) > 40) spawnProjectile(w.vx === 1 ? -50 : canvas.width + 50, j, w.vx * 14, 0, 20);
                }
            } else if (w.vx === "wall_h") {
                for(let i = 0; i < canvas.height; i += 30) {
                    if(Math.abs(i - w.y) > 40) spawnProjectile(w.x, i, w.vy * 8.5, 0, 20);
                }
            } else if (w.vx === "wall_v") {
                for(let i = 0; i < canvas.width; i += 30) {
                    if(Math.abs(i - w.x) > 40 && Math.abs(i - w.y) > 40) spawnProjectile(i, w.size, 0, w.vy * 8.5, 20);
                }
            } else if (w.vx === "sniper_line") {
                let angle = Math.atan2(w.size - w.y, w.vy - w.x);
                spawnProjectile(w.x, w.y, Math.cos(angle)*18, Math.sin(angle)*18, 22);
            } else if (w.vx === "grid_laser_v") {
                for(let j=0; j<canvas.height; j+=25) spawnProjectile(w.x, j, 0, 0, 25, 45); // Static beam for 45 frames
            } else if (w.vx === "grid_laser_h") {
                for(let j=0; j<canvas.width; j+=25) spawnProjectile(j, w.y, 0, 0, 25, 45); // Static beam for 45 frames
            } else if (w.vx === "diag_laser_1") {
                let dist = Math.sqrt(canvas.width*canvas.width + canvas.height*canvas.height);
                for(let i = 0; i < dist; i += 25) {
                    spawnProjectile(i * (canvas.width/dist), i * (canvas.height/dist), 0, 0, 25, 45);
                }
            } else if (w.vx === "diag_laser_2") {
                let dist = Math.sqrt(canvas.width*canvas.width + canvas.height*canvas.height);
                for(let i = 0; i < dist; i += 25) {
                    spawnProjectile(canvas.width - i * (canvas.width/dist), i * (canvas.height/dist), 0, 0, 25, 45);
                }
            } else if (w.vx === "spinner_warn" || w.vx === "middle_line") {
                // Do nothing, purely visual warning
            } else {
                // Default explosion
                for(let j = 0; j < Math.PI * 2; j += Math.PI / 6) spawnProjectile(w.x, w.y, Math.cos(j)*8, Math.sin(j)*8, 12);
            }
            warnings.splice(i, 1);
        }
    }

    // ------------------------------------------
    // PROJECTILE PROCESSING & COLLISIONS
    // ------------------------------------------
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        if (p.isBouncy) {
            // Bounce off edges
            if (p.x - p.size/2 < 0) { p.x = p.size/2; p.vx *= -1; }
            if (p.x + p.size/2 > canvas.width) { p.x = canvas.width - p.size/2; p.vx *= -1; }
            if (p.y - p.size/2 < 0) { p.y = p.size/2; p.vy *= -1; }
            if (p.y + p.size/2 > canvas.height) { p.y = canvas.height - p.size/2; p.vy *= -1; }
        } else {
            // Clean up out of bounds
            if (p.x < -100 || p.x > canvas.width + 100 || p.y < -100 || p.y > canvas.height + 100) {
                projectiles.splice(i, 1);
                continue;
            }
        }

        // Expired life cleanup
        if (p.life <= 0) {
            projectiles.splice(i, 1);
            continue;
        }
        
        // Hit Detection
        if (player.isInvulnerable <= 0) {
            if (Math.abs(player.x - p.x) < (player.size/2 + p.size/2 - 3) && 
                Math.abs(player.y - p.y) < (player.size/2 + p.size/2 - 3)) {
                
                hitsTaken++;
                if (currentDifficulty !== 'Debug') {
                    player.health--;
                    document.getElementById('hp-display').innerText = player.health;
                    if (player.health <= 0) gameOver();
                    else player.isInvulnerable = 60; 
                } else {
                    document.getElementById('hp-display').innerText = `DEBUG (Hits: ${hitsTaken})`;
                    player.isInvulnerable = 60;
                }
            }
        }
    }

    executeAttacks();
    frameCount++;
    
    // Update HUD Timer
    let displayTime = timeSurvived;
    if (gameMode === 'practice') displayTime += Math.floor(PHASE_FRAMES[selectedPracticePhase] / 60);
    document.getElementById('timer-display').innerText = displayTime; 
    
    draw();
    animationId = requestAnimationFrame(update);
}

function draw() {
    // Clear canvas with motion blur effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ------------------------------------------
    // STATIC INDICATOR RENDER PASS
    // ------------------------------------------
    // Persistent Purple Circle for Phase 1.2 (Explodes at 800, Dilates at 1600)
    let isPhase1_2 = (gameMode === 'full' && frameCount >= 800 && frameCount <= 1660) || 
                     (gameMode === 'practice' && ['1', '1.2'].includes(selectedPracticePhase.charAt(0)) && frameCount >= 800 && frameCount <= 1660);

    if (isPhase1_2) {
        let cx = canvas.width / 2;
        let cy = canvas.height / 2;
        let radius = 80;
        let opacity = 1;

        // Dilation effect when ending
        if (frameCount > 1600) {
            let fadeProgress = (frameCount - 1600) / 60; 
            radius = 80 + fadeProgress * 150; // Expand rapidly
            opacity = 1 - fadeProgress; // Fade into nothing
        }

        if (opacity > 0) {
            ctx.strokeStyle = `rgba(128, 0, 128, ${opacity})`;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(128, 0, 128, ${opacity * 0.2})`;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
        }
    }
    
    let isPhase1_1 = (gameMode === 'full' && frameCount > 60 && frameCount < 1600) || 
                     (gameMode === 'practice' && (selectedPracticePhase === '1' || selectedPracticePhase === '1.1' || selectedPracticePhase === '1.2') && frameCount > 60 && frameCount < 1600);
    
    if (isPhase1_1) {
        ctx.strokeStyle = `rgba(255, 50, 50, ${0.6 + 0.4 * Math.abs(Math.sin(frameCount * 0.1))})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(canvas.width, canvas.height);
        ctx.moveTo(canvas.width, 0); ctx.lineTo(0, canvas.height);
        ctx.stroke();
    }

    // ------------------------------------------
    // PLAYER RENDER PASS
    // ------------------------------------------
    if (player.isInvulnerable > 0 && player.isInvulnerable < 120 && frameCount % 10 < 5) ctx.globalAlpha = 0.2;
    else if (player.isInvulnerable > 0) ctx.globalAlpha = 0.5;
    else ctx.globalAlpha = 1.0;
    
    ctx.fillStyle = playerColor;
    ctx.fillRect(player.x - player.size/2, player.y - player.size/2, player.size, player.size);
    ctx.globalAlpha = 1.0;
    
    // Dash cooldown ring
    if (player.dashCooldown > 0) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.size + 5, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * (1 - player.dashCooldown/player.maxDashCooldown)));
        ctx.stroke();
    }

    // ------------------------------------------
    // PROJECTILE RENDER PASS
    // ------------------------------------------
    ctx.fillStyle = '#00FF00';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00FF00';
    for (let p of projectiles) ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    ctx.shadowBlur = 0; 

    // ------------------------------------------
    // WARNING VISUAL RENDER PASS
    // ------------------------------------------
    // Add custom drawing logic for custom string identifiers here.
    for (let w of warnings) {
        let progress = 1 - (w.timer / w.maxTimer);

        if (w.vx === "wall_h") {
            ctx.fillStyle = `rgba(255, 0, 0, ${0.2 + 0.3 * Math.sin(frameCount * 0.2)})`;
            let rectX = w.vy === 1 ? 0 : canvas.width - 40;
            ctx.fillRect(rectX, 0, 40, canvas.height);
        }
        else if (w.vx === "wall_v") {
            ctx.fillStyle = `rgba(255, 0, 0, ${0.2 + 0.3 * Math.sin(frameCount * 0.2)})`;
            let rectY = w.vy === 1 ? 0 : canvas.height - 40;
            ctx.fillRect(0, rectY, canvas.width, 40);
        }
        else if (w.vy === "split_wall") {
            ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + 0.5 * Math.sin(frameCount * 0.2)})`;
            let rectX = w.vx === 1 ? 0 : canvas.width - 40;
            ctx.fillRect(rectX, 0, 40, canvas.height/2 - 20);
            ctx.fillRect(rectX, canvas.height/2 + 20, 40, canvas.height/2 - 20);
        }
        else if (w.vx === "middle_line") {
            ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + 0.3 * Math.sin(frameCount * 0.2)})`;
            ctx.fillRect(0, canvas.height / 2 - 20, canvas.width, 40);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 3rem Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', canvas.width / 2, canvas.height / 2);
        }
        else if (w.vx === "sniper_line") {
            let angle = Math.atan2(w.size - w.y, w.vy - w.x);
            ctx.strokeStyle = `rgba(255, 50, 50, ${0.5 + 0.5 * Math.abs(Math.sin(frameCount * 0.2))})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(w.x, w.y);
            ctx.lineTo(w.x + Math.cos(angle)*3000, w.y + Math.sin(angle)*3000);
            ctx.stroke();
        }
        else if (w.vx === "grid_laser_v") {
            ctx.fillStyle = `rgba(255, 0, 0, ${0.2 + 0.4 * Math.sin(frameCount * 0.3)})`;
            ctx.fillRect(w.x - 12, 0, 24, canvas.height);
        }
        else if (w.vx === "grid_laser_h") {
            ctx.fillStyle = `rgba(255, 0, 0, ${0.2 + 0.4 * Math.sin(frameCount * 0.3)})`;
            ctx.fillRect(0, w.y - 12, canvas.width, 24);
        }
        else if (w.vx === "spinner_warn") {
            let radius = w.size || 80;
            ctx.strokeStyle = `rgba(128, 0, 128, ${0.4 + 0.6 * progress})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(w.x, w.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgba(128, 0, 128, ${0.2 * progress})`;
            ctx.beginPath();
            ctx.arc(w.x, w.y, radius * progress, 0, Math.PI * 2);
            ctx.fill();
        }
        else if (w.vx === "firecracker") {
            let radius = w.size || 40;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + 0.6 * progress})`;
            ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w.x, w.y, radius, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(255, 255, 255, ${0.2 * progress})`; ctx.beginPath(); ctx.arc(w.x, w.y, radius * progress, 0, Math.PI * 2); ctx.fill();
            if (w.timer >= 15 || frameCount % 4 >= 2) {
                ctx.fillStyle = 'white'; ctx.font = 'bold 2rem Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', w.x, w.y);
            }
        }
        else if (w.vx === "ring") {
            let radius = w.size || 40;
            ctx.strokeStyle = `rgba(255, 0, 0, ${0.4 + 0.6 * progress})`;
            ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w.x, w.y, radius, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(255, 0, 0, ${0.2 * progress})`; ctx.beginPath(); ctx.arc(w.x, w.y, radius * progress, 0, Math.PI * 2); ctx.fill();
            if (w.timer >= 15 || frameCount % 4 >= 2) {
                ctx.fillStyle = 'white'; ctx.font = 'bold 2rem Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', w.x, w.y);
            }
        }
        else if (w.vx === "track") {
            let angle = Math.atan2(player.y - w.y, player.x - w.x);
            let triSize = 30;
            ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(angle);
            ctx.strokeStyle = `rgba(255, 255, 0, ${0.5 + 0.5 * progress})`;
            ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(triSize, 0); ctx.lineTo(-triSize/2, triSize/2); ctx.lineTo(-triSize/2, -triSize/2); ctx.closePath(); ctx.stroke();
            ctx.fillStyle = `rgba(255, 255, 0, ${0.2 * progress})`; ctx.fill();
            ctx.rotate(-angle);
            if (w.timer >= 15 || frameCount % 4 >= 2) {
                ctx.fillStyle = 'white'; ctx.font = 'bold 1.5rem Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 0);
            }
            ctx.restore();
        } 
        else if (w.vx === "diag_laser_1") {
            ctx.strokeStyle = `rgba(255, 50, 50, ${0.3 + 0.7 * progress})`;
            ctx.lineWidth = 2 + 5 * progress;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(canvas.width, canvas.height); ctx.stroke();
        }
        else if (w.vx === "diag_laser_2") {
            ctx.strokeStyle = `rgba(255, 50, 50, ${0.3 + 0.7 * progress})`;
            ctx.lineWidth = 2 + 5 * progress;
            ctx.beginPath(); ctx.moveTo(canvas.width,0); ctx.lineTo(0, canvas.height); ctx.stroke();
        }
        else {
            if (w.timer < 15 && frameCount % 4 < 2) continue; 
            ctx.fillStyle = 'white'; ctx.font = 'bold 2.5rem Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.globalAlpha = progress; ctx.fillText('!', w.x, w.y); ctx.globalAlpha = 1.0;
        }
    }

    // ------------------------------------------
    // CINEMATIC TEXT RENDERING
    // ------------------------------------------
    ctx.textAlign = 'center';
    let startFrame = gameMode === 'practice' ? PHASE_FRAMES[selectedPracticePhase] : 0;
    if (player.isInvulnerable > 0 && frameCount < startFrame + 120) {
        ctx.fillStyle = `rgba(255, 255, 255, ${player.isInvulnerable / 120})`; ctx.font = '3rem Courier New';
        ctx.fillText(gameMode === 'practice' ? `PHASE ${selectedPracticePhase} PRACTICE` : 'GET READY!', canvas.width / 2, player.y - 60);
    }
    if (gameMode === 'full') {
        if (frameCount >= 2400 && frameCount < 2520) {
            ctx.fillStyle = `rgba(255, 50, 50, ${(2520 - frameCount)/100})`; ctx.font = 'bold 5rem Courier New';
            ctx.fillText('THE CRUSH', canvas.width / 2, canvas.height / 2); ctx.font = '2rem Courier New'; ctx.fillText('DASH THROUGH!', canvas.width / 2, canvas.height / 2 + 60);
        }
        if (frameCount >= 5400 && frameCount < 5520) {
            ctx.fillStyle = `rgba(255, 0, 0, ${(5520 - frameCount)/100})`; ctx.font = 'bold 5rem Courier New';
            ctx.fillText('THE GRID', canvas.width / 2, canvas.height / 2); ctx.font = '2rem Courier New'; ctx.fillText('FIND THE SAFE ZONE', canvas.width / 2, canvas.height / 2 + 60);
        }
    }
}

// ==========================================
// GAME STATE MANAGEMENT
// ==========================================

function startGame(hp, difficultyName) {
    currentDifficulty = difficultyName; currentHpSetting = hp;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('debug-hits-display').style.display = 'none';
    resize(); canvas.style.display = 'block'; document.getElementById('hud').style.display = 'flex';
    
    player.x = canvas.width / 2; player.y = canvas.height / 2; hitsTaken = 0;
    
    if (currentDifficulty === 'Debug') {
        document.getElementById('hp-display').innerText = `DEBUG (Hits: 0)`;
    } else {
        player.health = hp; document.getElementById('hp-display').innerText = player.health;
    }
    
    projectiles = []; 
    warnings = []; 
    gameActive = true; 
    isPaused = false;
    startTime = Date.now(); 
    totalPausedTime = 0;
    player.isInvulnerable = 120; 

    if (gameMode === 'full') {
        frameCount = 0; document.getElementById('timer-max').innerText = '/ 150';
    } else {
        frameCount = PHASE_FRAMES[selectedPracticePhase]; let majorPhase = selectedPracticePhase.charAt(0);
        if (majorPhase === '1') document.getElementById('timer-max').innerText = '/ 40';
        if (majorPhase === '2') document.getElementById('timer-max').innerText = '/ 90';
        if (majorPhase === '3') document.getElementById('timer-max').innerText = '/ 150';
    }
    update();
}

function retryPractice() { startGame(currentHpSetting, currentDifficulty); }

function gameOver() {
    gameActive = false; cancelAnimationFrame(animationId);
    if (gameMode === 'practice') {
        document.getElementById('practice-failed-mode').innerText = `Phase ${selectedPracticePhase}, ${currentDifficulty}`;
        showScreen('practice-failed-screen');
    } else {
        let timeSurvived = Math.floor((Date.now() - startTime - totalPausedTime) / 1000);
        document.getElementById('death-stats-mode').innerText = `Full Fight, ${currentDifficulty}`;
        document.getElementById('survival-time').innerText = timeSurvived; showScreen('game-over-screen');
    }
}

function gameWon() {
    gameActive = false; cancelAnimationFrame(animationId);
    if (gameMode === 'practice') {
        document.getElementById('victory-title').innerText = "PHASE CLEARED";
        document.getElementById('victory-stats-mode').innerText = `Phase ${selectedPracticePhase} Practice, ${currentDifficulty}`;
    } else {
        document.getElementById('victory-title').innerText = "FULL FIGHT CLEARED";
        document.getElementById('victory-stats-mode').innerText = `Full Fight, ${currentDifficulty}`;
    }
    if (currentDifficulty === 'Debug') {
        document.getElementById('debug-hits-display').style.display = 'block';
        document.getElementById('final-hits').innerText = hitsTaken;
    }
    showScreen('victory-screen');
}
