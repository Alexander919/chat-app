import express from "express";
import mongoose from "mongoose";
const app = express();
import http from "http";
const server = http.createServer(app);

const MAX_MSGS = 50;
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
import User from "./models/user.js";

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

async function getSocketByUsername(username, room) {
    //console.log(io.of("/").sockets.values);
    //console.log(io.sockets.sockets); //all connected sockets
    let roomSocs;
    if(room) {
        roomSocs = await io.in(room).fetchSockets(); // fetch all sockets in the room
    } else {
        roomSocs = await io.fetchSockets(); // fetch all connected sockets
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

function createMessage({ type="text", contents, username }) {
    const message = new Message();

    switch(type) {
        case "text":
            message.text = contents;
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
        text:     message.text = "",
        username: message.username = username
    } = message
    );

    message.save();

    return message;
}

io.use(async (socket, next) => {
    const connectedUsername = socket.handshake.auth.username;
    //find that username in db
    const oneUser = await User.findOne({ username: connectedUsername });
    if(!oneUser) {
        next(new Error("User error!"));
    } else {
        oneUser.isConnected = true;
        socket.user = oneUser;

        await oneUser.save();

        next();
    }
});

function getNumOfConnections(myUsername) {
    let numOfSocks = 0;
    for (let [id, { user: { username } }] of io.of("/").sockets) {
        if (myUsername === username) {
            numOfSocks++;
        }
    }
    return numOfSocks;
}

io.on("connection", socket => {
    //console.log(socket.handshake.headers.cookie);
    //const connectedUsername = socket.handshake.auth.username;
    if(socket.user) {
        //send to everyone except yourself
        socket.broadcast.emit("user connected", socket.user);
    }

    socket.on("connect_error", (err) => {
        console.log(`connect_error due to ${err.message}`);

        if(socket.user) {
            socket.user.isConnected = false;
            socket.user.save();
        }
    });

    socket.on("disconnect", async reason => {
        console.log(reason);

        if(!getNumOfConnections(socket.user.username)) { // check to see the user is still connected (multiple logins)
            socket.user.isConnected = false;
            socket.user.save();

            socket.broadcast.emit("user left", socket.user);
            socket.broadcast.emit("user typing", false, socket.user.username);
        }
    });

    socket.on("all users", async (callback) => {
        try {
            const users = await User.find();
            callback({ status: true, users });
        } catch (err) {
            callback({ status: false, err });
        }
    });

    socket.on("public chat", async () => {
        socket.join(PUBLIC_CHAT_ROOM);
        // populate message field and convert from { message: { text, username, time } } to { text, username, time }
        const pipe =  PublicMessage.aggregate([
            { $limit: MAX_MSGS }, 
            { $lookup: {
                "from": "messages",
                "localField": "message",
                "foreignField": "_id",
                "as": "msg" }
            }, 
            { $unwind: "$msg" }, 
            { $project: {   
                "text": "$msg.text", 
                "username": "$msg.username", 
                "time": "$msg.time", 
                "_id": 0 } 
            } 
        ]);
        const public_msgs = await pipe.exec();

        socket.emit("public chat", public_msgs);
        socket.to(PUBLIC_CHAT_ROOM).emit("i joined", socket.user.username);
    });

    socket.on("public message", data => {
        const msg = createMessage({ username: socket.user.username, ...data });
        PublicMessage.create({ sender: msg.username, message: msg._id });

        io.to(PUBLIC_CHAT_ROOM).emit("public message", msg);//send to everybody including myself
    });

    socket.on("private chat", async function (from, to) {
        if(from === to) return;

        let chatId = null;
        let history = null;

        const fromUser = await User.findOne({ username: from });
        const toUser = await User.findOne({ username: to });

        const chatObj = fromUser.chatIds.get(to);

        if(chatObj) {
            chatId = chatObj.id;
            history = await PrivateChat.findById(chatId).populate("messages");

            fromUser.chatIds.get(to).hasNewMessage = false;
        } else {
            const private_chat = await PrivateChat.create({});
            chatId = private_chat._id;

            fromUser.chatIds.set(to, { id: chatId, hasNewMessage: false });
            toUser.chatIds.set(from, { id: chatId, hasNewMessage: false });
        }
        fromUser.save();
        toUser.save();

        if(socket.rooms.has(PUBLIC_CHAT_ROOM)) //check if user is jumping between private chats
            socket.leave(PUBLIC_CHAT_ROOM);

        socket.join(chatId); // current user joins the room 'chatId'
        console.log("joined");

        socket.emit("private chat", { chatId, username: to, history: history?.messages });
        socket.to(chatId).emit("i joined", from);

        //io.sockets.sockets.forEach(socket => {
        //    console.log(socket.user);
        //});
    });
    socket.on("private message", async (data, { chatId, username: to }) => {
        const message = createMessage({ username: socket.user.username, ...data });

        const chat = await PrivateChat.findById(chatId);
        chat.messages.push(message._id);
        chat.save();

        const toSock = await getSocketByUsername(to); // look among all sockets
        if(toSock && toSock.rooms.has(chatId)) { // user is online and in the private room chatId
            io.to(chatId).emit("private message", message);// send to both
        } else { // user is offline or not in the room chatId
            const toUser = await User.findOne({ username: to });
            if(toSock) { // user is in some other room
                toSock.emit("has new message", to, socket.user);
            }
            toUser.chatIds.get(socket.user.username).hasNewMessage = true; //notify the user that he has new unread messages when he logges in
            toUser.save();
            socket.emit("private message", message);// send to myself
        }
    });

    socket.on("leave room", ({ username, chatId: room = PUBLIC_CHAT_ROOM }) => {
        console.log(`left room ${room} with user ${username}`);
        socket.leave(room);
    });

    socket.on("user typing", async (bool, typingUsername, selUser, toSpecificUsernames) => {
        if(selUser) { // to private chat
            const room = selUser.chatId;
            socket.to(room).emit("user typing", bool, typingUsername);
        } else if(toSpecificUsernames) {
            for(const usn of toSpecificUsernames) {
                const toSock = await getSocketByUsername(usn, PUBLIC_CHAT_ROOM);
                if(toSock) { // the check in case the 'toSpecificUsername' left the public chat room
                    toSock.emit("user typing", bool, typingUsername);
                }
            }
        } else {
            socket.to(PUBLIC_CHAT_ROOM).emit("user typing", bool, typingUsername);
        }
    });
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});