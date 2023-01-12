import mongoose from "mongoose";
import User from "../models/user.js";
import PublicMessage from "../models/public_chat.js";
import PrivateChat from "../models/private_chat.js";
import Message from "../models/message.js";

const users = ["alex", "john", "greg", "peter"];

mongoose.set('strictQuery', true);
mongoose.connect('mongodb://databaseserver:27017/mongochat')
.then(async () => {
    await User.deleteMany({});
    await PublicMessage.deleteMany({});
    await PrivateChat.deleteMany({});
    await Message.deleteMany({});
})
.then(() => {
    console.log("Seeding users...");
    const userPromises = [];
    //for(let i = 0; i < users.length; i++) {
    //    const user = new User({username: users[i], isConnected: false, chatIds: {}});
    //    await user.save();
    //}
    //FOREACH DOES NOT WAIT ON 'AWAIT'
    users.forEach(async username => {
        const user = new User({username, isConnected: false, chatIds: {}});
        userPromises.push(user.save());
    });
    return Promise.all(userPromises);
})
.then(() => {
    console.log("Seed complete");
    mongoose.connection.close();
});