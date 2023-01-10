import express from "express";
import mongoose from "mongoose";
const app = express();
import http from "http";
const server = http.createServer(app);

import USERS from "./users.js";
import PRIVATE_CHATS from "./private-chats.js";
import PUBLIC_CHAT from "./public-chat.js";

const PUBLIC_CHAT_ROOM = "public_chat";

const { randomBytes } = await import('node:crypto');
import { Server } from "socket.io";
const io = new Server(server, {
    cookie: true,
    cors: {
        origin: "http://localhost:8080"
    }
});

//MongoDB
import Message from "./models/message.js";
import PublicMessage from "./models/public_chat.js";
import PrivateChat from "./models/private_chat.js";

mongoose.set('strictQuery', true);

(async function() {
    await mongoose.connect('mongodb://databaseserver:27017/mongochat');
    console.log("Database connected.");
})()
.catch(err => console.log(err));

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

app.get("/mongoose", (req, res) => {
    res.render("mongoose");
});

app.get("/mongoose/show/", async (req, res) => {
    //const msgs = await Message.findOne({username: "alex"});
    //const maps = await privateMessage.findOne().populate("_keys.77778888");
    //TODO: if decide to use Map:
    //there will be only ONE Map. findOne() with no arguments returns the first object
    //use it to find the chatId needed:
    //const map = await privateMessage.findOne().populate("_keys");
    //const map = await privateMessage.findOne().exists("_keys.asdfadsf");
    const map = await PrivateChat.findOne({ chatId: "zzz" }).populate("messages");
    //map.get(`_keys.${chatId}`)
    //const map = await privateMessage.findOne().populate("_keys.11113333");
    //const map = await privateMessage.findOne({chatId: "jkjdlsjkjfslkd"});
    console.log(map);
    res.end();
});

app.get("/mongoose/submit/", async (req, res) => {
    const { text, username } = req.query;
    //console.log(text, username);

    const msg = new Message({ text, username });
    //const privMsg = new PrivateChat({ chatId: "zzz"});
    //privMsg.messages.push(msg._id);
    //await privMsg.save();

    //const map = await PrivateChat.findOne({ chatId: "zzz" });
    //map.messages.push(msg._id);
    //await map.save();

    const pubMsg = new PublicMessage({sender: username, message: msg._id});
    await pubMsg.save();

    await msg.save();

    res.send("submitted");
});

async function getSocketByUsername(username, room) {
    //console.log(io.of("/").sockets.values);
    //console.log(io.sockets.sockets); //all connected sockets
    //await io.in("room1").fetchSockets();
    //await io.fetchSockets();
    let roomSocs;
    if(room) {
        roomSocs = await io.in(room).fetchSockets();
    } else {
        roomSocs = await io.fetchSockets(); 
    }
    return roomSocs.find(soc => soc.user.username === username);
    //let sock = null;
    //for (const [_, s] of io.of("/").sockets.in(PUBLIC_CHAT_ROOM)) {
    //    console.log(s.user.username);
    //    //if(s.user.username === username) {
    //    //    sock = s;
    //    //    break;
    //    //}
    //}
    //return sock;
}

function createMessage(type, message) {
    //const message = { user, time: new Date().toLocaleTimeString() };
    let contents = "I don't know what you are";

    switch(type) {
        case "text":
            contents = msg;
            break;
        case "img":
            break;
        case "url":
            break;
        case "file":
            break;
        default:
            //leave contents unchanged
    }
    ({
        time:       message.time = new Date().toLocaleTimeString(),
        contents:   message.contents = contents,
        user:       message.user = "unknown"
    } = message);
}

//TODO: make a createMessage(messageType) function
//messageType can be: text, image, url, etc
io.on("connection", socket => {
    //console.log(socket.handshake.headers.cookie);
    const connectedUsername = socket.handshake.auth.username;
    //find that username in db
    const user = USERS.find(user => user.username === connectedUsername);

    if(!user || user.isConnected) {
        return socket.emit("bad connection");
    }
    user.isConnected = true;
    socket.user = user;

    //************************************** */
    //send to self
    socket.emit("all users", USERS);
    //send to everyone except yourself
    socket.broadcast.emit("user connected", user);
    //************************************** */
    socket.on("disconnect", reason => {
        console.log(reason);

        socket.user.isConnected = false;
        socket.broadcast.emit("user left", socket.user);
        socket.broadcast.emit("user typing", false, socket.user.username);
    });

    socket.on("public chat", function() {
        socket.join(PUBLIC_CHAT_ROOM);
        //TODO: return last say 50 messages
        socket.emit("public chat", PUBLIC_CHAT);
        console.log("in public chat emitting i joined to", PUBLIC_CHAT_ROOM);
        socket.to(PUBLIC_CHAT_ROOM).emit("i joined", socket.user.username);
    });

    socket.on("public message", msg => {
        const message = { text: msg, user: socket.user, time: new Date().toLocaleTimeString() };
        PUBLIC_CHAT.push(message);
        io.to(PUBLIC_CHAT_ROOM).emit("public message", message);//send to everybody including myself
    });

    //TODO: check that users exist
    socket.on("private chat", function (from, to) {
        if(from === to) return;
        console.log("private chat from to", from, to);

        let chatId;
        let history;

        const fromUser = USERS.find(user => user.username === from); //find the 'from' user
        const chatObj = fromUser.chatIds[to]; //check if the 'from' user has a chat with 'to' user

        if(chatObj) {
            chatId = chatObj.id;
            history = PRIVATE_CHATS.get(chatId);

            fromUser.chatIds[to].hasNewMessage = false;//disable new message notification
        } else {
            chatId = generateId();//generate new chatId
            PRIVATE_CHATS.set(chatId, []);

            const toUser = USERS.find(user => user.username === to); //find the 'to' user

            fromUser.chatIds[to] = { id: chatId, hasNewMessage: false };
            toUser.chatIds[from] = { id: chatId, hasNewMessage: false };
        }

        if(socket.rooms.has(PUBLIC_CHAT_ROOM)) //check if user is jumping between private chats
            socket.leave(PUBLIC_CHAT_ROOM);

        socket.join(chatId); // current user joins the room 'chatId'
        console.log("joined");

        socket.emit("private chat", { chatId, username: to, history });
        socket.to(chatId).emit("i joined", from);

        //io.sockets.sockets.forEach(socket => {
        //    console.log(socket.user);
        //});
        //for(let [id, socket]of io.of("/").sockets) {
        //    console.log(id);
        //}
    });
    socket.on("private message", async (msg, { chatId, username: to }) => {
        const message = { text: msg, user: socket.user, time: new Date().toLocaleTimeString() };

        const chat = PRIVATE_CHATS.get(chatId);
        chat.push(message);
        //TODO: use getSocketByUsername to find the 'to' user in the room, then check for null and if the socket is online
        const toUser = USERS.find(user => user.username === to); //find the 'to' user

        const usersInRoom = await io.in(chatId).fetchSockets();//fetch sockets from the room 'chatId'
        //TODO: we can find toUser socket and use socket.rooms.has(chatId)
        if (usersInRoom.length > 1) { // toUser is in the room
            io.to(chatId).emit("private message", message);// send to both
        } else {
            if(toUser.isConnected) {
                const toSock = await getSocketByUsername(toUser.username);
                toSock.emit("has new message", toUser, socket.user, chatId); //send notification to all users except myself
            }
            toUser.chatIds[socket.user.username].hasNewMessage = true; //notify the user that he has new unread messages when he logges in
            socket.emit("private message", message);// send to myself
        }
    });

    socket.on("leave room", ({ username, chatId: room = PUBLIC_CHAT_ROOM }) => {
        //socket.to(room).emit("user typing", false, socket.user.username);

        //if(username) { //leaving private room
        //    //const toSock = getSocketByUsername(username);
        //    //if (toSock) {
        //        //console.log("leave room", toSock);
        //        //toSock.emit("user typing", false, socket.user.username);
        //    //}
        //} else {
        //    console.log("leave public room");
        //    socket.to(PUBLIC_CHAT_ROOM).emit("user typing", false, socket.user.username);
        //}
        console.log("left room with user", username);
        socket.leave(room);
    });

    socket.on("user typing", async (bool, typingUsername, selUser, toSpecificUsernames) => {
        console.log(bool ? "started typing" : "stopped typing");
        console.log("selected user", selUser);
        if(selUser) { // to private chat
            const room = selUser.chatId;
            socket.to(room).emit("user typing", bool, typingUsername);
        } else if(toSpecificUsernames) {
            toSpecificUsernames.forEach(async usn => {
                const toSock = await getSocketByUsername(usn, PUBLIC_CHAT_ROOM);
                if(toSock) { // the check in case the 'toSpecificUsername' left the public chat room
                    console.log("user typing > toSpecificUser", usn, toSock.user.username);
                    toSock.emit("user typing", bool, typingUsername);
                }
            });
            //const toSock = await getSocketByUsername(toSpecificUsername, PUBLIC_CHAT_ROOM);
            //if(toSock) { // the check in case the 'toSpecificUsername' left the public chat room
            //    console.log("user typing > toSpecificUser", toSpecificUsername, toSock.user.username);
            //    toSock.emit("user typing", bool, typingUsername);
            //}
        } else {
            socket.to(PUBLIC_CHAT_ROOM).emit("user typing", bool, typingUsername);
        }
    });
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});