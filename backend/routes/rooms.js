'use strict';

/**
 * rooms.js – REST routes for room management.
 */

const express = require('express');
const router = express.Router();
const { roomExists, getAllRooms } = require('../utils/roomManager');

/**
 * POST /api/rooms/create
 * Generate and return a new room ID. The room is not actually persisted
 * until the first participant joins via Socket.io.
 */
router.post('/create', (req, res) => {
  const roomId = generateRoomId();
  res.json({ success: true, roomId });
});

/**
 * GET /api/rooms/:roomId/validate
 * Check whether a room ID has the correct format.
 * (A room may not have any participants yet and still be valid to join.)
 */
router.get('/:roomId/validate', (req, res) => {
  const { roomId } = req.params;
  const valid = isValidRoomId(roomId);
  res.json({ success: true, valid, exists: roomExists(roomId) });
});

/**
 * GET /api/rooms
 * Return basic stats about all active rooms (no private data).
 */
router.get('/', (req, res) => {
  const all = getAllRooms();
  // Strip per-participant data before sending
  const summary = Object.values(all).map((room) => ({
    id: room.id,
    participantCount: room.participants.length,
    createdAt: room.createdAt,
  }));
  res.json({ success: true, rooms: summary });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a random alphanumeric room ID (8 characters).
 * @returns {string}
 */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Validate that a room ID consists of 4–16 alphanumeric characters/hyphens.
 * @param {string} id
 * @returns {boolean}
 */
function isValidRoomId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{4,16}$/.test(id);
}

module.exports = router;
