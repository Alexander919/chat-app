import socket from "./sock.js";

//GLOBAL VARIABLES
const USERNAME = getUsernameFromParams("username"); //my username

let ALL_USERS = null; //all users
let SELECTED_USER = null; // currently selected user(private chat)
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
            return a - b;
    }
}

function scrollBottom() {
    window.scrollTo(0, document.body.scrollHeight);
}

function getUser(usernameToFind, allUsers) {
    const user = allUsers.find(user => user.username === usernameToFind);
    if(!user) {
        throw new Error(`User ${usernameToFind} not found!`);
    }
    return user;
}

// EVENT LISTENERS
commonRoomLink.addEventListener("click", (e) => {
    e.preventDefault();
    if(SELECTED_USER) {
        //userTypingSpan.innerHTML = "";
        socket.emit("leave room", SELECTED_USER); //leave current room
        socket.emit("public chat"); //load public chat
    }
    sendInput.focus();
});

sendForm.addEventListener("submit", e => {
    e.preventDefault();

    const input = sendInput.value;
    if(input.trim() === "") return;

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

    const li = e.target;
    const toUser = li.id;
    const fromUser = USERNAME;

    if(SELECTED_USER) { //jumping between private chats
        if(SELECTED_USER.username === toUser) //same user that is already selected
            return;
        socket.emit("leave room", SELECTED_USER);
    }
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
            if(SELECTED_USER && (user.username === SELECTED_USER.username)) {
                li.style.backgroundColor = "lightgrey";
            }

            li.id = user.username;
            li.textContent = `${user.username}(${user.isConnected ? 'online' : 'offline'})`;
        }
        a.appendChild(li);
        friends.appendChild(a);
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
    const localUser = getUser(username, ALL_USERS);
    localUser.isConnected = conn;// we set isConnected to true/false on the server upon the connection/disconnect event receival
    renderUsers(ALL_USERS);
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
    users.forEach(user => {
        if(user.username === USERNAME) {
            user.me = true;
            ME = user;
        }
    });
    users.sort(meFirst("username", USERNAME));
    ALL_USERS = users;

    renderUsers(ALL_USERS);
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
    renderChat(publicChat);
    renderUsers(ALL_USERS);
    userTypingSpan.innerHTML = "";
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
        renderUsers(ALL_USERS);
    }
});

socket.on("private chat", ({ chatId, username: toUsername, history }) => {
    ME.chatIds[toUsername] = { id: chatId, hasNewMessage: false };
    console.log("ME is", ME);

    SELECTED_USER = { username: toUsername, chatId };

    socket.off("public message"); //disable public messages

    if(history) {
        renderChat(history);
    } else {
        messages.innerHTML = "";
    }
    userTypingSpan.innerHTML = "";

    roomTitle.textContent = `Chatting privately with ${toUsername}`;
    commonRoomLink.classList.remove("hidden"); //show the link to the Common Room
    renderUsers(ALL_USERS);
});

socket.on("connect", function() {
    socket.emit("public chat");
});


//USER TYPING

//debouncer runs the function provided no often then once in 'time' milliseconds
function debouncer(userTyping, time=500) {
    let timer = null;
    let started = false; // user started typing
    return () => {
        console.log(timer, started);
        if(!started) { //allow to run userTyping(true) only once before the timer runs out
            console.log("sendStarted is called");
            started = true;
            userTyping(true);
        }
        clearTimeout(timer);
        timer = setTimeout(() => { //if timer runs out call userTyping(false) and reset the 'started'
            console.log("sendStopped is called");
            started = false;
            userTyping(false);
        }, time);
    }
}
// on the first run of the function returned by the debouncer, the userTyping(true) function is called
// it is called only once until the timer runs out
// while the user is typing the timer keeps resetting itself
// if there is no input for 2 seconds the timer runs out and the userTyping(false) function is called
// userTyping function emits the 'user typing' event with the boolean value provided
// that triggers different action on the client(s)
// we either set who is typing or remove
const typingEvent = (bool) => socket.emit("user typing", bool, USERNAME, SELECTED_USER);
sendInput.addEventListener("input", debouncer(typingEvent, 2000));
//TODO: check that when the user-typing-false is received it's from the user that is currently 'typing' on the screen
socket.on("user typing", (bool, username) => {
    if(bool) { //we can overwrite who is typing
        userTypingSpan.id = username;
        userTypingSpan.innerHTML = `<em>${username} is typing...</em>`;
    } else { // we can only empty our own typing banner(the last person who started typing is actually shown typing)
        if(userTypingSpan.id === username)
            userTypingSpan.innerHTML = "";
    }
});

//TODO: multiuser typing. Hard code the <ul></ul>. On 'started typing' event create a <li></li> string with id of user
// and contents of username. Push to array, join on 'and' and finally add 'is/are typing'.
// Keep adding users if there are more 'started typing' events.
// When the 'stopped typing' event is received remove from array and do the above.

//TODO: when one user opens two tabs and then closes one of them he is seen as offline to everyone else