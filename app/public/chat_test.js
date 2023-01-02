import socket from "./sock.js";
//TODO: make global variables uppercase
let allUsers;

const username = getUsernameFromParams("username");
//TODO: check if username exists, if not redirect to /
let selectedUser = null; //if no user is selected your messages go to public chat
let ME;

const friends = document.getElementById("friends");
const sendForm = document.getElementById("sendForm");
const sendInput = document.getElementById("sendInput");
const messages = document.getElementById("messages");

socket.connect();
//pass in username to the server socket
socket.auth = { username };

function getUsernameFromParams(param) {
    const url = new URL(window.location.href);
    const search = new URLSearchParams(url.search);

    return search.get(param);
}

sendForm.addEventListener("submit", e => {
    e.preventDefault();

    const message = sendInput.value;
    if(message.trim() === "") return;

    if(selectedUser) {
        socket.emit("private message", message, selectedUser);
    } else {
        socket.emit("public message", message);
    }
});

function getUser(usernameToFind) {
    const user = allUsers.find(user => user.username === usernameToFind);
    if(!user) {
        throw new Error(`User ${username} not found!`);
    }
    return user;
}

function setHasNewMessageTo(bool, usernameToFind) {
    const user = getUser(usernameToFind);
    const chat = user.chatIds[username];
    if(chat) {
        chat.hasNewMessage = bool;
    }
}

friends.addEventListener("click", (e) => {
    const li = e.target;
    li.style.color = "blue";
    const toUser = li.id;
    const fromUser = username;

    const toUserObj = allUsers.find(user => user.username === toUser);
    console.log(toUserObj);
    setHasNewMessageTo(false, toUser);

    socket.emit("create private chat", fromUser, toUser);
});

//socket.emit("online", {username, data: "bla"});
function meFirst(a, b) {
    if(a.me)
        return -1;
    else if(b.me)
        return 1;
    else
        return a - b;
}

function getNewMessageUsers(me) {
    const chatsIds = Object.entries(me.chatIds);

    return chatsIds.filter(([_, chatObj]) => chatObj.hasNewMessage)
            .map(([user, _]) => user);
}

function renderUsers(users) {
    const me = users.find(user => user.username === username);
    const newMessageFromUsers = getNewMessageUsers(me);

    const usersList = document.getElementById("friends");
    usersList.innerHTML = "";

    users.forEach(user => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        if(user.me) {
            li.textContent = `${user.username}(Me)`;
        } else {
            a.href = "#";
            if(newMessageFromUsers.includes(user.username)) {
                li.style.color = "green";
            } else {
                li.style.color = "blue";
            }
            li.id = user.username;
            li.textContent = `${user.username}(${user.isConnected ? 'online' : 'offline'})`;
        }
        a.appendChild(li);
        //li.addEventListener("click", privateChat);
        usersList.appendChild(a);
    });
}
function appendUser(user) {

}

function appendMessage(msg) {
    const li = document.createElement("li");
    msg.me = msg.user.username === username;

    li.innerHTML = `<em>${msg.time}</em> | ${msg.me ? '<strong>Me</strong>' : msg.user.username} > ${msg.text}`;
    messages.appendChild(li);
}

function renderChat(chat) {
    messages.innerHTML = "";

    chat.forEach(appendMessage);
}

function scrollBottom() {
    window.scrollTo(0, document.body.scrollHeight);
}

//TODO: need one protocol for all events e.g. username as a first argument
//then we can make a list of events that require the toUser and find it before any other event is fired
socket.prependAny((eventName, ...args) => {

});

socket.on("user left", leftUser => {
    const cUser = allUsers.find(user => user.username === leftUser.username);
    cUser.isConnected = false;
    renderUsers(allUsers);
});

socket.on("user connected", connectedUser => {
    //TODO: print to chat that user is connected
    const cUser = allUsers.find(user => user.username === connectedUser.username);
    cUser.isConnected = true;
    renderUsers(allUsers);
});

//render the list of users
socket.on("all users", users => {
    users.forEach(user => {
        if(user.username === username) {
            user.me = true;
        }
    });
    users.sort(meFirst);
    allUsers = users;

    renderUsers(allUsers);
});

socket.on("public message", msg => {
    appendMessage(msg);
    scrollBottom();
});

socket.on("private message", (message) => {
    console.log("private message", message);
    if(selectedUser && ((message.user.username === selectedUser.username) || (message.user.username === username))) { //user selected or self
        appendMessage(message);
    } else {
        const toUser = allUsers.find(user => user.username === message.user.username);
        toUser.chatIds[username].hasNewMessage = true; // toUser.chatIds[chatee].hasNewMessage = true
        renderUsers(allUsers);
    }
    scrollBottom();
});
//render public chat history
socket.on("public chat", publicChat => {
    renderChat(publicChat);
});

//TODO:add isSelected to each user. if some user is selected then send the message to that recepient, if not send to public chat
socket.on("private chat", ({ chatId, username: toUsername, history }) => {
    //TODO: figure out if I need the next two lines
    const recepient = allUsers.find(user => user.username === toUsername);
    recepient.chatIds[username] = { id: chatId, hasNewMessage: false }; //username is clients' username(global)
    //recepient.isSelected = true;
    selectedUser = { username: toUsername, chatId };
    socket.off("public message");

    if(history) {
        renderChat(history);
    } else {
        messages.innerHTML = "";
    }
    //console.log("selected user", selectedUser);
    //console.log("recepient", recepient);
});

socket.on("connect", function() {
    socket.emit("public chat");
});

//TODO: when one user opens two tabs and then closes one of them he is seen as offline to everyone else

