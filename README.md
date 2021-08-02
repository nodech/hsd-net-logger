HSD Network Logger
==================

Log network communication in "human readable" way.

This is intended for debug and education purposes only.  
**This is not meant for production use.**

## Options
  Logger allows several options that can be passed from: args, env variables or
  hsd config files (same functionality as any other hsd config):
  
  - `net-logger-dir` - Where to store connection logs, it will create separate
    log file for each connection. default: `/tmp/net-logger-XXXXXX`
  - `net-logger-time-id` - Whether to include timestamp of the connection in
    the filename, default: `false`
  - `net-logger-console` - whether to output in console as well (can be
    spammy), default: `false`
  - `net-logger-skip` - which packet types to skip, default: `empty`

## Running
### Using NPM

  - install: `npm i -g hsd-net-logger`
  - Make sure global node_modules resolves hsd-net-logger
    - e.g. You could use `export NODE_PATH=/usr/lib/node_modules` (arch)
    - asdf example: ``export NODE_PATH="$NODE_PATH:`asdf
      where nodejs`/.npm/lib/node_modules"``
    - Basically, make sure `node -e 'require("hsd-net-logger")'` does not
      throw an error.
  - run: `hsd --plugins hsd-net-logger`

### Using git or path
  - Clone: `git clone https://github.com/nodech/hsd-net-logger`
  - `cd hsd-net-logger`
  - ``hsd --plugins `pwd` ``

### Example
  Lets run the hsd in memory and ignore ping and pong packets:  
 `$ hsd --memory --plugins hsd-net-logger --net-logger-dir=/tmp/hsd-packet-logs --net-logger-skip=ping,pong`  
  After we stop you should see that `/tmp/hsd-packet-logs` folder has been
  created and may look like this:
```
.rw-r--r-- user group     0 B  Mon Aug  2 21:31:11 2021 peer-out--1-HOSTNAME1:12038-cleartext
.rw-r--r-- user group   217 B  Mon Aug  2 21:31:11 2021 peer-out--1-HOSTNAME2:12038-cleartext
.rw-r--r-- user group     0 B  Mon Aug  2 21:31:10 2021 peer-out--1-HOSTNAME3:12038-cleartext
.rw-r--r-- user group 240.7 KB Mon Aug  2 21:31:14 2021 peer-out--1-HOSTNAME4:12038-cleartext
...
```
And we can have a look at file that exchanged the data:
```
File: peer-out--1-HOSTNAME4-cleartext
==>> SEND, time: 2021-08-02T17:31:10Z(1627925470), payload size: 133 Bytes(133), type: VERSION,
  Protocol Version: 3
  Agent: /hsd:2.4.0/
  Services: NETWORK
  Height: 0
  Nonce: decba417013fafc2
  NoRelay: false
<<== RECV, time: 2021-08-02T17:31:10Z(1627925470), payload size: 0 Byte(-1), type: VERACK
<<== RECV, time: 2021-08-02T17:31:10Z(1627925470), payload size: 133 Bytes(133), type: VERSION,
  Protocol Version: 1
  Agent: /hsd:2.0.2/
  Services: NETWORK
  Height: 79089
  Nonce: 88bb42d022211766
  NoRelay: false
<<== RECV, time: 2021-08-02T17:31:10Z(1627925470), payload size: 89 Bytes(89), type: ADDR, Returned: 1 addresses
==>> SEND, time: 2021-08-02T17:31:10Z(1627925470), payload size: 0 Byte(-1), type: VERACK
==>> SEND, time: 2021-08-02T17:31:10Z(1627925470), payload size: 9 Bytes(9), type: SENDCMPCT,
  Compact mode: off
  Compact version: 1
==>> SEND, time: 2021-08-02T17:31:10Z(1627925470), payload size: 65 Bytes(65), type: GETHEADERS,
  Stop: 0000000000001013c28fa079b545fb805f04c496687799b98e35e83cbbb8953e
  Locator: ...66489760741d075992e0
<<== RECV, time: 2021-08-02T17:31:10Z(1627925470), payload size: 9 Bytes(9), type: SENDCMPCT,
  Compact mode: off
  Compact version: 1
<<== RECV, time: 2021-08-02T17:31:11Z(1627925471), payload size: 232.32 KiB(237891), type: HEADERS, Headers: 1008,
  ...9f5bacdb7433cd2f5971 ...6dda2217676f042ad0f2 ...83f385e9e359941ec704 ...73c265bd054e845e126e ... 1003 more items ... ...99b98e35e83cbbb8953e
==>> SEND, time: 2021-08-02T17:31:11Z(1627925471), payload size: 35.44 KiB(36291), type: GETDATA, with 1008 inv items,
  Compact blocks: 1008
    ...9f5bacdb7433cd2f5971 ...6dda2217676f042ad0f2 ...83f385e9e359941ec704 ...73c265bd054e845e126e ... 1003 more items ... ...99b98e35e83cbbb8953e
<<== RECV, time: 2021-08-02T17:31:12Z(1627925472), payload size: 351 Bytes(351), type: BLOCK,
  Block hash: 0000000000a5e40e8ba291bd7e8649747fa7fb8a7af39f5bacdb7433cd2f5971
  Version: 0
  Date: 2020-02-03T15:52:05Z(1580745125)
  ...

```
