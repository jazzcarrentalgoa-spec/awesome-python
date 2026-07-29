/* Zero-dependency WebSocket relay server for Iron Front online multiplayer.
 *
 * Implements just enough of RFC 6455 to accept browser WebSocket clients and
 * relay JSON messages between players in the same room. No npm install required.
 *
 *   node game/server/server.js [port]
 *
 * Message protocol (JSON text frames):
 *   client -> server: {t:"join", room, name}
 *   server -> client: {t:"welcome", id, team}
 *   client -> server: {t:"state"|"shot"|"leave", ...}  (relayed to room peers)
 */
"use strict";

const http = require("http");
const crypto = require("crypto");

const PORT = parseInt(process.argv[2] || process.env.PORT || "8080", 10);
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const rooms = new Map(); // room -> Map(id -> client)
let nextId = 1;

const server = http.createServer((req, res) => {
  // Simple health endpoint so hosting platforms can probe the server.
  if (req.url === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return; }
  res.writeHead(426, { "Content-Type": "text/plain" });
  res.end("Upgrade Required: connect via WebSocket");
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );
  handleClient(socket);
});

function handleClient(socket) {
  const client = { id: nextId++, socket, room: null, team: 0, name: "Soldier", buf: Buffer.alloc(0), closed: false };
  socket.on("data", (chunk) => {
    client.buf = Buffer.concat([client.buf, chunk]);
    parseFrames(client);
  });
  socket.on("close", () => cleanup(client));
  socket.on("error", () => cleanup(client));
}

function parseFrames(client) {
  let buf = client.buf;
  while (buf.length >= 2) {
    const b0 = buf[0], b1 = buf[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); offset = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
    let maskKey;
    if (masked) { if (buf.length < offset + 4) break; maskKey = buf.slice(offset, offset + 4); offset += 4; }
    if (buf.length < offset + len) break; // wait for more data

    let payload = buf.slice(offset, offset + len);
    if (masked) {
      const out = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
      payload = out;
    }
    buf = buf.slice(offset + len);

    if (opcode === 0x8) { cleanup(client); return; }          // close
    else if (opcode === 0x9) { sendFrame(client.socket, payload, 0xA); } // ping -> pong
    else if (opcode === 0x1) { onMessage(client, payload.toString("utf8")); } // text
    // opcode 0x2 (binary) and 0xA (pong) ignored
  }
  client.buf = buf;
}

function sendFrame(socket, data, opcode) {
  if (socket.destroyed) return;
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = 0x80 | (opcode || 0x1);
  try { socket.write(Buffer.concat([header, payload])); } catch (_) {}
}

function sendJson(client, obj) { sendFrame(client.socket, JSON.stringify(obj), 0x1); }

function onMessage(client, text) {
  let msg; try { msg = JSON.parse(text); } catch (_) { return; }
  if (msg.t === "join") {
    const roomName = String(msg.room || "arena-1").slice(0, 40);
    let room = rooms.get(roomName);
    if (!room) { room = new Map(); rooms.set(roomName, room); }
    client.room = roomName;
    client.name = String(msg.name || "Soldier").slice(0, 24);
    client.team = room.size % 2; // alternate teams by join order
    room.set(client.id, client);
    sendJson(client, { t: "welcome", id: client.id, team: client.team });
    log(`join id=${client.id} name=${client.name} room=${roomName} team=${client.team} (room size ${room.size})`);
    return;
  }
  // Relay everything else to peers in the same room.
  if (!client.room) return;
  const room = rooms.get(client.room);
  if (!room) return;
  msg.id = client.id; // stamp authoritative id
  const out = JSON.stringify(msg);
  let relayed = 0;
  for (const peer of room.values()) {
    if (peer.id !== client.id) { sendFrame(peer.socket, out, 0x1); relayed++; }
  }
  if (process.env.IF_DEBUG) log(`relay ${msg.t} from ${client.id} -> ${relayed} peers (room ${client.room} size ${room.size})`);
}

function cleanup(client) {
  if (client.closed) return;
  client.closed = true;
  try { client.socket.destroy(); } catch (_) {}
  if (client.room) {
    const room = rooms.get(client.room);
    if (room) {
      room.delete(client.id);
      for (const peer of room.values()) sendJson(peer, { t: "leave", id: client.id });
      if (room.size === 0) rooms.delete(client.room);
    }
  }
  log(`leave id=${client.id}`);
}

function log(m) { console.log(`[iron-front] ${m}`); }

server.listen(PORT, () => {
  console.log(`[iron-front] WebSocket relay listening on ws://localhost:${PORT}`);
  console.log(`[iron-front] health check: http://localhost:${PORT}/health`);
});
