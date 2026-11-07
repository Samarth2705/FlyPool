// A message in a shared ride's group chat (services/chat.service.js).
// Only passengers with a confirmed booking in that shared ride can read or
// send them - checked on the server for every request.
//
// clientMessageId is a random id the app makes for each message it sends, so
// sending the same message again (double tap, retry after a lost answer)
// returns the message already saved instead of a duplicate.
import mongoose from 'mongoose';

const { Schema } = mongoose;

export const MAX_MESSAGE_LENGTH = 1000;

const chatMessageSchema = new Schema(
  {
    poolId: { type: Schema.Types.ObjectId, ref: 'Pool', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: MAX_MESSAGE_LENGTH },
    clientMessageId: { type: String, required: true },
  },
  { timestamps: true },
);

// A conversation in time order; new messages since a moment (polling)
chatMessageSchema.index({ poolId: 1, createdAt: 1, _id: 1 });
// No duplicate of the same sent message
chatMessageSchema.index({ poolId: 1, senderId: 1, clientMessageId: 1 }, { unique: true });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
