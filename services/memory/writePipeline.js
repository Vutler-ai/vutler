'use strict';

const {
  extractConversationMemories,
  extractTaskMemories,
  recordToolObservation,
} = require('../memoryExtractionService');

class MemoryWritePipeline {
  async recordConversation(input = {}) {
    return extractConversationMemories(input);
  }

  async recordTaskEpisode(input = {}) {
    return extractTaskMemories(input);
  }

  async recordToolObservation(input = {}) {
    return recordToolObservation(input);
  }
}

function createMemoryWritePipeline() {
  return new MemoryWritePipeline();
}

module.exports = {
  MemoryWritePipeline,
  createMemoryWritePipeline,
};
