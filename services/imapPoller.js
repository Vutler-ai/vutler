/**
 * IMAP Email Poller
 */
class ImapPoller {
  constructor(config) {
    this.config = config;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[IMAP] Poller started');
  }

  stop() {
    this.running = false;
    console.log('[IMAP] Poller stopped');
  }
}

module.exports = ImapPoller;
