/**
 * app.js – VoxRoom homepage logic
 * Handles: create room, join room, theme toggle, nickname persistence
 */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  // Replace with your deployed backend URL in production
  const BACKEND_URL = 'https://audio-8grl.onrender.com';

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn   = document.getElementById('joinRoomBtn');
  const roomIdInput   = document.getElementById('roomIdInput');
  const nicknameInput = document.getElementById('nicknameInput');
  const roomIdError   = document.getElementById('roomIdError');
  const themeToggle   = document.getElementById('themeToggle');

  // ── Theme ───────────────────────────────────────────────────────────────────
  initTheme();

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });

  function initTheme() {
    const stored = localStorage.getItem('voxroom-theme');
    const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    setTheme(stored || preferred);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('voxroom-theme', theme);
  }

  // ── Nickname persistence ─────────────────────────────────────────────────────
  const savedNickname = localStorage.getItem('voxroom-nickname');
  if (savedNickname) nicknameInput.value = savedNickname;

  nicknameInput.addEventListener('input', () => {
    localStorage.setItem('voxroom-nickname', nicknameInput.value.trim());
  });

  // ── Create Room ──────────────────────────────────────────────────────────────
  createRoomBtn.addEventListener('click', async () => {
    createRoomBtn.disabled = true;
    createRoomBtn.innerHTML = '<span class="spinner"></span> Creating…';

    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/create`, { method: 'POST' });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      if (data.success && data.roomId) {
        navigateToRoom(data.roomId);
      } else {
        throw new Error('Unexpected server response');
      }
    } catch (err) {
      console.error('[create-room]', err);
      // Fallback: generate room ID client-side
      const fallbackId = generateRoomId();
      navigateToRoom(fallbackId);
    } finally {
      createRoomBtn.disabled = false;
      createRoomBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        Create a Room`;
    }
  });

  // ── Join Room ────────────────────────────────────────────────────────────────
  joinRoomBtn.addEventListener('click', () => handleJoin());
  roomIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleJoin();
  });

  // Auto-format input to uppercase
  roomIdInput.addEventListener('input', () => {
    const pos = roomIdInput.selectionStart;
    roomIdInput.value = roomIdInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    roomIdInput.setSelectionRange(pos, pos);
    clearError();
  });

  function handleJoin() {
    const roomId = roomIdInput.value.trim();
    if (!isValidRoomId(roomId)) {
      showError('Please enter a valid Room ID (4–16 letters, numbers, or hyphens).');
      roomIdInput.focus();
      return;
    }
    navigateToRoom(roomId);
  }

  function navigateToRoom(roomId) {
    const nickname = nicknameInput.value.trim();
    if (nickname) localStorage.setItem('voxroom-nickname', nickname);
    const params = new URLSearchParams({ room: roomId });
    if (nickname) params.set('name', nickname);
    window.location.href = `room.html?${params.toString()}`;
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  function isValidRoomId(id) {
    return typeof id === 'string' && /^[A-Z0-9-]{4,16}$/.test(id);
  }

  function showError(msg) {
    roomIdError.textContent = msg;
    roomIdError.classList.remove('hidden');
    roomIdInput.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    roomIdError.classList.add('hidden');
    roomIdInput.removeAttribute('aria-invalid');
  }

  // ── Client-side room ID generator (fallback) ──────────────────────────────
  function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  // ── Handle ?room= deep links ──────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const deepRoom = params.get('room');
  if (deepRoom && isValidRoomId(deepRoom.toUpperCase())) {
    roomIdInput.value = deepRoom.toUpperCase();
  }
})();
