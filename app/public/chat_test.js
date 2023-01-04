import socket from "./sock.js";
//TODO: make global variables uppercase
let allUsers;

//const username = getUsernameFromParams("username");
const USERNAME = getUsernameFromParams("username");
//TODO: check if username exists, if not redirect to /
let selectedUser = null; //if no user is selected your messages go to public chat
let ME; //my user object

const friends = document.getElementById("friends");
const sendForm = document.getElementById("sendForm");
const sendInput = document.getElementById("sendInput");
const messages = document.getElementById("messages");
const roomTitle = document.getElementById("room");
const commonRoomLink = document.getElementById("common");

socket.connect();
//pass in username to the server socket
socket.auth = { username: USERNAME };

sendInput.focus();

function getUsernameFromParams(param) {
    const url = new URL(window.location.href);
    const search = new URLSearchParams(url.search);

    return search.get(param);
}

commonRoomLink.addEventListener("click", (e) => {
    e.preventDefault();
    if(selectedUser) {
        socket.emit("leave room", selectedUser.chatId); //leave current room


        socket.emit("public chat"); //load public chat
    }
    sendInput.focus();
});

sendForm.addEventListener("submit", e => {
    e.preventDefault();

    const input = sendInput.value;
    if(input.trim() === "") return;

    if(selectedUser) {
        socket.emit("private message", input, selectedUser);
    } else {
        socket.emit("public message", input);
    }
    sendInput.value = "";
});

function getUser(usernameToFind) {
    const user = allUsers.find(user => user.username === usernameToFind);
    if(!user) {
        throw new Error(`User ${usernameToFind} not found!`);
    }
    return user;
}
//default value for 'id' is null
//second parameter must look like this: 
//{ 
//    username: "chater", 
//    chatIds: { "chatee": {  // [myUsername]
//                      id: "chatId",
//                      hasNewMessage
//                      }
//    }
//}
//If alex is trying to chat with john(current user)
// fromUser object(the one that is being destructured)
//{  
//    username: "alex", 
//    chatIds: { "john": {
//                          id: "14134134123",
//                          hasNewMessage
//                      }
//    }
//}
//alex becomes the chatee to john
//chat = me.chatIds[chatee] = { id };

//function setHasNewMessageTo(bool, { username: chatee, chatIds: { [username]: { id } = { id: null } } }) {
function setHasNewMessageTo(bool, { username: chatee, chatIds }) {
    //destructuring: computed property name [myUsername] destructures the object that it contains { id: "chatId", hasNewMessage } to retrieve the 'id'
    const { [USERNAME]: { id } } = chatIds;

    if(id === null) {
        throw new Error(`Chat with the user ${chatee} does not exist!`);
    }

    const me = getUser(USERNAME);
    let chat = me.chatIds[chatee];

    if(!chat) {
        //save the chat id
        chat = me.chatIds[chatee] = { id };
    }
    chat.hasNewMessage = bool;
}

friends.addEventListener("click", e => {
    const li = e.target;
    const toUser = li.id;
    const fromUser = USERNAME;
    console.log(toUser);

    if(selectedUser) { //jumping between private chats
        socket.emit("leave room", selectedUser.chatId);
    }

    socket.emit("private chat", fromUser, toUser);
    sendInput.focus();
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
    const me = users.find(user => user.username === USERNAME);
    const newMessageFromUsers = getNewMessageUsers(me);

    //const usersList = document.getElementById("friends");
    friends.innerHTML = "";

    users.forEach(user => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        if(user.me) {
            li.textContent = `${user.username}(Me)`;
        } else {
            a.href = "#";
            //any new messages from user?
            if(newMessageFromUsers.includes(user.username)) {
                li.style.color = "green";
            } else {
                li.style.color = "blue";
            }

            //highlight selected user
            if(selectedUser && (user.username === selectedUser.username)) {
                li.style.backgroundColor = "lightgrey";
            }

            li.id = user.username;
            li.textContent = `${user.username}(${user.isConnected ? 'online' : 'offline'})`;
        }
        a.appendChild(li);
        friends.appendChild(a);
    });
}
function appendUser(user) {

}

function appendMessage(msg) {
    const li = document.createElement("li");
    msg.me = msg.user.username === USERNAME;

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

function userJoinedLeft(user, joined) {
    if(selectedUser && selectedUser.username !== user) return;//print only if we are in the Common Room or chatting with that person
    const li = document.createElement("li");
    li.innerHTML = `<em>User <strong>${user}</strong> ${ joined ? 'joined' : 'left' } the chat!</em>`;
    messages.appendChild(li);
}

function connectedLeftEvent({ username }, conn) { // conn = connected is a boolean
    const localUser = getUser(username);
    localUser.isConnected = conn;// we set isConnected to true/false on the server upon the connection/disconnect event receival
    renderUsers(allUsers);
    userJoinedLeft(username, conn);
}

socket.on("bad connection", () => {
    alert("Bad connection");
    window.location.href = "/";
});

socket.on("user connected", connectedLeftEvent);
socket.on("user left", connectedLeftEvent);
//socket.on("user left", ({ username }, _) => { //user that we chatted with left
    //if(selectedUser && selectedUser.username === username) { 
    //    selectedUser = null; //TODO: bug need fix. user can't go to the Common Room
    //}
//});

//render the list of users
socket.on("all users", users => {
    users.forEach(user => {
        if(user.username === USERNAME) {
            user.me = true;
            ME = user;
        }
    });
    users.sort(meFirst);
    allUsers = users;

    renderUsers(allUsers);
});

function publicMessageCb(msg) {
    appendMessage(msg);
    scrollBottom();
}

//socket.on("public message", publicMessageCb);
//console.log(socket.hasListeners("public message"));
//render public chat history
socket.on("public chat", publicChat => {
    if(!socket.hasListeners("public message"))
        socket.on("public message", publicMessageCb); //activate 'public message' event

    selectedUser = null;
    roomTitle.textContent = "Common Room";
    commonRoomLink.classList.add("hidden"); 
    renderChat(publicChat);
    renderUsers(allUsers);
});

socket.on("private message", (message) => {
    console.log("private message", message);
    const msgFromUsername = message.user.username;
    if(selectedUser && 
        ((msgFromUsername === selectedUser.username) || //chat window with the selected user is opened
            (msgFromUsername === USERNAME))) { //message from myself
        appendMessage(message);
    }
    scrollBottom();
});

//I'm online but chatting to someone else
socket.on("has new message", (toUser, fromUser, chatId) => {
    if(toUser.username === USERNAME) {//I am the receiver
        setHasNewMessageTo(true, fromUser);
        //set hasNewMessage for toUser to true on the server
        //socket.emit("has new message", true, fromUser, toUser, chatId);
        renderUsers(allUsers);
    }
});

socket.on("private chat", ({ chatId, username: toUsername, history }) => {
    //const recepient = allUsers.find(user => user.username === toUsername);
    const me = allUsers.find(user => user.username === USERNAME);

    //recepient.chatIds[username] = { id: chatId, hasNewMessage: false }; //username is clients' username(global)
    me.chatIds[toUsername] = { id: chatId, hasNewMessage: false };
    //recepient.isSelected = true;
    selectedUser = { username: toUsername, chatId };

    socket.off("public message"); //disable public messages

    if(history) {
        renderChat(history);
    } else {
        messages.innerHTML = "";
    }

    roomTitle.textContent = `Chatting privately with ${toUsername}`;
    commonRoomLink.classList.remove("hidden"); //show the link to the Common Room
    renderUsers(allUsers);
});

//socket.on("connect", function() {
//    //socket.emit("public chat");
//});

//TODO: when one user opens two tabs and then closes one of them he is seen as offline to everyone else

