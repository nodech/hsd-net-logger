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
    this.network = node.network;
    this.config = node.config;
    this.logger = node.logger.context('net-logger');

    this.directory = this.config.str('net-logger-dir');
    this.idTime = this.config.bool('net-logger-time-id', false);
    this.console = this.config.bool('net-logger-console', false);
    this.skip = this.config.str('net-logger-skip', '');

    this.map = new Map();

    this._bindPeer = null;

    this.closing = true;
    this.closed = false;

    this.init();
  }

  init() {
    this._bindPeer = this.pool.bindPeer.bind(this.pool);

    this.pool.bindPeer = (peer) => {
      const logger = new PeerLogger(peer, {
        directory: this.directory,
        time: this.idTime,
        console: this.console,
        skip: this.skip,
        network: this.network
      });

      this.logger.debug('Logging packets of peer in %s', logger.filename);
      this.map.set(peer.id, logger);

      logger.open().catch((e) => {
        this.logger.error(e.message);
        this.emit('error', e);
        this.map.delete(peer.id);
      });

      this._bindPeer(peer);
    };

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

    this.pool.bindPeer = this._bindPeer;

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
