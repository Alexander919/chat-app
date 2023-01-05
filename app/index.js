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
    //TODO: all new users join the public_chat_room
    //later if they join some private room they leave public room and vice versa
    const connectedUsername = socket.handshake.auth.username;
    //find that username in db
    const user = users.find(user => user.username === connectedUsername);

    if(user.isConnected || !user) {
        return socket.emit("bad connection");
    }
    user.isConnected = true;

    socket.user = user;
    //send to self
    socket.emit("all users", users);
    //TODO: return last say 50 messages
    socket.emit("public chat", publicChat);
    //send to everyone except yourself
    socket.broadcast.emit("user connected", user, true);

    socket.on("disconnect", reason => {
        console.log(reason);

        socket.user.isConnected = false;
        socket.broadcast.emit("user left", socket.user, false);
    });

    socket.on("leave room", chatId => {
        socket.leave(chatId);
    });

    socket.on("public chat", function() {
        socket.emit("public chat", publicChat);
    });

    socket.on("public message", msg => {
        const message = { text: msg, user: socket.user, time: new Date().toLocaleTimeString() };
        publicChat.push(message);
        io.emit("public message", message);//send to everybody including myself
    });

    //TODO: check that users exist
    socket.on("private chat", function (from, to) {
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

        socket.join(chatId); // current user joins the room 'chatId'
        console.log("joined");

        return socket.emit("private chat", { chatId, username: to, history });

        //io.sockets.sockets.forEach(socket => {
        //    console.log(socket.user);
        //});
        //for(let [id, socket]of io.of("/").sockets) {
        //    console.log(id);
        //}
    });
    socket.on("private message", async (msg, { chatId, username: to }) => {
        const message = { text: msg, user: socket.user, time: new Date().toLocaleTimeString() };

        const chat = privateChats.get(chatId);
        chat.push(message);
        
        const toUser = users.find(user => user.username === to); //find the 'to' user

        const usersInRoom = await io.in(chatId).fetchSockets();//fetch sockets from the room 'chatId'
        //console.log("users in the room", usersInRoom.length);
        if (usersInRoom.length > 1) { // toUser is in the room
            io.to(chatId).emit("private message", message);// send to both
        } else {
            if(toUser.isConnected) {
                //TODO: send to the required user only
                socket.broadcast.emit("has new message", toUser, socket.user, chatId); //send notification to all users except myself
            }
            toUser.chatIds[socket.user.username].hasNewMessage = true; //notify the user that he has new unread messages when he logges in
            socket.emit("private message", message);// send to myself
        }
    });

    //TODO: join into one event called 'typing'
    socket.on("started typing", (username, selUser) => {
        console.log("received 'started typing'");
        console.log("selected user", selUser);
        if(selUser) {
            const room = selUser.chatId;
            return socket.to(room).emit("started typing", username);
        }
        socket.broadcast.emit("started typing", username);
    });

    socket.on("stopped typing", (username, selUser) => {
        console.log("received 'stopped typing'");
        console.log("selected user", selUser);
        if(selUser) {
            const room = selUser.chatId;
            return socket.to(room).emit("stopped typing", username);
        }
        socket.broadcast.emit("stopped typing", username);
    });

    //socket.on("has new message", (bool, chatee, me, chatId) => {
    //    const user = users.find(user => user.username === me.username);
    //    user.chatIds[chatee.username] = { id: chatId, hasNewMessage: bool };
    //});

    //socket.on("typing", msg => {
    //    socket.broadcast.emit("typing", msg);
    //});
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});