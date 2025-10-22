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
  return Math.random().toString(36).substr(2,4).toUpperCase();
}

// --- GAME LOOP ---
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if(!room.gameStarted) continue;

    // Update projectiles
  room.projectiles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;

    for(const id in room.players){
      const player = room.players[id];
      if(player.health <= 0) continue;
      if(id === p.ownerId) continue;

      const playerRadius = 32.5; // matches avatarSize/2
      const projRadius = p.explosive ? 10 : 5;

      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const distance = Math.hypot(dx, dy);

      if(distance < playerRadius + projRadius){
        const shooter = room.players[p.ownerId];

        if(shooter && shooter.explosive){
          // Damage nearby players
          for(const otherId in room.players){
            const other = room.players[otherId];
            if(other.health <= 0) continue;

            const dist = Math.hypot(p.x - other.x, p.y - other.y);
            if(dist < 50){ // explosion radius
              other.health -= 20;
              if(other.health <= 0 && shooter) shooter.score += 1;
              if(other.health <= 0) resetPlayer(other);
            }
          }
        } else {
          // Normal projectile
          player.health -= 20;
          if(player.health <= 0 && shooter) shooter.score += 1;
          if(player.health <= 0) resetPlayer(player);
        }

        p.hit = true;
      }
    }
  });

  // --- Helper function to reset a dead player ---
  function resetPlayer(player){
    player.x = Math.random() * (GAME_WIDTH - 100) + 50;
    player.y = Math.random() * (GAME_HEIGHT - 100) + 50;
    player.health = 100;
    player.speedMultiplier = 1;
    player.shootMultiplier = 1;
    player.powerUpTimer = 0;
    io.to(player.id).emit("playerDied", { id: player.id });
  }



    // Remove hit or out-of-bounds projectiles
    room.projectiles = room.projectiles.filter(p => !p.hit && p.x>=0 && p.x<=GAME_WIDTH && p.y>=0 && p.y<=GAME_HEIGHT);


    // Power-up collection
    // Power-up collection
    // Power-up collection
    room.powerUps.forEach(pu => {
      for (const id in room.players) {
        const p = room.players[id];
        if (p.health <= 0) continue;
        const playerRadius = 32.5;
        const dx = pu.x - p.x;
        const dy = pu.y - p.y;
        const dist = Math.hypot(dx, dy);

        if(dist < playerRadius + pu.size){ // correct circle-to-circle check
          // Apply power-up
          if(pu.type === "speed") p.speedMultiplier = 2;
          if(pu.type === "shoot") p.shootMultiplier = 3;
          if(pu.type === "explosive") p.explosive = true;

          p.powerUpTimer = 600;
          pu.collected = true;
        }
      }
    });




    room.powerUps = room.powerUps.filter(pu => !pu.collected);

    // Reduce power-up timer
    for(const id in room.players){
      const p = room.players[id];
      if(p.powerUpTimer > 0){
        p.powerUpTimer--;
        if(p.powerUpTimer===0){
          p.speedMultiplier=1;
          p.shootMultiplier=1;
          p.SHOOTcd = 450;
        }
      }

      // Check max score
      if(p.score >= 5){
        io.to(roomId).emit("gameOver", { winner: p.name });
        delete rooms[roomId];
        break;
      }
    }

    // Randomly spawn power-ups
    if(Math.random() < 0.0015){ 
      const types = ["speed", "shoot", "explosive"];
      room.powerUps.push({
      x: Math.random() * (GAME_WIDTH - 20) + 10,
      y: Math.random() * (GAME_HEIGHT - 20) + 10,

        size: 10,
        type: types[Math.floor(Math.random()*types.length)]
      });
    }


    io.to(roomId).emit("state", {
      players: room.players,
      powerUps: room.powerUps,
      projectiles: room.projectiles
    });
  }
}, 1000/60);

// --- SOCKET CONNECTION ---
io.on("connection", socket => {
  // CHAT
  socket.on("chat", ({ roomId, message }) => {
    if(!rooms[roomId]) return;
    const player = rooms[roomId].players[socket.id];
    if(!player) return;
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
    rooms[roomId] = { players:{}, powerUps:[], projectiles:[], gameStarted:false, hostId: socket.id };
    rooms[roomId].players[socket.id] = {
      id: socket.id,
      name,
      avatar,
      x: Math.random() * (GAME_WIDTH - 100) + 50,
      y: Math.random() * (GAME_HEIGHT - 100) + 50,
      color: "#"+Math.floor(Math.random()*16777215).toString(16),
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
    if(!room) return socket.emit("joinError", "Room not found");
    if(room.gameStarted) return socket.emit("joinError","Game already started");
    socket.join(roomId);
    room.players[socket.id] = {
      id: socket.id,
      name: playerName,
      avatar,
      x: Math.random()*700+50,
      y: Math.random()*500+50,
      color: "#"+Math.floor(Math.random()*16777215).toString(16),
      health: 100,
      score: 0,
      speedMultiplier:1,
      shootMultiplier:1,
      powerUpTimer:0,
      isHost: false
    };
    socket.emit("joinedRoom",{ roomId });
    io.to(roomId).emit("roomPlayers", Object.values(room.players));
  });

  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if(!room || socket.id !== room.hostId) return;
    room.gameStarted = true;
    io.to(roomId).emit("gameStarted");
    // spawn initial power-ups
    room.powerUps.push({x:100,y:100,size:10,type:"speed"});
    room.powerUps.push({x:700,y:500,size:10,type:"shoot"});
  });

  socket.on("move", ({ roomId, keys }) => {
    const room = rooms[roomId];
    if(!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    const spd = 2.5 * p.speedMultiplier;
    if(keys["ArrowUp"]) p.y -= spd;
    if(keys["ArrowDown"]) p.y += spd;
    if(keys["ArrowLeft"]) p.x -= spd;
    if(keys["ArrowRight"]) p.x += spd;
    // clamp
    p.x = Math.max(15, Math.min(GAME_WIDTH - 15, p.x));
    p.y = Math.max(15, Math.min(GAME_HEIGHT - 15, p.y));

  });

  socket.on("shoot", ({ roomId, targetX, targetY }) => {
    const room = rooms[roomId];
    if(!room || !room.players[socket.id]) return;
    const p = room.players[socket.id];
    if(!p.lastShoot) p.lastShoot = 0;
    const now = Date.now();
    const SHOOTcd = 450 / p.shootMultiplier;
    if(now - p.lastShoot < SHOOTcd) return; // prevent spamming
    p.lastShoot = now;

    const dx = targetX - p.x;
    const dy = targetY - p.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    const speed = 20;

    room.projectiles.push({
      x: p.x,
      y: p.y,
      vx: dx/len*speed,
      vy: dy/len*speed,
      ownerId: socket.id,
      explosive: p.explosive
    });

    // ✅ Only emit this when a shot is actually fired
    io.to(roomId).emit("playerShot", { shooterId: socket.id });
  });


  socket.on("disconnect", () => {
    for(const roomId in rooms){
      const room = rooms[roomId];
      if(room.players[socket.id]){
        const wasHost = room.hostId === socket.id;
        delete room.players[socket.id];
        io.to(roomId).emit("roomPlayers", Object.values(room.players));
        if(Object.keys(room.players).length===0){
          delete rooms[roomId];
        } else if(wasHost){
          io.to(roomId).emit("gameOver",{ reason:"Host left" });
          delete rooms[roomId];
        }
      }
    }
  });

});

server.listen(3000, () => console.log("Server running on port 3000"));
