import mongoose from 'mongoose';
const { Schema } = mongoose;

const messageSchema = new Schema({
    text: String, // String is shorthand for {type: String}
    username: String,
    time: {
        type: String,
        default: () => new Date().toLocaleTimeString()
    },
    date: {
        type: String,
        default: Date.now
    }
});

export default mongoose.model('Message', messageSchema);