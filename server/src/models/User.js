import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    // unique: true creates a database index, so the same email can't register twice
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Stored in one format, e.g. "+919876543210" (see auth.validators.js)
    phone: { type: String, required: true, unique: true, trim: true },
    // The bcrypt hash, never the real password.
    // select: false = left out of query results unless asked for with .select('+password')
    password: { type: String, required: true, select: false },
    // Sample account created by `npm run seed:demo` (it cannot be logged into)
    isDemo: { type: Boolean, default: false },

    // ---- traveller profile (optional; see services/profile.service.js) ----
    // Only the account holder ever sees the date of birth. Other passengers
    // see the AGE worked out from it, and only if profileSharing.shareProfile.
    dateOfBirth: { type: String, default: null }, // "YYYY-MM-DD"
    gender: { type: String, enum: ['female', 'male', 'non_binary', null], default: null },
    // What compatible travellers and ride partners may see. Off until the
    // passenger turns it on (accounts made before profiles existed: off too).
    profileSharing: {
      shareProfile: { type: Boolean, default: false }, // name (first name + initial) and age
      showGender: { type: Boolean, default: false }, // gender too (only with shareProfile)
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
    toJSON: {
      // Controls what is sent to the browser when a user is put in a response
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  },
);

export const User = mongoose.model('User', userSchema);
