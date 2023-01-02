import express from "express";
import mongoose from "mongoose";
const app = express();
import http from "http";
const server = http.createServer(app);

import users from "./users.js";
import privateChats from "./private-chats.js";
import publicChat from "./public-chat.js";

const { randomBytes } = await import('node:crypto');
import { Server } from "socket.io";
const io = new Server(server, {
    cookie: true,
    cors: {
        origin: "http://localhost:8080"
    }
});

mongoose.set('strictQuery', true);

//MongoDB setup
async function main() {
    await mongoose.connect('mongodb://databaseserver:27017/mongochat');
    console.log("Database connected.");
}

main().catch(err => console.log(err));

app.use(express.static('public'));
app.set("view engine", "ejs");

function generateId() {
    return randomBytes(16).toString("hex");
}

app.get("/", (req, res) => {
    res.render("root");
});

app.get("/chat", (req, res) => {
    res.render("chat");
});

//TODO: make a createMessage(messageType) function
//messageType can be: text, image, url, etc
io.on("connection", socket => {
    //console.log(socket.handshake.headers.cookie);
    //console.log(io.sockets.sockets); //all connected sockets
    const connectedUsername = socket.handshake.auth.username;
    //find that username in db
    const user = users.find(user => user.username === connectedUsername);
    //TODO: check if user exists
    user.isConnected = true;

    socket.user = user;
    //send to self
    socket.emit("all users", users);
    //send to everyone except yourself
    socket.broadcast.emit("user connected", {
        username: connectedUsername
    });

    socket.on("disconnect", reason => {
        console.log(reason);

        socket.user.isConnected = false;
        socket.broadcast.emit("user left", socket.user);
    });

    socket.on("public chat", function() {
        //TODO: return last say 50 messages
        socket.emit("public chat", publicChat);
    });

    socket.on("public message", msg => {
        const message = { text: msg, user: socket.user, time: new Date().toLocaleTimeString() };
        publicChat.push(message);
        io.emit("public message", message);
    });

    //TODO: check that users exist
    socket.on("create private chat", function (from, to) {
        if(from === to) return;

        let chatId;
        let history;

        const fromUser = users.find(user => user.username === from); //find the 'from' user
        const chatObj = fromUser.chatIds[to]; //check if the 'from' user has a chat with 'to' user

        if(chatObj) {
            chatId = chatObj.id;
            history = privateChats.get(chatId);

            fromUser.chatIds[to].hasNewMessage = false;//disable new message notification
        } else {
            chatId = generateId();//generate new chatId
            privateChats.set(chatId, []);

            const toUser = users.find(user => user.username === to); //find the 'to' user

            fromUser.chatIds[to] = { id: chatId, hasNewMessage: false };
            toUser.chatIds[from] = { id: chatId, hasNewMessage: false };
        }
        socket.join(chatId);
        console.log("joined");

        return socket.emit("private chat", { chatId, username: to, history });

        //io.sockets.sockets.forEach(socket => {
        //    console.log(socket.user);
        //});
        //for(let [id, socket]of io.of("/").sockets) {
        //    console.log(id);
        //}
    });
    socket.on("private message", (msg, {chatId, username: to}) => {
        const message = { text: msg, user: socket.user, time: new Date().toLocaleTimeString() };
        const chat = privateChats.get(chatId);
        chat.push(message);
        
        const toUser = users.find(user => user.username === to); //find the 'to' user

        if(!toUser.isConnected) { //user is offline
            //user = { username, chatIds: chatee: { chatId, hasNewMessage } }
            toUser.chatIds[socket.user.username].hasNewMessage = true; //notify the user that he has new unread messages when he logges in
        }
        //send to all users in the room including the sender
        io.to(chatId).emit("private message", message);
    });

    //socket.on("typing", msg => {
    //    socket.broadcast.emit("typing", msg);
    //});
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});