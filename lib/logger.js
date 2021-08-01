/*!
 * logger.js - Network logging
 * Copyright (c) 2021, Nodari Chkuaselidze (MIT License).
 * https://github.com/nodech/hsd-net-logger
 */

'use strict';

const path = require('path');
const fs = require('bfile');
const assert = require('bsert');
const packets = require('hsd/lib/net/packets');
const ncommon = require('hsd/lib/net/common');
const InvItem = require('hsd/lib/primitives/invitem');
const hsdUtils = require('hsd/lib/utils/util');
const {
  formatSize,
  formatHashes
} = require('./utils');

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
    this.network = options.network;
    this.directory = options.directory;
    this.skip = new Set(parseSkipList(options.skip));

    this.messageBacklog = [];
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
      return this._readPacket(packet);
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
    assert(!this.closed, 'Can not re-open.');
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

  /**
   * @param {String} message
   */

  writeStream(message) {
    if (this.closing || this.closed)
      return;

    if (!this.stream) {
      this.messageBacklog.push(message);
      return;
    }

    this.stream.write(message);
  }

  writeBacklog() {
    assert(this.stream);

    for (const message of this.messageBacklog)
      this.stream.write(message);

    this.messageBacklog = [];
  }

  writeConsole(message) {
    if (!this.options.console)
      return;

    console.log(message);
  }

  logPacket(packet, type) {
    const ptype = packet.type;
    const packetTypeName = packets.typesByVal[ptype];

    const psize = packet.getSize();
    const now = hsdUtils.now();

    if (this.skip.has(packetTypeName.toLowerCase()))
      return;

    const message = [
      type === types.IN ? '<<== RECV' : '==>> SEND',
      `time: ${hsdUtils.date(now)}(${now})`,
      `payload size: ${formatSize(psize > -1 ? psize : 0)}(${psize})`,
      `type: ${packetTypeName}`
    ];

    const addInner = (...messages) => {
      messages.unshift(' '.repeat(2));
      message.push(messages.join('\n  '));
    };

    switch (ptype) {
      case packets.types.VERSION: {
        const services = [];

        if (packet.services & ncommon.services.NETWORK)
          services.push('NETWORK');

        if (packet.services & ncommon.services.BLOOM)
          services.push('BLOOM');

        addInner(
          `Protocol Version: ${packet.version}`,
          `Agent: ${packet.agent}`,
          `Services: ${services.join(' | ')}`,
          `Height: ${packet.height}`,
          `Nonce: ${packet.nonce.toString('hex')}`,
          `NoRelay: ${packet.noRelay}`
        );
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
          innerMessages.push(
            `${name}: ${items.length}\n` +
            `    ${formatHashes(items.map(i => i.hash))}`);
        }

        addInner(...innerMessages);
        break;
      }
      case packets.types.GETHEADERS:
      case packets.types.GETBLOCKS: {
        addInner(
          `Stop: ${packet.stop.toString('hex')}`,
          `Locator: ${formatHashes(packet.locator)}`
        );
        break;
      }
      case packets.types.HEADERS: {
        message.push(`Headers: ${packet.items.length}`);
        message.push('\n  ' + formatHashes(packet.items.map(i => i.hash())));
        break;
      }
      case packets.types.SENDHEADERS: {
        message.push('Allow to send HEADERS instead of INVs');
        break;
      }
      case packets.types.BLOCK: {
        const block = packet.block;

        addInner(
          `Block hash: ${block.hash().toString('hex')}`,
          `Version: ${block.version}`,
          `Date: ${hsdUtils.date(block.time)}(${block.time})`
        );
        break;
      }
      case packets.types.TX: {
        const tx = packet.tx;

        addInner(
          `Hash: ${tx.hash().toString('hex')}`,
          `Version: ${tx.version}, locktime: ${tx.locktime}`,
          `Size: ${tx.getSize()}`,
          `Inputs: ${tx.inputs.length}`,
          `Output: ${tx.outputs.length}`
        );
        break;
      }
      case packets.types.REJECT: {
        message.push('Message were rejected');

        const innerMessages = [
          `Reason: ${packet.reason}`,
          `Message Type: ${packets.typesByVal[packet.message]}`,
          `Code: ${packets.getCode()}`
        ];

        switch (packet.message) {
          case packet.types.BLOCK:
          case packet.types.TX:
          case packet.types.CLAIM:
          case packet.types.AIRDROP:
            innerMessages.push(`Hash: ${packet.hash}`);
            break;
        }

        addInner(...innerMessages);
        break;
      }
      case packets.types.MEMPOOL: {
        message.push('Requesting mempool');
        break;
      }
      case packets.types.FILTERLOAD: {
        message.push('set bloom filter, limit inv packets');
        break;
      }
      case packets.types.FILTERADD: {
        message.push('update bloom filter with new data');
        break;
      }
      case packets.types.FILTERCLEAR: {
        message.push('clear set filters');
        break;
      }
      case packets.types.MERKLEBLOCK: {
        const block = packet.block;

        addInner(
          `Hash: ${block.hash().toString('hex')}`,
          `Version: ${block.version}`,
          `TotalTXs: ${block.totalTX}`,
          `Date: ${hsdUtils.date(block.time)}(${block.time})`,
          `Hashes: ${formatHashes(block.hashes)}`
        );
        break;
      }
      case packets.types.FEEFILTER: {
        message.push(`Filter txs below fee rate: ${packet.rate}`);
        break;
      }
      case packets.types.SENDCMPCT: {
        addInner(
          `Compact mode: ${packet.mode === 1 ? 'on' : 'off'}`,
          `Compact version: ${packet.version}`
        );
        break;
      }
      case packets.types.CMPCTBLOCK: {
        const block = packet.block;

        addInner(
          `Block hash: ${block.hash().toString('hex')}`,
          `Version: ${block.version}`,
          `Total TXs: ${block.totalTX}`,
          `Date: ${hsdUtils.date(block.time)}(${block.time})`,
          `Prefilled TXs: ${block.ptx.length}`
        );
        break;
      }
      case packets.types.GETBLOCKTXN: {
        message.push('Get missing txs');

        const request = packet.request;

        addInner(
          `Block hash: ${request.hash.toString('hex')}`,
          `Requested TXs: ${request.indexes.length}`
        );
        break;
      }
      case packets.types.BLOCKTXN: {
        message.push('returning missing txs.');

        const response = packet.response;

        addInner(
          `Block hash: ${response.hash.toString('hex')}`,
          `TXs: ${response.txs.length}`,
          `  ${formatHashes(response.txs.map(tx => tx.hash()))}`
        );
        break;
      }
      case packets.types.GETPROOF: {
        addInner(
          `Root: ${packet.root.toString('hex')}`,
          `Key: ${packet.key.toString('hex')}`
        );
        break;
      }
      case packets.types.PROOF: {
        addInner(
          `Root: ${packet.root.toString('hex')}`,
          `Key: ${packet.key.toString('hex')}`
        );
        break;
      }
      case packets.types.CLAIM: {
        const claim = packet.claim;
        const data = claim.getData(this.network);

        addInner(
          `Name: ${data.name}`
        );
        break;
      }
      case packets.types.AIRDROP: {
        message.push(`Address: ${packet.proof.address}`);
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

function parseSkipList(skipStr) {
  const types = [];

  for (const type of skipStr.split(','))
    types.push(type.trim().toLowerCase());

  return types;
}

/**
 * From blgr.
 */

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

/**
 * From blgr.
 */

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
