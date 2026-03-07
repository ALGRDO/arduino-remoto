// ===== ROBOT VISUAL SIMULATOR =====
// A Canvas-based simulation of a 2WD differential drive robot
// with two modes: Line Follower (figure-8 track) and Wall Avoider (arena)

(function () {
    'use strict';

    var canvas, ctx, animId;
    var running = false;
    var mode = 'line_follower'; // or 'wall_avoider'

    // Robot state
    var robot = {
        x: 0, y: 0,
        angle: 0,       // radians
        speed: 2,
        turnRate: 0,
        radius: 12,
        leftMotor: 1,
        rightMotor: 1,
        sensorL: false,  // left IR sensor on line?
        sensorR: false,  // right IR sensor on line?
        distance: 999,   // ultrasonic reading (cm equivalent pixels)
        ledOn: false,
        trail: []
    };

    // Track & arena constants
    var W, H, cx, cy;
    var trackRadius;
    var wallPadding = 40;

    // Obstacles for wall avoider
    var obstacles = [];

    // ===== INIT =====
    function init() {
        canvas = document.getElementById('sim-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        var container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        W = canvas.width;
        H = canvas.height;
        cx = W / 2;
        cy = H / 2;
        trackRadius = Math.min(W, H) * 0.2;
        resetRobot();
    }

    function resetRobot() {
        robot.trail = [];
        robot.ledOn = false;
        if (mode === 'line_follower') {
            // Start at bottom of left circle
            robot.x = cx - trackRadius;
            robot.y = cy + trackRadius;
            robot.angle = 0;
            robot.speed = 2;
        } else {
            robot.x = cx;
            robot.y = cy;
            robot.angle = Math.random() * Math.PI * 2;
            robot.speed = 2.5;
            generateObstacles();
        }
    }

    function generateObstacles() {
        obstacles = [];
        for (var i = 0; i < 5; i++) {
            var ox, oy, tries = 0;
            do {
                ox = wallPadding + 30 + Math.random() * (W - wallPadding * 2 - 60);
                oy = wallPadding + 30 + Math.random() * (H - wallPadding * 2 - 60);
                tries++;
            } while (Math.hypot(ox - cx, oy - cy) < 60 && tries < 20);
            obstacles.push({ x: ox, y: oy, w: 20 + Math.random() * 40, h: 20 + Math.random() * 40 });
        }
    }

    // ===== DRAWING =====
    function drawBackground() {
        // Dark arena floor
        ctx.fillStyle = '#111820';
        ctx.fillRect(0, 0, W, H);

        // Grid
        ctx.strokeStyle = 'rgba(88,166,255,0.06)';
        ctx.lineWidth = 1;
        var gridSize = 30;
        for (var gx = 0; gx < W; gx += gridSize) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
        }
        for (var gy = 0; gy < H; gy += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
        }
    }

    function drawTrack() {
        // Figure-8 using two circles
        var lx = cx - trackRadius;
        var rx = cx + trackRadius;

        ctx.lineWidth = 22;
        ctx.strokeStyle = '#1a2332';
        ctx.beginPath();
        ctx.arc(lx, cy, trackRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rx, cy, trackRadius, 0, Math.PI * 2);
        ctx.stroke();

        // The actual line (thinner, black)
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#e6edf3';
        ctx.beginPath();
        ctx.arc(lx, cy, trackRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rx, cy, trackRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Center cross mark
        ctx.fillStyle = 'rgba(88,166,255,0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawArena() {
        // Walls
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(wallPadding, wallPadding, W - wallPadding * 2, H - wallPadding * 2);

        // Corner decorations
        var cs = 10;
        ctx.fillStyle = '#58a6ff';
        [[wallPadding, wallPadding], [W - wallPadding, wallPadding],
        [wallPadding, H - wallPadding], [W - wallPadding, H - wallPadding]].forEach(function (p) {
            ctx.fillRect(p[0] - cs / 2, p[1] - cs / 2, cs, cs);
        });

        // Obstacles
        ctx.fillStyle = 'rgba(248, 81, 73, 0.3)';
        ctx.strokeStyle = '#f85149';
        ctx.lineWidth = 2;
        obstacles.forEach(function (o) {
            ctx.fillRect(o.x, o.y, o.w, o.h);
            ctx.strokeRect(o.x, o.y, o.w, o.h);
        });
    }

    function drawTrail() {
        if (robot.trail.length < 2) return;
        ctx.strokeStyle = mode === 'line_follower'
            ? 'rgba(63,185,80,0.4)'
            : 'rgba(240,136,62,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(robot.trail[0].x, robot.trail[0].y);
        for (var i = 1; i < robot.trail.length; i++) {
            ctx.lineTo(robot.trail[i].x, robot.trail[i].y);
        }
        ctx.stroke();
    }

    function drawRobot() {
        ctx.save();
        ctx.translate(robot.x, robot.y);
        ctx.rotate(robot.angle);

        // Body
        ctx.fillStyle = '#21262d';
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-robot.radius, -robot.radius * 0.8, robot.radius * 2, robot.radius * 1.6, 4);
        ctx.fill();
        ctx.stroke();

        // Direction arrow
        ctx.fillStyle = '#58a6ff';
        ctx.beginPath();
        ctx.moveTo(robot.radius + 4, 0);
        ctx.lineTo(robot.radius - 4, -5);
        ctx.lineTo(robot.radius - 4, 5);
        ctx.closePath();
        ctx.fill();

        // Wheels
        ctx.fillStyle = '#8b949e';
        ctx.fillRect(-robot.radius + 2, -robot.radius - 3, 8, 3);
        ctx.fillRect(-robot.radius + 2, robot.radius, 8, 3);
        ctx.fillRect(robot.radius - 10, -robot.radius - 3, 8, 3);
        ctx.fillRect(robot.radius - 10, robot.radius, 8, 3);

        // Sensors
        if (mode === 'line_follower') {
            // IR sensors under chassis
            ctx.fillStyle = robot.sensorL ? '#3fb950' : '#6e7681';
            ctx.fillRect(robot.radius - 2, -6, 4, 4);
            ctx.fillStyle = robot.sensorR ? '#3fb950' : '#6e7681';
            ctx.fillRect(robot.radius - 2, 2, 4, 4);
        } else {
            // Ultrasonic sensor
            ctx.fillStyle = robot.distance < 40 ? '#f85149' : '#58a6ff';
            ctx.fillRect(robot.radius, -4, 6, 8);
        }

        // LED indicator
        if (robot.ledOn) {
            ctx.fillStyle = '#f85149';
            ctx.shadowColor = '#f85149';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(-robot.radius + 4, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    function drawHUD() {
        ctx.fillStyle = 'rgba(13,17,23,0.75)';
        ctx.fillRect(8, 8, 180, mode === 'line_follower' ? 58 : 72);
        ctx.strokeStyle = 'rgba(48,54,61,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(8, 8, 180, mode === 'line_follower' ? 58 : 72);

        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillStyle = '#58a6ff';
        ctx.fillText(mode === 'line_follower' ? '🤖 SEGUIDOR DE LÍNEA' : '🚓 EXPLORADOR', 16, 26);

        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#8b949e';
        ctx.fillText('X: ' + Math.round(robot.x) + '  Y: ' + Math.round(robot.y), 16, 42);
        ctx.fillText('Ángulo: ' + Math.round(robot.angle * 180 / Math.PI) + '°', 16, 56);

        if (mode === 'wall_avoider') {
            ctx.fillStyle = robot.distance < 40 ? '#f85149' : '#3fb950';
            ctx.fillText('Distancia: ' + Math.round(robot.distance) + ' px', 16, 70);
        }

        // Status badge
        if (running) {
            ctx.fillStyle = '#3fb950';
            ctx.beginPath();
            ctx.arc(W - 20, 20, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = '500 10px Inter, sans-serif';
            ctx.fillStyle = '#3fb950';
            ctx.fillText('EN VIVO', W - 65, 24);
        }
    }

    // ===== PHYSICS =====
    function isOnLine(px, py) {
        var lx = cx - trackRadius;
        var rx = cx + trackRadius;
        var distL = Math.abs(Math.hypot(px - lx, py - cy) - trackRadius);
        var distR = Math.abs(Math.hypot(px - rx, py - cy) - trackRadius);
        return Math.min(distL, distR) < 6;
    }

    function lineFollowerUpdate() {
        // Sensor positions relative to robot
        var sensorDist = robot.radius + 2;
        var sensorSpread = 6;

        var slx = robot.x + Math.cos(robot.angle) * sensorDist - Math.sin(robot.angle) * sensorSpread;
        var sly = robot.y + Math.sin(robot.angle) * sensorDist + Math.cos(robot.angle) * sensorSpread;
        var srx = robot.x + Math.cos(robot.angle) * sensorDist + Math.sin(robot.angle) * sensorSpread;
        var sry = robot.y + Math.sin(robot.angle) * sensorDist - Math.cos(robot.angle) * sensorSpread;

        robot.sensorL = isOnLine(slx, sly);
        robot.sensorR = isOnLine(srx, sry);

        // PD-like control
        if (robot.sensorL && !robot.sensorR) {
            robot.turnRate = -0.06;  // Turn left
        } else if (!robot.sensorL && robot.sensorR) {
            robot.turnRate = 0.06;   // Turn right
        } else if (robot.sensorL && robot.sensorR) {
            robot.turnRate = 0;      // Straight
        } else {
            // Lost the line → turn harder in last known direction
            robot.turnRate *= 1.3;
            if (Math.abs(robot.turnRate) > 0.15) robot.turnRate = robot.turnRate > 0 ? 0.15 : -0.15;
        }

        robot.angle += robot.turnRate;
        robot.x += Math.cos(robot.angle) * robot.speed;
        robot.y += Math.sin(robot.angle) * robot.speed;
    }

    function getMinDistance() {
        var frontX = robot.x + Math.cos(robot.angle) * 80;
        var frontY = robot.y + Math.sin(robot.angle) * 80;
        var minDist = 999;

        // Distance to walls
        var steps = 80;
        for (var s = 1; s <= steps; s++) {
            var px = robot.x + Math.cos(robot.angle) * s;
            var py = robot.y + Math.sin(robot.angle) * s;

            // Wall check
            if (px <= wallPadding || px >= W - wallPadding ||
                py <= wallPadding || py >= H - wallPadding) {
                minDist = Math.min(minDist, s);
                break;
            }

            // Obstacle check
            for (var oi = 0; oi < obstacles.length; oi++) {
                var o = obstacles[oi];
                if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) {
                    minDist = Math.min(minDist, s);
                    break;
                }
            }
            if (minDist < 999) break;
        }
        return minDist;
    }

    var avoidTimer = 0;
    var avoidDirection = 1;

    function wallAvoiderUpdate() {
        robot.distance = getMinDistance();

        if (avoidTimer > 0) {
            // Currently avoiding
            avoidTimer--;
            robot.angle += 0.05 * avoidDirection;
            robot.x += Math.cos(robot.angle) * 0.5;
            robot.y += Math.sin(robot.angle) * 0.5;
            robot.ledOn = true;
        } else if (robot.distance < 35) {
            // Obstacle detected! Start avoid maneuver
            avoidTimer = 30 + Math.floor(Math.random() * 30);
            avoidDirection = Math.random() > 0.5 ? 1 : -1;
            robot.ledOn = true;
            // Back up slightly
            robot.x -= Math.cos(robot.angle) * 5;
            robot.y -= Math.sin(robot.angle) * 5;
        } else {
            // Clear path, drive forward
            robot.ledOn = false;
            robot.angle += (Math.random() - 0.5) * 0.02; // slight wander
            robot.x += Math.cos(robot.angle) * robot.speed;
            robot.y += Math.sin(robot.angle) * robot.speed;
        }

        // Hard wall clamp
        robot.x = Math.max(wallPadding + robot.radius, Math.min(W - wallPadding - robot.radius, robot.x));
        robot.y = Math.max(wallPadding + robot.radius, Math.min(H - wallPadding - robot.radius, robot.y));
    }

    // ===== MAIN LOOP =====
    function update() {
        if (!running) return;

        if (mode === 'line_follower') {
            lineFollowerUpdate();
        } else {
            wallAvoiderUpdate();
        }

        // Trail
        robot.trail.push({ x: robot.x, y: robot.y });
        if (robot.trail.length > 500) robot.trail.shift();
    }

    function draw() {
        drawBackground();

        if (mode === 'line_follower') {
            drawTrack();
        } else {
            drawArena();
        }

        drawTrail();
        drawRobot();
        drawHUD();
    }

    function loop() {
        update();
        draw();
        animId = requestAnimationFrame(loop);
    }

    // ===== PUBLIC API =====
    window.RobotSimulator = {
        init: init,
        start: function () {
            if (!canvas) init();
            running = true;
            if (!animId) loop();
        },
        stop: function () {
            running = false;
        },
        reset: function () {
            running = false;
            resetRobot();
            if (canvas) draw();
        },
        setMode: function (m) {
            mode = m;
            resetRobot();
            if (!running && canvas) draw();
        },
        nudge: function (direction) {
            if (!canvas) init();
            var step = 12;
            var turnStep = 0.3;
            if (direction === 'up') {
                robot.x += Math.cos(robot.angle) * step;
                robot.y += Math.sin(robot.angle) * step;
            } else if (direction === 'left') {
                robot.angle -= turnStep;
            } else if (direction === 'right') {
                robot.angle += turnStep;
            }
            robot.trail.push({ x: robot.x, y: robot.y });
            if (robot.trail.length > 500) robot.trail.shift();
            if (!running) draw();
        },
        isRunning: function () { return running; },
        destroy: function () {
            running = false;
            if (animId) cancelAnimationFrame(animId);
            animId = null;
        }
    };
})();
