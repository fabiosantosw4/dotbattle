const socket = io();

// Canvas setup
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 800;
canvas.height = 600;

// Player state
let roomId = null;
let players = {};
let projectiles = [];
let powerUps = [];

// Input state
const input = { up: false, down: false, left: false, right: false };

// --- KEY HANDLING ---
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") input.up = true;
  if (e.key === "ArrowDown") input.down = true;
  if (e.key === "ArrowLeft") input.left = true;
  if (e.key === "ArrowRight") input.right = true;

  sendInput();
});

window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowUp") input.up = false;
  if (e.key === "ArrowDown") input.down = false;
  if (e.key === "ArrowLeft") input.left = false;
  if (e.key === "ArrowRight") input.right = false;

  sendInput();
});

// send input to server
function sendInput() {
  if (!roomId) return;
  socket.emit("input", { roomId, input });
}

// --- SHOOT ---
canvas.addEventListener("click", (e) => {
  if (!roomId) return;
  const rect = canvas.getBoundingClientRect();
  const targetX = e.clientX - rect.left;
  const targetY = e.clientY - rect.top;
  socket.emit("shoot", { roomId, targetX, targetY });
});

// --- ROOM / GAME ---
function createRoom(name) {
  socket.emit("createRoom", name);
}

function joinRoom(id, name) {
  socket.emit("joinRoom", { roomId: id, playerName: name });
}

function startGame() {
  if (!roomId) return;
  socket.emit("startGame", roomId);
}

// --- SOCKET EVENTS ---
socket.on("roomCreated", (data) => {
  roomId = data.roomId;
  console.log("Room created:", roomId);
});

socket.on("joinedRoom", (data) => {
  roomId = data.roomId;
  console.log("Joined room:", roomId);
});

socket.on("roomPlayers", (plist) => {
  players = {};
  plist.forEach(p => players[p.id] = p);
});

socket.on("gameStarted", () => {
  console.log("Game started!");
});

socket.on("state", (state) => {
  players = state.players;
  projectiles = state.projectiles;
  powerUps = state.powerUps;
});

// --- RENDER LOOP ---
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw power-ups
  powerUps.forEach(pu => {
    ctx.fillStyle = pu.type === "speed" ? "yellow" : "purple";
    ctx.fillRect(pu.x - pu.size/2, pu.y - pu.size/2, pu.size, pu.size);
  });

  // Draw projectiles
  ctx.fillStyle = "red";
  projectiles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
    ctx.fill();
  });

  // Draw players
  for (const id in players) {
    const p = players[id];
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI*2);
    ctx.fill();

    // health bar
    ctx.fillStyle = "black";
    ctx.fillRect(p.x - 15, p.y - 25, 30, 5);
    ctx.fillStyle = "lime";
    ctx.fillRect(p.x - 15, p.y - 25, 30 * (p.health / 100), 5);
  }

  requestAnimationFrame(render);
}

render();
