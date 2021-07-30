/*!
 * logger.js - Network logging
 * Copyright (c) 2021, Nodari Chkuaselidze (MIT License).
 * https://github.com/nodech/hsd-net-logger
 */

'use strict';

const path = require('path');
const fs = require('bfile');
const packets = require('hsd/lib/net/packets');
const ncommon = require('hsd/lib/net/common');
const InvItem = require('hsd/lib/primitives/invitem');

const types = {
  IN: 0,
  OUT: 1,
  DISCONNECT: 2
};

class PeerLogger {
  constructor(peer, options) {
    this.peer = peer;
    this._readPacket = this.peer.readPacket.bind(this.peer);
    this._send = this.peer.send.bind(this.peer);

    this.options = options;

    this.directory = this.options.directory;
    this.stream = null;
    this.closed = false;

    this._id = null;
    this._filename = null;

    this.init();
  }

  init() {
    this.peer.send = (packet) => {
      this.logPacket(packet, types.OUT);
      this._send(packet);
    };

    this.peer.readPacket = (packet) => {
      this.logPacket(packet, types.IN);
      this._readPacket(packet);
    };
  }

  get identifier() {
    if (this._id)
      return this._id;

    const identifier = [
      'peer',
      this.peer.outbound ? 'out' : 'in',
      this.peer.id,
      this.peer.hostname(),
      this.peer.encrypted ? 'brontide' : 'cleartext'
    ];

    if (this.options.time)
      identifier.push(Date.now());

    this._id = identifier.join('-');

    return this._id;
  }

  get filename() {
    if (this._filename)
      return this._filename;

    return path.join(this.directory, this.identifier);
  }

  handleError() {
    try {
      this.stream.close();
    } catch (e) {
      ;
    }

    this.stream = null;
    this.closed = true;
  }

  async open() {
    this.stream = await openStream(this.filename);
    this.stream.once('error', this.handleError.bind(this));
    this.closed = false;
  }

  async close() {
    if (this.closed)
      return;

    await closeStream(this.stream);
    this.peer.send = this._send;
    this.stream = null;
    this.closed = true;
  }

  writeStream(message) {
    if (!this.stream)
      return;

    if (this.closing)
      return;

    this.stream.write(message);
  }

  writeConsole(message) {
    if (!this.options.console)
      return;

    console.log(message);
  }

  logPacket(packet, type) {
    const ptype = packet.type;
    const ptypen = packets.typesByVal[ptype];

    const message = [
      type === types.IN ? '<<== RECV' : '==>> SEND',
      `time: ${Date.now()}`,
      `type: ${ptypen}`
    ];

    switch (ptype) {
      case packets.types.VERSION: {
        const services = [];

        if (packet.services & ncommon.services.NETWORK)
          services.push('NETWORK');

        if (packet.services & ncommon.services.BLOOM)
          services.push('BLOOM');

        const innerMessages = [
          `Protocol Version: ${packet.version}`,
          `Agent: ${packet.agent}`,
          `Services: ${services.join(' | ')}`,
          `Height: ${packet.height}`,
          `Nonce: ${packet.nonce.toString('hex')}`,
          `NoRelay: ${packet.noRelay}`
        ];

        message.push(formatInner(innerMessages));
        break;
      }
      case packets.types.VERACK: {
        break;
      }
      case packets.types.PING:
      case packets.types.PONG: {
        message.push(`Nonce: ${packet.nonce.toString('hex')}`);
        break;
      }
      case packets.types.GETADDR: {
        message.push('Requesting active peers');
        break;
      }
      case packets.types.ADDR: {
        message.push(`Returned: ${packet.items.length} addresses`);
        break;
      }
      case packets.types.INV:
      case packets.types.GETDATA:
      case packets.types.NOTFOUND: {
        message.push(`with ${packet.items.length} inv items`);

        const itemsByType = {
          txs: [],
          blocks: [],
          filteredBlocks: [],
          cmpctBlocks: [],
          claims: [],
          airdrops: [],
          unknown: []
        };

        for (const item of packet.items) {
          switch (item.type) {
            case InvItem.types.TX:
              itemsByType.txs.push(item);
              break;
            case InvItem.types.BLOCK:
              itemsByType.blocks.push(item);
              break;
            case InvItem.types.FILTERED_BLOCK:
              itemsByType.filteredBlocks.push(item);
              break;
            case InvItem.types.CMPCT_BLOCK:
              itemsByType.cmpctBlocks.push(item);
              break;
            case InvItem.types.CLAIM:
              itemsByType.claims.push(item);
              break;
            case InvItem.types.AIRDROP:
              itemsByType.airdrops.push(item);
              break;
            default:
              itemsByType.unknown.push(item);
          }
        }

        const typeNames = {
          txs: 'TXs',
          blocks: 'Blocks',
          filteredBlocks: 'Filtered blocks',
          cmpctBlocks: 'Compact blocks',
          claims: 'Claims',
          airdrops: 'Airdrops',
          unknown: 'Unknown'
        };

        const innerMessages = [];

        for (const [type, items] of Object.entries(itemsByType)) {
          if (items.length === 0)
            continue;

          const name = typeNames[type];
          innerMessages.push(formatInvItems(name, items));
        }

        message.push(formatInner(innerMessages));
        break;
      }
      case packets.types.GETBLOCKS: {
        const locator = [];
        const locatorLen = packet.locator.length;
        const left = locatorLen - 5;

        for (let i = 0; i < Math.min(5, locatorLen); i++)
          locator.push(`${packet.locator[i].toString('hex').slice(0, 10)}...`);

        if (left > 0)
          locator.push(`... ${left} more items`);

        const innerMessages = [
          `Stop: ${packet.stop.toString('hex')}`,
          `Locator: ${locator.join(' ')}`
        ];

        message.push(formatInner(innerMessages));
        break;
      }
      default: {
        message.push('NOT SUPPORTED');
      }
    }

    const formatted = message.join(', ');

    this.writeConsole(formatted);
    this.writeStream(formatted + '\n');
  }
}

function formatInner(messages) {
  messages.unshift(' '.repeat(2));

  return messages.join('\n  ');
}

function formatInvItems(name, items) {
  const messages = [' '.repeat(4)];

  const left = items.length - 5;
  for (let i = 0; i < Math.min(5, items.length); i++)
    messages.push(items[i].hash.toString('hex').slice(0, 10) + '...');

  if (left > 0)
    messages.push(`... ${left} more items`);

  return `${name}: ${items.length}\n` + messages.join(' ');
}

function openStream(filename) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filename, { flags: 'a' });

    const cleanup = () => {
      /* eslint-disable */
      stream.removeListener('error', onError);
      stream.removeListener('open', onOpen);
      /* eslint-enable */
    };

    const onError = (err) => {
      try {
        stream.close();
      } catch (e) {
        ;
      }
      cleanup();
      reject(err);
    };

    const onOpen = () => {
      cleanup();
      resolve(stream);
    };

    stream.once('error', onError);
    stream.once('open', onOpen);
  });
}

function closeStream(stream) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      /* eslint-disable */
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
      /* eslint-enable */
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const onClose = () => {
      cleanup();
      resolve(stream);
    };

    stream.removeAllListeners('error');
    stream.removeAllListeners('close');
    stream.once('error', onError);
    stream.once('close', onClose);

    stream.close();
  });
}

module.exports = PeerLogger;
