/**
 * room.js – VoxRoom audio room logic
 *
 * Responsibilities:
 *   1. Parse ?room=<id>&name=<nickname> from the URL
 *   2. Connect to Socket.io signalling server
 *   3. Request microphone access
 *   4. Manage WebRTC peer connections (one per remote participant)
 *   5. Handle mute/unmute, raise-hand, leave, copy link, share
 *   6. Update the participant list UI in real time
 */

(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────────────────────────
  // Replace with your deployed backend URL in production
  const BACKEND_URL = 'https://audio-8grl.onrender.com';

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // ── URL params ───────────────────────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const ROOM_ID = sanitizeRoomId(params.get('room') || '');
  const NICKNAME = sanitizeNickname(params.get('name') || localStorage.getItem('voxroom-nickname') || '');

  if (!ROOM_ID) {
    window.location.href = 'index.html';
    return;
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const roomIdDisplay   = document.getElementById('roomIdDisplay');
  const roomIdBadge     = document.getElementById('roomIdBadge');
  const statusDot       = document.getElementById('statusDot');
  const statusText      = document.getElementById('statusText');
  const participantList = document.getElementById('participantList');
  const participantCount= document.getElementById('participantCount');
  const micBtn          = document.getElementById('micBtn');
  const raiseHandBtn    = document.getElementById('raiseHandBtn');
  const leaveBtn        = document.getElementById('leaveBtn');
  const copyLinkBtn     = document.getElementById('copyLinkBtn');
  const shareWhatsAppBtn= document.getElementById('shareWhatsAppBtn');
  const micVisualiser   = document.getElementById('micVisualiser');
  const themeToggle     = document.getElementById('themeToggle');
  const toastEl         = document.getElementById('toast');

  // ── State ────────────────────────────────────────────────────────────────────
  let socket           = null;
  let localStream      = null;
  let isMuted          = false;
  let handRaised       = false;
  let mySocketId       = null;
  let reconnectAttempts= 0;

  /** @type {Map<string, RTCPeerConnection>} socketId → peer connection */
  const peers = new Map();
  /** @type {Map<string, {nickname: string, muted: boolean, handRaised: boolean}>} */
  const participantsInfo = new Map();

  // ── Init ─────────────────────────────────────────────────────────────────────
  roomIdDisplay.textContent = ROOM_ID;
  document.title = `VoxRoom – ${ROOM_ID}`;
  initTheme();
  initMicrophone();

  // ── Theme ─────────────────────────────────────────────────────────────────────
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

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ── Microphone ────────────────────────────────────────────────────────────────
  async function initMicrophone() {
    setStatus('connecting', 'Requesting microphone access…');
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      startVisualiser(localStream);
      connectSocket();
    } catch (err) {
      console.error('[mic]', err);
      setStatus('disconnected', 'Microphone access denied. Please allow microphone and reload.');
      showToast('⚠️ Microphone access is required to participate.', 6000);
    }
  }

  // ── Audio visualiser ─────────────────────────────────────────────────────────
  function startVisualiser(stream) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const bars = micVisualiser.querySelectorAll('.bar');

      function tick() {
        if (!localStream) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const active = !isMuted && avg > 5;
        micVisualiser.classList.toggle('active', active);

        bars.forEach((bar, i) => {
          const height = isMuted ? 8 : Math.max(8, (data[i * 2] / 255) * 44);
          bar.style.height = `${height}px`;
        });
        requestAnimationFrame(tick);
      }
      tick();
    } catch (e) {
      console.warn('[visualiser]', e);
    }
  }

  // ── Socket.io ─────────────────────────────────────────────────────────────────
  function connectSocket() {
    setStatus('connecting', 'Connecting to room…');

    socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => {
      reconnectAttempts = 0;
      socket.emit('join-room', { roomId: ROOM_ID, nickname: NICKNAME });
    });

    socket.on('room-joined', ({ socketId, peers: existingPeers, participants }) => {
      mySocketId = socketId;
      setStatus('connected', `Connected · ${ROOM_ID}`);
      updateParticipants(participants);
      // Initiate WebRTC with every existing peer
      existingPeers.forEach((peerId) => createOffer(peerId));
    });

    socket.on('user-connected', ({ socketId, participants }) => {
      updateParticipants(participants);
      showToast(`👤 Someone joined the room`);
    });

    socket.on('user-disconnected', ({ socketId, participants }) => {
      closePeer(socketId);
      updateParticipants(participants);
      showToast(`👤 Someone left the room`);
    });

    // WebRTC signalling
    socket.on('signal', async ({ fromId, signal }) => {
      if (signal.type === 'offer') {
        await handleOffer(fromId, signal);
      } else if (signal.type === 'answer') {
        await handleAnswer(fromId, signal);
      } else if (signal.candidate) {
        await handleCandidate(fromId, signal);
      }
    });

    socket.on('hand-raised', ({ socketId, raised }) => {
      const info = participantsInfo.get(socketId);
      if (info) {
        info.handRaised = raised;
        renderParticipants();
      }
    });

    socket.on('nickname-changed', ({ socketId, nickname }) => {
      const info = participantsInfo.get(socketId);
      if (info) {
        info.nickname = nickname;
        renderParticipants();
      }
    });

    socket.on('error', ({ message }) => {
      showToast(`⚠️ ${message}`, 5000);
      setStatus('disconnected', message);
    });

    socket.on('disconnect', (reason) => {
      setStatus('disconnected', `Disconnected (${reason})`);
      peers.forEach((_, id) => closePeer(id));
    });

    socket.on('reconnect_attempt', (attempt) => {
      reconnectAttempts = attempt;
      setStatus('connecting', `Reconnecting… (${attempt}/5)`);
    });

    socket.on('reconnect', () => {
      showToast('🔄 Reconnected');
    });

    socket.on('reconnect_failed', () => {
      setStatus('disconnected', 'Could not reconnect. Please refresh.');
      showToast('❌ Could not reconnect. Please refresh the page.', 8000);
    });
  }

  // ── WebRTC helpers ────────────────────────────────────────────────────────────

  function createPeer(remoteId) {
    if (peers.has(remoteId)) return peers.get(remoteId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    // ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('signal', { targetId: remoteId, signal: candidate });
      }
    };

    // Remote audio
    pc.ontrack = ({ streams }) => {
      const audio = new Audio();
      audio.srcObject = streams[0];
      audio.autoplay = true;
      // Store on element for cleanup
      audio.dataset.peerId = remoteId;
      document.body.appendChild(audio);
    };

    pc.oniceconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) {
        closePeer(remoteId);
      }
    };

    peers.set(remoteId, pc);
    return pc;
  }

  async function createOffer(remoteId) {
    const pc = createPeer(remoteId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { targetId: remoteId, signal: pc.localDescription });
    } catch (err) {
      console.error('[offer]', err);
    }
  }

  async function handleOffer(fromId, offer) {
    const pc = createPeer(fromId);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { targetId: fromId, signal: pc.localDescription });
    } catch (err) {
      console.error('[answer]', err);
    }
  }

  async function handleAnswer(fromId, answer) {
    const pc = peers.get(fromId);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('[set-answer]', err);
    }
  }

  async function handleCandidate(fromId, candidate) {
    const pc = peers.get(fromId);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // Ignore benign ICE errors
    }
  }

  function closePeer(peerId) {
    const pc = peers.get(peerId);
    if (pc) {
      pc.close();
      peers.delete(peerId);
    }
    // Remove remote audio element
    const audioEl = document.querySelector(`audio[data-peer-id="${peerId}"]`);
    if (audioEl) audioEl.remove();
  }

  // ── Participant list UI ───────────────────────────────────────────────────────

  function updateParticipants(list) {
    // Rebuild map from server-authoritative list
    participantsInfo.clear();
    list.forEach(({ socketId, nickname }) => {
      participantsInfo.set(socketId, {
        nickname: nickname || 'Guest',
        muted: socketId === mySocketId ? isMuted : false,
        handRaised: false,
      });
    });
    renderParticipants();
  }

  function renderParticipants() {
    participantList.innerHTML = '';
    participantCount.textContent = participantsInfo.size;

    participantsInfo.forEach(({ nickname, muted, handRaised }, socketId) => {
      const isMe = socketId === mySocketId;
      const li = document.createElement('li');
      li.className = `participant-item${handRaised ? ' hand-raised' : ''}`;
      li.dataset.socketId = socketId;

      const initial = (nickname || '?')[0].toUpperCase();
      li.innerHTML = `
        <div class="participant-avatar">${initial}</div>
        <span class="participant-name">${escapeHtml(nickname)}${isMe ? ' (you)' : ''}</span>
        ${muted ? '<span class="participant-badge-muted" title="Muted">🔇</span>' : ''}
      `;
      participantList.appendChild(li);
    });
  }

  // ── Controls ──────────────────────────────────────────────────────────────────

  // Mute / Unmute
  micBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
    }
    micBtn.classList.toggle('muted', isMuted);
    micBtn.setAttribute('aria-label', isMuted ? 'Unmute microphone' : 'Mute microphone');
    micBtn.querySelector('.icon-mic-on').classList.toggle('hidden', isMuted);
    micBtn.querySelector('.icon-mic-off').classList.toggle('hidden', !isMuted);
    showToast(isMuted ? '🔇 Muted' : '🎙️ Unmuted');

    // Update own entry in participant list
    const myInfo = participantsInfo.get(mySocketId);
    if (myInfo) { myInfo.muted = isMuted; renderParticipants(); }
  });

  // Raise / Lower hand
  raiseHandBtn.addEventListener('click', () => {
    handRaised = !handRaised;
    raiseHandBtn.classList.toggle('raised', handRaised);
    raiseHandBtn.setAttribute('aria-label', handRaised ? 'Lower hand' : 'Raise hand');
    if (socket) socket.emit('raise-hand', { roomId: ROOM_ID, raised: handRaised });
    showToast(handRaised ? '✋ Hand raised' : 'Hand lowered');
  });

  // Leave room
  leaveBtn.addEventListener('click', leaveRoom);

  function leaveRoom() {
    if (socket) {
      socket.emit('leave-room', { roomId: ROOM_ID });
      socket.disconnect();
    }
    peers.forEach((_, id) => closePeer(id));
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    window.location.href = 'index.html';
  }

  window.addEventListener('beforeunload', () => {
    if (socket) { socket.emit('leave-room', { roomId: ROOM_ID }); }
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
  });

  // Copy invite link
  const inviteUrl = `${window.location.origin}${window.location.pathname.replace('room.html', 'index.html')}?room=${ROOM_ID}`;

  roomIdBadge.addEventListener('click', () => copyToClipboard(inviteUrl));
  roomIdBadge.addEventListener('keydown', (e) => { if (e.key === 'Enter') copyToClipboard(inviteUrl); });
  copyLinkBtn.addEventListener('click', () => copyToClipboard(inviteUrl));

  shareWhatsAppBtn.addEventListener('click', () => {
    const text = encodeURIComponent(`Join my VoxRoom audio room: ${inviteUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  });

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('📋 Link copied to clipboard!');
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('📋 Link copied!');
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  function setStatus(state, message) {
    statusDot.className = `status-dot ${state}`;
    statusText.textContent = message;
  }

  let toastTimer = null;
  function showToast(message, duration = 3000) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function sanitizeRoomId(id) {
    if (typeof id !== 'string') return '';
    const clean = id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 16).toUpperCase();
    return clean.length >= 4 ? clean : '';
  }

  function sanitizeNickname(name) {
    if (typeof name !== 'string' || name.trim() === '') return 'Guest';
    return name.replace(/[<>&"'/]/g, '').trim().slice(0, 30) || 'Guest';
  }
})();
