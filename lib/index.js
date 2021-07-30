/*!
 * index.js - Network loggin plugin for hsd
 * Copyright (c) 2021, Nodari Chkuaselidze (MIT License).
 * https://github.com/nodech/hsd-net-logger
 */

'use strict';

const EventEmitter = require('events');
const os = require('os');
const path = require('path');
const fs = require('bfile');
const PeerLogger = require('./logger');

class Plugin extends EventEmitter {
  constructor(node) {
    super();

    this.node = node;
    this.pool = node.pool;
    this.config = node.config;

    this.directory = this.config.str('net-logger-dir');
    this.idTime = this.config.bool('net-logger-time-id', false);
    this.console = this.config.bool('net-logger-console', true);

    this.map = new Map();

    this.closing = true;
    this.closed = false;

    this.init();
  }

  init() {
    this.pool.on('peer connect',  async (peer) => {
      const logger = new PeerLogger(peer, {
        directory: this.directory,
        time: this.idTime,
        console: this.console
      });

      this.map.set(peer.id, logger);
      await logger.open();
    });

    this.pool.on('peer close', async (peer) => {
      if (this.closing)
        return;

      const logger = this.map.get(peer.id);
      await logger.close();
      this.map.delete(peer.id);
    });
  }

  async ensure() {
    if (this.directory) {
      await fs.mkdirp(this.directory);
      return;
    }

    this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'net-logger-'));
  }

  async open() {
    await this.ensure();
  }

  async close() {
    this.closing = true;
    for (const [id, logger] of this.map) {
      await logger.close();
      this.map.delete(id);
    }
  }

  static init(node) {
    return new Plugin(node);
  }
}

Plugin.id = 'net-logger';

module.exports = Plugin;
