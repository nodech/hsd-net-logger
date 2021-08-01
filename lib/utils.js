/*!
 * utils.js - Network logging utilities.
 * Copyright (c) 2021, Nodari Chkuaselidze (MIT License).
 * https://github.com/nodech/hsd-net-logger
 */

'use strict';

/**
 * Format hashes array, truncate if necessary
 * @property {Buffer[]} hashes
 * @property {Number} [sliceFrom=22]
 * @property {Number} [truncateAt=4] - and last one
 * @returns {String}
 */

function formatHashes(hashes, sliceFrom = 22, truncateAt = 4) {
  const message = [];
  const left = hashes.length - truncateAt;

  for (let i = 0; i < Math.min(hashes.length, truncateAt); i++)
    message.push('...' + hashes[i].toString('hex').slice(sliceFrom * 2));

  if (left > 0) {
    const last = hashes.length - 1;
    message.push(`... ${left - 1} more items ...`);
    message.push('...' + hashes[last].toString('hex').slice(sliceFrom * 2));
  }

  return message.join(' ');
};

exports.formatHashes = formatHashes;

/**
 * Format size (decimal)
 * @param {Number} size
 * @returns {String}
 */

exports.formatSize = function formatSize(size) {
  const KB = 1 << 10;
  const MB = 1 << 20;
  const GB = 1 << 30;

  if (size > GB)
    return (size / GB).toFixed(2) + ' GiB';

  if (size > MB)
    return (size / MB).toFixed(2) + ' MiB';

  if (size > KB)
    return (size / KB).toFixed(2) + ' KiB';

  if (size > 0)
    return size + ' Bytes';

  return '0 Byte';
};
