import mongoose from 'mongoose';
const { Schema } = mongoose;

const PrivateChatSchema = new Schema({
    chatId: String,
    messages: [
        {
            type: Schema.Types.ObjectId,
            ref: "Message"
        }
    ],
    //chatId: String,
    //_keys: {
    //    type: Map, // chatId => []
    //    of:
    //        {
    //            type: Schema.Types.ObjectId,
    //            ref: "Message"
    //        }
    //}
});

export default mongoose.model('privateChat', PrivateChatSchema);