// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
// === GAME WORLD DIMENSIONS ===
const GAME_WIDTH = 1800;
const GAME_HEIGHT = 1300;
app.use(express.static("public"));

const rooms = {}; // { roomId: { players:{id:player}, powerUps:[], projectiles:[], gameStarted } }

function createRoomId() {
  return Math.random().toString(36).substr(2, 4).toUpperCase();
}

// --- GAME LOOP ---
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (!room.gameStarted) continue;

    // Update projectiles
    room.projectiles.forEach(p => {
      // Move projectile
      p.x += p.vx;
      p.y += p.vy;

      const projRadius = p.explosive ? 10 : 5;

      // --- Collision with obstacles ---
      room.obstacles.forEach(o => {
        if (p.hit) return;

        if (p.x + projRadius > o.x && p.x - projRadius < o.x + o.w &&
          p.y + projRadius > o.y && p.y - projRadius < o.y + o.h) {

          if (!p.explosive) {
            // Normal projectile: bounce once
            if (!p.bounced) {
              const prevX = p.x - p.vx;
              const prevY = p.y - p.vy;

              if (prevX + projRadius <= o.x || prevX - projRadius >= o.x + o.w) p.vx *= -1;
              if (prevY + projRadius <= o.y || prevY - projRadius >= o.y + o.h) p.vy *= -1;

              p.bounced = true;
            } else {
              p.hit = true; // remove after second hit
            }
          } else {
            // Explosive: explode on first wall hit
            triggerExplosion(room, p.x, p.y, 80, p.ownerId);
            p.hit = true;

            // Play explosion sound for all clients
            io.to(roomId).emit("playExplosionSound", { x: p.x, y: p.y });
          }
        }
      });

      // --- Out-of-bounds removal ---
      if (p.x < 0 || p.x > GAME_WIDTH || p.y < 0 || p.y > GAME_HEIGHT) {
        if (p.explosive) triggerExplosion(room, p.x, p.y, 80, p.ownerId);
        p.hit = true;
      }

      // --- Collision with players ---
      for (const id in room.players) {
        const player = room.players[id];
        if (player.health <= 0) continue;

        // Prevent self-damage
        if (id === p.ownerId) continue;

        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist < projRadius + 32.5) { // 32.5 = player radius
          if (p.explosive) {
            triggerExplosion(room, p.x, p.y, 80, p.ownerId);
            p.hit = true;
          } else {
            player.health -= 20; // normal projectile damage
            p.hit = true;
            if (player.health <= 0) resetPlayer(player);
          }
        }
      }
    });


    // Remove hit projectiles
    room.projectiles = room.projectiles.filter(p => !p.hit);
    if (room.explosions) {
      room.explosions.forEach(exp => exp.timer--);
      room.explosions = room.explosions.filter(exp => exp.timer > 0);
    }




    // --- Helper function to reset a dead player ---
    function resetPlayer(player) {
      player.x = Math.random() * (GAME_WIDTH - 100) + 50;
      player.y = Math.random() * (GAME_HEIGHT - 100) + 50;
      player.health = 100;
      player.speedMultiplier = 1;
      player.shootMultiplier = 1;
      player.powerUpTimer = 0;
      io.to(player.id).emit("playerDied", { id: player.id });
    }



    // Remove hit or out-of-bounds projectiles
    room.projectiles = room.projectiles.filter(p => !p.hit && p.x >= 0 && p.x <= GAME_WIDTH && p.y >= 0 && p.y <= GAME_HEIGHT);


    // Power-up collection
    room.powerUps.forEach(pu => {
      for (const id in room.players) {
        const p = room.players[id];
        if (p.health <= 0) continue;
        const playerRadius = 32.5;
        const dx = pu.x - p.x;
        const dy = pu.y - p.y;
        const dist = Math.hypot(dx, dy);

        if (dist < playerRadius + pu.size) { // correct circle-to-circle check
          if (pu.type === "speed") p.speedMultiplier = 2;
          if (pu.type === "shoot") p.shootMultiplier = 3;
          if (pu.type === "explosive") {
            p.explosive = true; // Give player explosive shots
          }

          p.powerUpTimer = 600;
          pu.collected = true;
        }
      }
    });

  function triggerExplosion(room, x, y, radius, ownerId) {
    let hitSomething = false; // track if this explosion touched anything

    for (const id in room.players) {
      const p = room.players[id];
      if (p.health <= 0) continue;

      const dx = p.x - x;
      const dy = p.y - y;
      const dist = Math.hypot(dx, dy);

      if (dist < radius) {
        // Damage scales with distance
        const damage = Math.floor(40 * (1 - dist / radius));
        p.health -= damage;

        if (p.health <= 0 && room.players[ownerId]) {
          room.players[ownerId].score += 1;
          resetPlayer(p);
        }

        hitSomething = true; // touched a player
      }
    }

    // Optional: mark the explosion for client visual effect
    if (!room.explosions) room.explosions = [];
    room.explosions.push({ x, y, radius, timer: 20 });

    // Trigger explosion sound only once per explosion
    if (hitSomething) {
      io.to(Object.keys(room.players)).emit("playExplosionSound", { x, y });
    }
  }





    room.powerUps = room.powerUps.filter(pu => !pu.collected);

    // Reduce power-up timer
    for (const id in room.players) {
      const p = room.players[id];
      if (p.powerUpTimer > 0) {
        p.powerUpTimer--;
        if (p.powerUpTimer === 0) {
          p.speedMultiplier = 1;
          p.shootMultiplier = 1;
          p.SHOOTcd = 450;
        }
      }

      // Check max score
      if (p.score >= 5) {
        io.to(roomId).emit("gameOver", { winner: p.name });
        delete rooms[roomId];
        break;
      }
    }

    // Randomly spawn power-ups
    if (Math.random() < 0.0050) {
      const types = ["speed", "shoot", "explosive"];
      let x, y;
      let safe = false;

      while (!safe) {
        x = Math.random() * (GAME_WIDTH - 20) + 10;
        y = Math.random() * (GAME_HEIGHT - 20) + 10;

        // check collision with all obstacles
        safe = true;
        room.obstacles.forEach(o => {
          const size = 10;
          if (x + size > o.x && x - size < o.x + o.w &&
            y + size > o.y && y - size < o.y + o.h) {
            safe = false;
          }
        });
      }

      room.powerUps.push({ x, y, size: 10, type: types[Math.floor(Math.random() * types.length)] });
    }



    io.to(roomId).emit("state", {
      players: room.players,
      powerUps: room.powerUps,
      projectiles: room.projectiles,
      obstacles: room.obstacles,
      explosions: room.explosions || []
    });
  }
}, 1000 / 60);

// --- SOCKET CONNECTION ---
io.on("connection", socket => {
  // CHAT
  socket.on("chat", ({ roomId, message }) => {
    if (!rooms[roomId]) return;
    const player = rooms[roomId].players[socket.id];
    if (!player) return;
    const chatMsg = {
      name: player.name,
      text: message,
      color: player.color
    };
    io.to(roomId).emit("chatMessage", chatMsg);
  });

  socket.on("createRoom", ({ name, avatar }) => {
    const roomId = createRoomId();
    socket.join(roomId);
    rooms[roomId] = { players: {}, powerUps: [], projectiles: [], gameStarted: false, hostId: socket.id };
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name,
      avatar,
      x: Math.random() * (GAME_WIDTH - 100) + 50,
      y: Math.random() * (GAME_HEIGHT - 100) + 50,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      health: 100,
      score: 0,
      speedMultiplier: 1,
      shootMultiplier: 1,
      powerUpTimer: 0,
      isHost: true
    };
    socket.emit("roomCreated", { roomId });
    io.to(roomId).emit("roomPlayers", Object.values(rooms[roomId].players));
  });

  socket.on("joinRoom", ({ roomId, playerName, avatar }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit("joinError", "Room not found");
    if (room.gameStarted) return socket.emit("joinError", "Game already started");
    socket.join(roomId);
    room.players[socket.id] = {
      id: socket.id,
      name: playerName,
      avatar,
      x: Math.random() * 700 + 50,
      y: Math.random() * 500 + 50,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      health: 100,
      score: 0,
      speedMultiplier: 1,
      shootMultiplier: 1,
      powerUpTimer: 0,
      isHost: false
    };
    socket.emit("joinedRoom", { roomId });
    io.to(roomId).emit("roomPlayers", Object.values(room.players));
  });

  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.hostId) return;
    room.gameStarted = true;

    // === RANDOM MAP GENERATION ===
    const obstacleCount = 20; // tweak for density
    room.obstacles = [];

    const OBSTACLE_MARGIN = 100; // minimum distance from any player
    for (let i = 0; i < obstacleCount; i++) {
      const w = Math.random() * 150 + 50;
      const h = Math.random() * 150 + 50;
      let x, y;
      let valid = false;

      while (!valid) {
        x = Math.random() * (GAME_WIDTH - w);
        y = Math.random() * (GAME_HEIGHT - h);

        valid = true;
        // Check distance to all players
        for (const id in room.players) {
          const p = room.players[id];
          const closestX = Math.max(x, Math.min(p.x, x + w));
          const closestY = Math.max(y, Math.min(p.y, y + h));
          const dx = p.x - closestX;
          const dy = p.y - closestY;
          const dist = Math.hypot(dx, dy);
          if (dist < OBSTACLE_MARGIN) {
            valid = false; // too close, re-roll
            break;
          }
        }
      }

      room.obstacles.push({ x, y, w, h });
    }


    // === INITIAL POWERUPS ===
    room.powerUps.push({ x: 100, y: 100, size: 10, type: "speed" });
    room.powerUps.push({ x: 700, y: 500, size: 10, type: "shoot" });

    // Send map data to all players
    io.to(roomId).emit("gameStarted", { obstacles: room.obstacles });
  });


  socket.on("move", ({ roomId, keys }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    const spd = 2.5 * p.speedMultiplier;
    if (keys["ArrowUp"]) p.y -= spd;
    if (keys["ArrowDown"]) p.y += spd;
    if (keys["ArrowLeft"]) p.x -= spd;
    if (keys["ArrowRight"]) p.x += spd;
    // clamp
    p.x = Math.max(15, Math.min(GAME_WIDTH - 15, p.x));
    p.y = Math.max(15, Math.min(GAME_HEIGHT - 15, p.y));
    // --- COLLISION WITH OBSTACLES ---
    if (room.obstacles) {
      const playerRadius = 32.5; // match avatar radius
      room.obstacles.forEach(o => {
        // Find the closest point on the rectangle to the player's center
        const closestX = Math.max(o.x, Math.min(p.x, o.x + o.w));
        const closestY = Math.max(o.y, Math.min(p.y, o.y + o.h));

        // Distance from player center to closest point
        const dx = p.x - closestX;
        const dy = p.y - closestY;
        const distance = Math.hypot(dx, dy);

        if (distance < playerRadius) {
          // Collision happened
          const overlap = playerRadius - distance;

          // Normalize direction vector
          const angle = Math.atan2(dy, dx);
          p.x += Math.cos(angle) * overlap;
          p.y += Math.sin(angle) * overlap;
        }
      });
    }


  });

  socket.on("shoot", ({ roomId, targetX, targetY }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    if (!p.lastShoot) p.lastShoot = 0;
    const now = Date.now();
    const SHOOTcd = 450 / p.shootMultiplier;
    if (now - p.lastShoot < SHOOTcd) return; // prevent spamming
    p.lastShoot = now;

    const dx = targetX - p.x;
    const dy = targetY - p.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const speed = 20;

    room.projectiles.push({
      x: p.x,
      y: p.y,
      vx: dx / len * speed,
      vy: dy / len * speed,
      ownerId: socket.id,
      explosive: p.explosive
    });

    // ✅ Only emit this when a shot is actually fired
    io.to(roomId).emit("playerShot", { shooterId: socket.id });
  });


  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        const wasHost = room.hostId === socket.id;
        delete room.players[socket.id];
        io.to(roomId).emit("roomPlayers", Object.values(room.players));
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
        } else if (wasHost) {
          io.to(roomId).emit("gameOver", { reason: "Host left" });
          delete rooms[roomId];
        }
      }
    }
  });

});

server.listen(3000, () => console.log("Server running on port 3000"));
