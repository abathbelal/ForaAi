const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let rooms = {};

// ------------------------------
// Lobby
// ------------------------------
io.on("connection", socket => {

    socket.on("joinLobby", ({ username, room }) => {
        socket.join(room);

        if (!rooms[room]) rooms[room] = {
            players: [],
            history: []
        };

        rooms[room].players.push({ id: socket.id, username });

        io.to(room).emit("updatePlayers",
            rooms[room].players.map(p => p.username)
        );
    });

    socket.on("startGame", room => {
        io.to(room).emit("begin");
    });

    // ------------------------------
    // Game
    // ------------------------------
    socket.on("joinGame", ({ username, room }) => {
        socket.join(room);

        if (!rooms[room]) return;

        // assign roles
        const players = rooms[room].players;
        const ai = players[Math.floor(Math.random() * players.length)];
        const prompter = players.find(p => p !== ai);

        io.to(ai.id).emit("role", "ai");
        io.to(prompter.id).emit("role", "prompter");

        startTimer(room);
    });

    socket.on("prompt", ({ room, text }) => {
        io.to(room).emit("prompt", text);
    });

    // Drawing sync
    socket.on("draw", data => {
        socket.to(data.room).emit("draw", data);
    });

    // Chat
    socket.on("chat", data => {
        io.to(data.room).emit("chat", data);
    });

    // Voting
    socket.on("vote", ({ room, voter, score }) => {
        if (!rooms[room].currentVotes) rooms[room].currentVotes = [];
        rooms[room].currentVotes.push(score);

        if (rooms[room].currentVotes.length === rooms[room].players.length - 1) {
            endRound(room);
        }
    });
});

// ------------------------------
// Timer
// ------------------------------
function startTimer(room) {
    let t = 60;
    const i = setInterval(() => {
        io.to(room).emit("timer", t--);
        if (t < 0) {
            clearInterval(i);
            io.to(room).emit("voteStart");
        }
    }, 1000);
}

// ------------------------------
// End Round
// ------------------------------
function endRound(room) {
    const votes = rooms[room].currentVotes;
    const lastPrompt = rooms[room].lastPrompt || "unknown";
    const ai = rooms[room].players[0].username; // simplified

    const item = { prompt: lastPrompt, ai, votes };
    rooms[room].history.push(item);

    io.to(room).emit("history", item);

    rooms[room].currentVotes = [];
}

server.listen(3000, () => console.log("Server running"));