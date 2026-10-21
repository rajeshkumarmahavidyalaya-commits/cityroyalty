import { Schema, model, type InferSchemaType } from 'mongoose';
import { ROLES } from '@cityroyalty/shared';

const addressSchema = new Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pin: { type: String, required: true },
    country: { type: String, default: 'IN' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    phone: String,
    addresses: { type: [addressSchema], default: [] },
    /** bump to invalidate every issued session */
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: Date,
    deletionRequestedAt: Date,
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
