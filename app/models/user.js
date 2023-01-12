import mongoose from 'mongoose';
const { Schema } = mongoose;

const User = new Schema({
    username: String,
    isConnected: Boolean,
    chatIds: {
        type: Map, // chatee_username => {id: String, hasNewMessages: Boolean}
        of: {
            id: String, // PrivateChat._id
            hasNewMessage: Boolean,
            _id: false
        }
    }
});

export default mongoose.model("User", User);