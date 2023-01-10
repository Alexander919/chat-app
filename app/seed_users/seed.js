import mongoose from "mongoose";
import User from "../models/user.js";

const users = ["alex", "john", "greg", "peter"];

mongoose.set('strictQuery', true);
mongoose.connect('mongodb://databaseserver:27017/mongochat')
.then(() => User.deleteMany({}))
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