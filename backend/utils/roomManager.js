'use strict';

/**
 * roomManager.js
 * In-memory store for active rooms and their participants.
 */

const rooms = new Map();

/**
 * Return a copy of the room map for inspection (e.g. REST API).
 */
function getAllRooms() {
  const result = {};
  for (const [roomId, room] of rooms) {
    result[roomId] = {
      id: roomId,
      participants: Array.from(room.participants.values()),
      createdAt: room.createdAt,
    };
  }
  return result;
}

/**
 * Check whether a room exists.
 * @param {string} roomId
 * @returns {boolean}
 */
function roomExists(roomId) {
  return rooms.has(roomId);
}

/**
 * Create a room if it does not yet exist.
 * @param {string} roomId
 */
function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      participants: new Map(),
      createdAt: Date.now(),
    });
  }
}

/**
 * Add a participant to a room.
 * @param {string} roomId
 * @param {string} socketId
 * @param {string} nickname
 */
function addParticipant(roomId, socketId, nickname) {
  ensureRoom(roomId);
  const room = rooms.get(roomId);
  room.participants.set(socketId, { socketId, nickname, joinedAt: Date.now() });
}

/**
 * Remove a participant from every room they joined.
 * @param {string} socketId
 * @returns {string[]} list of roomIds the socket was removed from
 */
function removeParticipant(socketId) {
  const affectedRooms = [];
  for (const [roomId, room] of rooms) {
    if (room.participants.has(socketId)) {
      room.participants.delete(socketId);
      affectedRooms.push(roomId);
      // Clean up empty rooms
      if (room.participants.size === 0) {
        rooms.delete(roomId);
      }
    }
  }
  return affectedRooms;
}

/**
 * Get all socket IDs in a room.
 * @param {string} roomId
 * @returns {string[]}
 */
function getParticipantIds(roomId) {
  if (!rooms.has(roomId)) return [];
  return Array.from(rooms.get(roomId).participants.keys());
}

/**
 * Get all participant objects in a room.
 * @param {string} roomId
 * @returns {Array<{socketId: string, nickname: string, joinedAt: number}>}
 */
function getParticipants(roomId) {
  if (!rooms.has(roomId)) return [];
  return Array.from(rooms.get(roomId).participants.values());
}

/**
 * Number of participants in a room.
 * @param {string} roomId
 * @returns {number}
 */
function roomSize(roomId) {
  if (!rooms.has(roomId)) return 0;
  return rooms.get(roomId).participants.size;
}

module.exports = {
  getAllRooms,
  roomExists,
  ensureRoom,
  addParticipant,
  removeParticipant,
  getParticipantIds,
  getParticipants,
  roomSize,
};
