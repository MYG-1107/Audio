'use strict';

/**
 * roomSocket.js
 * Handles all Socket.io events for real-time room communication and WebRTC signaling.
 *
 * Event flow:
 *   Client → Server  : join-room, leave-room, signal, raise-hand, set-nickname
 *   Server → Client  : room-joined, user-connected, user-disconnected,
 *                       signal, participants-update, hand-raised, error
 */

const {
  addParticipant,
  removeParticipant,
  getParticipantIds,
  getParticipants,
  roomSize,
} = require('../utils/roomManager');

const MAX_ROOM_SIZE = 20;
// Simple per-socket join rate limiting (max 10 join attempts per minute)
const joinAttempts = new Map();

module.exports = function registerRoomSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ── join-room ─────────────────────────────────────────────────────────────
    socket.on('join-room', ({ roomId, nickname }) => {
      // Sanitize inputs
      const sanitizedRoomId = sanitizeRoomId(roomId);
      const sanitizedNickname = sanitizeNickname(nickname);

      if (!sanitizedRoomId) {
        socket.emit('error', { message: 'Invalid room ID.' });
        return;
      }

      // Rate limiting
      if (!checkJoinRate(socket.id)) {
        socket.emit('error', { message: 'Too many join attempts. Please wait.' });
        return;
      }

      // Room size cap
      if (roomSize(sanitizedRoomId) >= MAX_ROOM_SIZE) {
        socket.emit('error', { message: 'Room is full (max 20 participants).' });
        return;
      }

      // Register participant
      addParticipant(sanitizedRoomId, socket.id, sanitizedNickname);
      socket.join(sanitizedRoomId);

      // Tell the joining user about everyone already in the room
      const existingPeers = getParticipantIds(sanitizedRoomId).filter(
        (id) => id !== socket.id
      );

      socket.emit('room-joined', {
        roomId: sanitizedRoomId,
        socketId: socket.id,
        nickname: sanitizedNickname,
        peers: existingPeers,
        participants: getParticipants(sanitizedRoomId),
      });

      // Notify existing peers that a new user connected
      socket.to(sanitizedRoomId).emit('user-connected', {
        socketId: socket.id,
        nickname: sanitizedNickname,
        participants: getParticipants(sanitizedRoomId),
      });

      console.log(
        `[room] ${sanitizedNickname} (${socket.id}) joined ${sanitizedRoomId} ` +
          `(${roomSize(sanitizedRoomId)} participants)`
      );
    });

    // ── leave-room ────────────────────────────────────────────────────────────
    socket.on('leave-room', ({ roomId }) => {
      const sanitizedRoomId = sanitizeRoomId(roomId);
      if (!sanitizedRoomId) return;
      handleDisconnect(socket, sanitizedRoomId, io);
    });

    // ── WebRTC signaling (offer / answer / ICE candidates) ───────────────────
    socket.on('signal', ({ targetId, signal }) => {
      if (!targetId || !signal) return;
      // Forward the signal only to the intended peer
      io.to(targetId).emit('signal', {
        fromId: socket.id,
        signal,
      });
    });

    // ── raise-hand ────────────────────────────────────────────────────────────
    socket.on('raise-hand', ({ roomId, raised }) => {
      const sanitizedRoomId = sanitizeRoomId(roomId);
      if (!sanitizedRoomId) return;
      socket.to(sanitizedRoomId).emit('hand-raised', {
        socketId: socket.id,
        raised: Boolean(raised),
      });
    });

    // ── set-nickname ──────────────────────────────────────────────────────────
    socket.on('set-nickname', ({ roomId, nickname }) => {
      const sanitizedRoomId = sanitizeRoomId(roomId);
      const sanitizedNickname = sanitizeNickname(nickname);
      if (!sanitizedRoomId) return;
      socket.to(sanitizedRoomId).emit('nickname-changed', {
        socketId: socket.id,
        nickname: sanitizedNickname,
      });
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
      const affectedRooms = removeParticipant(socket.id);
      for (const roomId of affectedRooms) {
        io.to(roomId).emit('user-disconnected', {
          socketId: socket.id,
          participants: getParticipants(roomId),
        });
      }
      joinAttempts.delete(socket.id);
    });
  });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function handleDisconnect(socket, roomId, io) {
  socket.leave(roomId);
  removeParticipant(socket.id);
  io.to(roomId).emit('user-disconnected', {
    socketId: socket.id,
    participants: getParticipants(roomId),
  });
}

/**
 * Allow a socket to join at most 10 rooms per minute.
 * @param {string} socketId
 * @returns {boolean} true if allowed
 */
function checkJoinRate(socketId) {
  const now = Date.now();
  const entry = joinAttempts.get(socketId) || { count: 0, windowStart: now };

  if (now - entry.windowStart > 60_000) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  joinAttempts.set(socketId, entry);
  return entry.count <= 10;
}

/**
 * Sanitize a room ID: keep only alphanumeric chars and hyphens, max 16 chars.
 * @param {unknown} id
 * @returns {string|null}
 */
function sanitizeRoomId(id) {
  if (typeof id !== 'string') return null;
  const clean = id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 16);
  return clean.length >= 4 ? clean : null;
}

/**
 * Sanitize a nickname: strip HTML, trim, max 30 chars.
 * @param {unknown} name
 * @returns {string}
 */
function sanitizeNickname(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'Guest';
  return name
    .replace(/[<>&"'/]/g, '')
    .trim()
    .slice(0, 30) || 'Guest';
}
