import client_socket from "./username.js";

const form = document.getElementById("sendForm");
const input = document.getElementById("sendInput");
const messages = document.getElementById("messages");
const typing = document.getElementById("typing");
const online = document.getElementById("online");

//const userName = nickInput.value;
//const userId = `${userName}${new Date().getTime()}`;
//const userId = `${userName}-${socket.id}`;

const usersMap = new Map();

socket.onAny((event, ...args) => {
    //console.log(event, args);
});

function appendMessage(msg, appendTo) {
    const item = document.createElement("li");
    item.textContent = msg;
    appendTo.appendChild(item);
}

function scrollBottom() {
    window.scrollTo(0, document.body.scrollHeight);
}

function debouncer(func, t = 500) {
    let timer = null;
    return function (values) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            func(values);
        }, t);
    }
}

const emptyTyping = debouncer(() => socket.emit("typing", ""));

input.addEventListener("input", (e) => {
    socket.emit("typing", `${userName} is typing...`);
    emptyTyping();
});

form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (input.value) {
        const data = { msg: input.value, nick: userName };
        appendMessage(data.msg, messages);
        scrollBottom();

        socket.emit("chat message", data);
        input.value = "";
    }
});

const dOnline = (id) => {
    return debouncer(() => {
        const aElem = document.getElementById(id).parentElement;

        if (aElem) {
            online.removeChild(aElem);
            usersMap.delete(id);
        }
    }, 2000);
}

function createPrivateRoom(e) {
    const to = this.querySelector("li").id;
    const self = userId;
    console.log(userId);

    const privateChat = {to, from: self, room: "room1"};

    e.preventDefault();
}

//notify everyone that you are still online
setInterval(() => {
    console.log(userId, socket.id);
    socket.emit("online", { nick: userName, id: userId });
}, 1000);

//if debounce function if not called for 2 seconds the user gets removes from the list of online users
const isOnline = id => usersMap.get(id).debounce();

socket.on("online", ({ nick, id }) => {
    const mapUser = usersMap.get(id);
    if (!mapUser) {
        console.log("add new user to the list");
        const li = document.createElement("li");
        const a = document.createElement("a");
        li.textContent = nick;
        li.id = id;
        a.href = "#";
        a.appendChild(li);
        a.addEventListener("click", createPrivateRoom);
        online.appendChild(a);

        usersMap.set(id, {debounce: dOnline(id)});//each new user connected gets its own debounce function
        console.log(usersMap);
    }
    isOnline(id);//is user still online? if no confirmation then remove
});

socket.on("typing", msg => {
    typing.textContent = msg;
});

socket.on("conn", msg => {
    appendMessage(msg, messages);
    scrollBottom();
});
//socket.on("connection", () => {
//    appendMessage("new user connected", messages);
//    scrollBottom();
//});

socket.on("disconn", msg => {
    appendMessage(msg, messages);
    scrollBottom();
});

socket.on("chat message", ({ msg, nick }) => {
    appendMessage(`${nick} says: ${msg}`, messages);
    scrollBottom();
});