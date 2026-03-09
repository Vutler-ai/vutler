const assert = require('assert');
const {
  buildDedupeKey,
  formatMirrorText,
  mirrorWhatsAppMessage
} = require('../services/whatsappMirror');

class MockCollection {
  constructor(name) {
    this.name = name;
    this.docs = [];
    this.uniqueIndex = null;
  }

  async createIndex(keySpec, options) {
    if (options && options.unique) {
      this.uniqueIndex = Object.keys(keySpec)[0];
    }
    return options?.name || 'idx';
  }

  async findOne(query) {
    if (query.$or) {
      return this.docs.find(doc => query.$or.some(cond =>
        Object.keys(cond).every(k => doc[k] === cond[k])
      ));
    }
    return this.docs.find(doc =>
      Object.keys(query).every(k => doc[k] === query[k])
    );
  }

  async insertOne(doc) {
    if (this.uniqueIndex) {
      const existing = this.docs.find(d => d[this.uniqueIndex] === doc[this.uniqueIndex]);
      if (existing) {
        const err = new Error('duplicate key');
        err.code = 11000;
        throw err;
      }
    }
    this.docs.push(doc);
    return { insertedId: doc._id };
  }

  async updateOne(filter, update) {
    const doc = this.docs.find(d => Object.keys(filter).every(k => d[k] === filter[k]));
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + v;
      }
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

class MockDB {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection(name));
    }
    return this.collections.get(name);
  }
}

(async () => {
  console.log('🧪 Running WhatsApp mirror tests...\n');

  const keyWithMessageId = buildDedupeKey({
    direction: 'inbound',
    conversation_label: 'Alex <-> Jarvis',
    message_id: 'wamid-123'
  });
  assert.strictEqual(keyWithMessageId, 'whatsapp:inbound:Alex <-> Jarvis:wamid-123');

  const keyWithoutMessageId1 = buildDedupeKey({
    direction: 'outbound',
    conversation_label: 'Alex <-> Jarvis',
    text: 'hello',
    timestamp: '2026-03-06T12:00:00.000Z'
  });
  const keyWithoutMessageId2 = buildDedupeKey({
    direction: 'outbound',
    conversation_label: 'Alex <-> Jarvis',
    text: 'hello',
    timestamp: '2026-03-06T12:00:00.000Z'
  });
  assert.strictEqual(keyWithoutMessageId1, keyWithoutMessageId2);

  const formatted = formatMirrorText({
    text: 'Ping',
    direction: 'inbound',
    conversation_label: 'Alex <-> Jarvis',
    timestamp: '2026-03-06T12:00:00.000Z',
    message_id: 'wamid-abc'
  });
  assert.ok(formatted.includes('source=whatsapp'));
  assert.ok(formatted.includes('conversation_label=Alex <-> Jarvis'));
  assert.ok(formatted.includes('message_id=wamid-abc'));

  process.env.VUTLER_WHATSAPP_MIRROR_ENABLED = 'true';
  const db = new MockDB();

  const first = await mirrorWhatsAppMessage(db, {
    direction: 'inbound',
    text: 'Hello Jarvis',
    timestamp: '2026-03-06T12:00:00.000Z',
    conversation_label: 'Alex <-> Jarvis',
    message_id: 'wamid-1'
  });
  assert.strictEqual(first.mirrored, true);

  const second = await mirrorWhatsAppMessage(db, {
    direction: 'inbound',
    text: 'Hello Jarvis',
    timestamp: '2026-03-06T12:00:00.000Z',
    conversation_label: 'Alex <-> Jarvis',
    message_id: 'wamid-1'
  });
  assert.strictEqual(second.duplicate, true);

  const rooms = db.collection('rocketchat_room').docs;
  const messages = db.collection('rocketchat_message').docs;
  assert.strictEqual(rooms.length, 1);
  assert.strictEqual(messages.length, 1);

  console.log('✅ WhatsApp mirror tests passed');
})().catch((error) => {
  console.error('❌ WhatsApp mirror tests failed');
  console.error(error);
  process.exit(1);
});
