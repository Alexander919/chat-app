import mongoose from 'mongoose';
const { Schema } = mongoose;

const PublicMessageSchema = new Schema({
    sender: String,
    message: {
        type: Schema.Types.ObjectId,
        ref: "Message"
    }
});

export default mongoose.model('publicMessage', PublicMessageSchema);