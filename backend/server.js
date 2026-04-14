'use strict';

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const roomRoutes = require('./routes/rooms');
const registerRoomSocket = require('./sockets/roomSocket');

const app = express();
const server = http.createServer(app);

// ── Environment ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: FRONTEND_URL,
  methods: ['GET', 'POST'],
};
app.use(cors(corsOptions));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());

// ── HTTP Rate limiting ────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please slow down.' },
});
app.use('/api', apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/rooms', roomRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
});

registerRoomSocket(io);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[server] VoxRoom backend running on port ${PORT}`);
  console.log(`[server] Accepting connections from ${FRONTEND_URL}`);
});

module.exports = { app, server };
