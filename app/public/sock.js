import "./socket.io.min.js";

const URL = "http://localhost:3000"
const socket = io(URL, { autoConnect: false });

export default socket;