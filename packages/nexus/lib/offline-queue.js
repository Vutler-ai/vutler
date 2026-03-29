'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');

/**
 * OfflineQueue — SQLite-backed queue for task results that could not be sent
 * while the WebSocket connection was down.
 *
 * DB location: ~/.vutler/queue.db
 *
 * Schema:
 *   id          INTEGER PK AUTOINCREMENT
 *   task_id     TEXT
 *   type        TEXT NOT NULL
 *   payload     TEXT NOT NULL   (JSON string)
 *   created_at  INTEGER NOT NULL (Unix ms)
 *   drained     INTEGER NOT NULL DEFAULT 0
 */
class OfflineQueue {
  constructor() {
    const dbDir = path.join(os.homedir(), '.vutler');
    fs.mkdirSync(dbDir, { recursive: true });

    const dbPath = path.join(dbDir, 'queue.db');

    // Lazy-require so the package only needs better-sqlite3 at runtime
    const Database = require('better-sqlite3');
    this._db = new Database(dbPath);

    // WAL mode for safe concurrent reads
    this._db.pragma('journal_mode = WAL');

    this._db.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id    TEXT,
        type       TEXT    NOT NULL,
        payload    TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        drained    INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Prepared statements
    this._stmtInsert = this._db.prepare(
      'INSERT INTO queue (task_id, type, payload, created_at, drained) VALUES (?, ?, ?, ?, 0)'
    );
    this._stmtDrainSelect = this._db.prepare(
      'SELECT * FROM queue WHERE drained = 0 AND created_at >= ?'
    );
    this._stmtMarkDrained = this._db.prepare(
      'UPDATE queue SET drained = 1 WHERE id = ?'
    );
    this._stmtPurge = this._db.prepare(
      'DELETE FROM queue WHERE created_at < ?'
    );
    this._stmtCount = this._db.prepare(
      'SELECT COUNT(*) AS cnt FROM queue WHERE drained = 0'
    );
  }

  /**
   * Add a task result to the queue.
   * @param {string} taskId
   * @param {string} type     — e.g. 'task.result'
   * @param {object} payload  — will be JSON-serialised
   */
  enqueue(taskId, type, payload) {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this._stmtInsert.run(taskId || null, type, payloadStr, Date.now());
  }

  /**
   * Return all undrained items younger than 24 h, marking them as drained.
   * @returns {Array<{id, task_id, type, payload, created_at, drained}>}
   */
  drain() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const rows   = this._stmtDrainSelect.all(cutoff);

    const markAll = this._db.transaction((items) => {
      for (const item of items) {
        this._stmtMarkDrained.run(item.id);
      }
    });
    markAll(rows);

    return rows;
  }

  /**
   * Delete all items older than 24 h (drained or not).
   */
  purge() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this._stmtPurge.run(cutoff);
  }

  /**
   * Return the number of undrained items in the queue.
   * @returns {number}
   */
  count() {
    return this._stmtCount.get().cnt;
  }

  /** Close the database connection. */
  close() {
    if (this._db && this._db.open) {
      this._db.close();
    }
  }
}

module.exports = { OfflineQueue };
