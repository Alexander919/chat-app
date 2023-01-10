import mongoose from 'mongoose';
const { Schema } = mongoose;

const User = new Schema({
    username: String,
    isConnected: Boolean,
    chatIds: {
        type: Map, // chatee_username => {id: String, hasNewMessages: Boolean}
        of: {
            id: String,
            hasNewMessages: Boolean
        }
    }
});

export default mongoose.model("User", User);