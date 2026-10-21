import { Schema, model } from 'mongoose';

const seo = { title: String, description: String };

export const Article = model(
  'Article',
  new Schema(
    {
      title: { type: String, required: true },
      slug: { type: String, required: true, unique: true },
      excerpt: { type: String, default: '' },
      body: { type: String, default: '' },
      coverImage: { type: String, default: null },
      tags: { type: [String], default: [] },
      status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
      publishedAt: Date,
      seo,
      wooId: Number,
    },
    { timestamps: true },
  ),
);

/** Policy / information pages (About, FAQs, Refund & Returns, Privacy). */
export const Page = model(
  'Page',
  new Schema(
    {
      slug: { type: String, required: true, unique: true },
      title: { type: String, required: true },
      body: { type: String, default: '' },
      status: { type: String, enum: ['draft', 'published'], default: 'published' },
      seo,
      wooId: Number,
    },
    { timestamps: true },
  ),
);

export const Campaign = model(
  'Campaign',
  new Schema(
    {
      key: { type: String, required: true, unique: true },
      headline: { type: String, default: '' },
      subline: { type: String, default: '' },
      ctaLabel: { type: String, default: '' },
      ctaHref: { type: String, default: '' },
      image: { type: String, default: null },
      imageAlt: { type: String, default: '' },
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);

export const Subscriber = model(
  'Subscriber',
  new Schema(
    {
      email: { type: String, required: true, unique: true, lowercase: true },
      source: String,
      unsubscribedAt: Date,
    },
    { timestamps: true },
  ),
);

export const Setting = model(
  'Setting',
  new Schema({ key: { type: String, required: true, unique: true }, value: Schema.Types.Mixed }, { timestamps: true }),
);

export const AuditLog = model(
  'AuditLog',
  new Schema(
    {
      actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
      actorEmail: String,
      action: { type: String, required: true, index: true },
      entity: String,
      entityId: String,
      summary: String,
      meta: Schema.Types.Mixed,
      ip: String,
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  ),
);
