import socket from "./sock.js";

//GLOBAL VARIABLES
const USERNAME = getUsernameFromParams("username"); //my username

const ALL_USERS_MAP = new Map(); //all users map

let ALL_USERS = null; //all users
let SELECTED_USER = undefined; // currently selected user(private chat)
let ME = null; //my user object

const friends = document.getElementById("friends");
const sendForm = document.getElementById("sendForm");
const sendInput = document.getElementById("sendInput");
const messages = document.getElementById("messages");
const roomTitle = document.getElementById("room");
const commonRoomLink = document.getElementById("common");
const userTypingSpan = document.getElementById("user-typing");

sendInput.focus();

socket.connect();
//pass in username to the server socket
socket.auth = { username: USERNAME };

//UTILITY FUNCTIONS
function getUsernameFromParams(param) {
    const url = new URL(window.location.href);
    const search = new URLSearchParams(url.search);

    return search.get(param);
}

function meFirst(key, value) {
    return (a, b) => {
        if (a[key] === value)
            return -1;
        else if (b[key] === value)
            return 1;
        else
            return a[key].localeCompare(b[key]);
    }
}

function scrollBottom() {
    window.scrollTo(0, document.body.scrollHeight);
}

function getUser(usernameToFind, allUsers) {
    const user = allUsers.get(usernameToFind);
    //const user = allUsers.find(user => user.username === usernameToFind);
    if(!user) {
        throw new Error(`User ${usernameToFind} not found!`);
    }
    return user;
}

// EVENT LISTENERS
commonRoomLink.addEventListener("click", (e) => {
    e.preventDefault();

    TYPING_STARTED_CONTROL.typingStopped();

    if(SELECTED_USER) {
        socket.emit("leave room", SELECTED_USER || {}); //leave current room
        socket.emit("public chat"); //load public chat
    }
    //TYPING_STARTED_CONTROL.started = false;
    sendInput.focus();
});

sendForm.addEventListener("submit", e => {
    e.preventDefault();

    const input = sendInput.value;
    if(input.trim() === "") return;

    TYPING_STARTED_CONTROL.typingStopped();
    //TODO: determine message type here
    if(SELECTED_USER) {
        socket.emit("private message", input, SELECTED_USER);
    } else {
        socket.emit("public message", input);
    }
    sendInput.value = "";
});

friends.addEventListener("click", e => {
    sendInput.focus();

    const toUser = e.target.id.trim();
    const fromUser = USERNAME;

    if(SELECTED_USER && SELECTED_USER.username === toUser || toUser === USERNAME) return;

    TYPING_STARTED_CONTROL.typingStopped();

    socket.emit("leave room", SELECTED_USER || {});
    socket.emit("private chat", fromUser, toUser);
});

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

//MISCELLANEOUS
//default value for 'id' is null
//function setHasNewMessageTo(bool, { username: chatee, chatIds: { [USERNAME]: { id } = { id: null } } }) {
function setHasNewMessageTo(bool, { username: chatee, chatIds }) {
    //destructuring: computed property name [USERNAME] destructures the object that it contains { id: "chatId", hasNewMessage } to retrieve the 'id'
    const { [USERNAME]: { id } = { id: null } } = chatIds;
    if(id === null) {
        throw new Error(`Chat with the user ${chatee} does not exist!`);
    }

    let chat = ME.chatIds[chatee];
    if(!chat) {
        //save the chat id
        chat = ME.chatIds[chatee] = { id };
    }
    chat.hasNewMessage = bool;
}
//get an array of all users with whom I have unread messages
function getNewMessageUsers(me) {
    const chatsIds = Object.entries(me.chatIds);

    return chatsIds.filter(([_, chatObj]) => chatObj.hasNewMessage)
            .map(([user, _]) => user);
}

//RENDER ON THE SCREEN
function renderUsers(users) {
    const newMessageFromUsers = getNewMessageUsers(ME);

    friends.innerHTML = "";

    users.forEach(({ isConnected, me }, username) => {
        const li = document.createElement("li");
        //const a = document.createElement("a");
        if(me) {
            li.textContent = `${username}(Me)`;
        } else {
            //a.href = "#";
            li.style.cursor = "pointer";
            //any new messages from user?
            if(newMessageFromUsers.includes(username)) {
                li.style.color = "green";
            } else {
                li.style.color = "blue";
            }
            //highlight selected user
            if(SELECTED_USER && (username === SELECTED_USER.username)) {
                li.style.backgroundColor = "lightgrey";
            }

            li.textContent = `${username}(${isConnected ? 'online' : 'offline'})`;
        }
        li.id = username;
        //a.appendChild(li);
        friends.appendChild(li);
    });
}

function appendMessage({ time, user: { username }, text }) {
    const li = document.createElement("li");
    const me = username === USERNAME;

    li.innerHTML = `[ <em>${ time }</em> ] ${ me ? '<strong>Me</strong>' : username } > ${ text }`;
    messages.appendChild(li);
}

function renderChat(chat) {
    messages.innerHTML = "";
    chat.forEach(appendMessage);
}
//TODO: need one protocol for all events e.g. username as a first argument
//then we can make a list of events that require the toUser and find it before any other event is fired
//socket.prependAny((eventName, ...args) => {
//
//});

//GENERIC MESSAGES IN CHAT
function userJoinedLeft(username, joined) {
    if(SELECTED_USER && SELECTED_USER.username !== username) return;//print only if we are in the Common Room or chatting with that person
    const li = document.createElement("li");
    li.innerHTML = `<em>User <strong>${username}</strong> ${ joined ? 'joined' : 'left' } the chat!</em>`;
    messages.appendChild(li);
}

function connectedLeftEvent(conn, { username }) { // conn = connected is a boolean
    const localUser = getUser(username, ALL_USERS_MAP);
    localUser.isConnected = conn;// we set isConnected to true/false on the server upon the connection/disconnect event receival
    renderUsers(ALL_USERS_MAP);
    userJoinedLeft(username, conn);
}

//SOCKET EVENTS
socket.on("user connected", connectedLeftEvent.bind(null, true)); // function currying(first param is 'true', second is the object comming from the server)
socket.on("user left", connectedLeftEvent.bind(null, false));

socket.on("bad connection", () => {
    alert("Bad connection");
    window.location.href = "/";
});

//render the list of all users
socket.on("all users", users => {
    users.sort(meFirst("username", USERNAME));

    users.forEach(({ username, ...rest }) => {
        if(username === USERNAME) {
            rest.me = true;
            ME = rest;
        }
        ALL_USERS_MAP.set(username, rest);
    });
    //renderUsers(ALL_USERS);
    renderUsers(ALL_USERS_MAP);
});

function publicMessageCb(msg) {
    appendMessage(msg);
    scrollBottom();
}
//render public chat history
socket.on("public chat", publicChat => {
    if(!socket.hasListeners("public message"))
        socket.on("public message", publicMessageCb); //activate 'public message' event

    SELECTED_USER = null;
    roomTitle.textContent = "Common Room";
    commonRoomLink.classList.add("hidden"); 

    renderUsers(ALL_USERS_MAP);
    renderChat(publicChat);

    clearTyping();
    //userTypingSpan.innerHTML = "";
});

socket.on("private message", (message) => {
    const msgFromUsername = message.user.username;
    if(SELECTED_USER && 
        ((msgFromUsername === SELECTED_USER.username) || //chat window with the selected user is opened
            (msgFromUsername === USERNAME))) { //message from myself
        appendMessage(message);
    }
    scrollBottom();
});
//I'm online but chatting with someone else
socket.on("has new message", (toUser, fromUser, chatId) => {
    if(toUser.username === USERNAME) {//I am the receiver
        setHasNewMessageTo(true, fromUser);
        renderUsers(ALL_USERS_MAP);
    }
});

socket.on("private chat", ({ chatId, username: toUsername, history }) => {
    ME.chatIds[toUsername] = { id: chatId, hasNewMessage: false };

    SELECTED_USER = { username: toUsername, chatId };

    socket.off("public message"); //disable public messages

    if(history) {
        renderChat(history);
    } else {
        messages.innerHTML = "";
    }
    roomTitle.textContent = `Chatting privately with ${toUsername}`;
    commonRoomLink.classList.remove("hidden"); //show the link to the Common Room
    renderUsers(ALL_USERS_MAP);

    clearTyping();
});

function clearTyping() {
    userTypingSpan.innerHTML = "";
    TYPING_USERS.clear();
}
//'i joined' event lets the current user know that someone joined public/private chat
//so the current user can send the typing event back
socket.on("i joined", username => {
    if(TYPING_STARTED_CONTROL.started) { //current user is typing
        console.log("to specific username", username);
        TYPING_STARTED_CONTROL.userToNotify = username; // send typing notification to the specific user
    }
    TYPING_STARTED_CONTROL.started = false; //on the next text input event sent 'user typing' event
});

socket.on("connect", function() {
    socket.emit("public chat");
});

//USER TYPING
const TYPING_USERS = new Map(); //typing users map
//the purpose of the debouncer function is to run some function(s) no often then once in 'time' milliseconds
function debouncer(time=500) {
    return () => {
        if(!this.started) { //allow to run typingStarted() only once before the timer runs out
            this.typingStarted();
        }
        this.clearTimer();
        this.timer = setTimeout(this.typingStopped.bind(this), time); //when the timer runs out call typingStopped()
    }
}
// on the first run of the function returned by the debouncer, the typingStarted function is called
// it is called only once until the timer runs out
// while the user is typing the timer keeps resetting itself
// if there is no input for 2 seconds the timer runs out and the typingStopped is called
// typingStarted/Stoppeed calls typingEvent which emits the 'user typing' event with the boolean value provided
// that triggers different actions on the client(s)
// we either set who is typing or remove

const TYPING_STARTED_CONTROL = {   
    timer: null,
    started: false, 
    userToNotify: null,
    typingEvent(bool, userToNotify) {
        socket.emit("user typing", bool, USERNAME, SELECTED_USER, userToNotify);
    },
    typingStopped() {
        this.clearTimer();
        this.started = false;
        this.typingEvent(false);
    },
    typingStarted() {
        this.typingEvent(true, this.userToNotify);
        this.started = true;
        this.userToNotify = null;
    },
    clearTimer() {
        if(this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }                                
}; 
// .call sets the first argument provided to it as a 'this' in the function that it is called upon
//second argument is the argument to the function
sendInput.addEventListener("input", debouncer.call(TYPING_STARTED_CONTROL, 10000));

function renderTypingUsers() {
    const t = Array.from(TYPING_USERS.keys(), username => {
        return `<em>${ username }</em>`;
    });
    const len = t.length;
    const noLast = t.slice(0, -1);
    const last = t.slice(-1);

    userTypingSpan.innerHTML = len ? `${ noLast.join(", ") } 
                ${ len > 1 ? `and ${ last } are`: `${ last } is` } typing...` : "";
}

socket.on("user typing", (bool, username) => {
    if(bool) {
        TYPING_USERS.set(username, true);
    } else {
        TYPING_USERS.delete(username);
    }
    renderTypingUsers();
});