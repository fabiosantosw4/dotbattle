const socket = io();
let currentRoom = null;
let isHost = false;

// DOM elements
const menu = document.getElementById("menu");
const lobby = document.getElementById("lobby");
const game = document.getElementById("game");

const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const startGameBtn = document.getElementById("startGameBtn");

const nicknameInput = document.getElementById("nickname");
const roomIdInput = document.getElementById("roomIdInput");
const roomIdDisplay = document.getElementById("roomIdDisplay");
const playerList = document.getElementById("playerList");
const errorMsg = document.getElementById("errorMsg");

const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendChat = document.getElementById("sendChat");
const chatBoxGame = document.getElementById("chatBoxGame");
const chatInputGame = document.getElementById("chatInputGame");
const sendChatGame = document.getElementById("sendChatGame");

// --- Create Room ---
createRoomBtn.onclick = () => {
  const name = nicknameInput.value.trim() || "Player";
  socket.emit("createRoom", name);
  isHost = true;
};

// --- Join Room ---
joinRoomBtn.onclick = () => {
  const name = nicknameInput.value.trim() || "Player";
  const roomId = roomIdInput.value.trim();
  if (!roomId) return alert("Enter room ID");
  socket.emit("joinRoom", { roomId, playerName: name });
  isHost = false;
};

// --- Show Lobby ---
function showLobby(players, roomId) {
  menu.classList.remove("active");
  lobby.classList.add("active");
  roomIdDisplay.textContent = roomId;
  playerList.innerHTML = Object.values(players)
    .map(p => `<div>${p.name}${p.id === socket.id ? " (You)" : ""}${p.isHost ? " (Host)" : ""}</div>`)
    .join("");

  startGameBtn.style.display = isHost ? "block" : "none";
}

// --- Listen to server ---
socket.on("roomCreated", ({ roomId }) => {
  currentRoom = roomId;
  console.log("Room created:", roomId);
});

socket.on("roomPlayers", (players) => {
  if (!currentRoom && players.length > 0) currentRoom = players[0].roomId || currentRoom;
  showLobby(players, currentRoom);
});

socket.on("gameStarted", () => {
  lobby.classList.remove("active");
  game.classList.add("active");
  startGame();
});

socket.on("errorMsg", (msg) => {
  alert(msg);
});

// --- Chat ---
function sendMessage(input) {
  const msg = input.value.trim();
  if (!msg || !currentRoom) return;
  socket.emit("chatMessage", { roomId: currentRoom, message: msg });
  input.value = "";
}

sendChat.onclick = () => sendMessage(chatInput);
sendChatGame.onclick = () => sendMessage(chatInputGame);

socket.on("chatMessage", ({ sender, message }) => {
  const msgElem = document.createElement("div");
  msgElem.textContent = `[${new Date().toLocaleTimeString()}] ${sender}: ${message}`;
  chatBox.appendChild(msgElem.cloneNode(true));
  chatBoxGame.appendChild(msgElem);
  chatBox.scrollTop = chatBox.scrollHeight;
  chatBoxGame.scrollTop = chatBoxGame.scrollHeight;
});

// --- Start Game ---
startGameBtn.onclick = () => {
  if (currentRoom && isHost) socket.emit("startGame", currentRoom);
};
