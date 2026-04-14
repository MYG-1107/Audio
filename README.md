# 🎙️ VoxRoom – Free Instant Audio Rooms

> **Real-time voice collaboration in your browser. No account, no download, no friction.**

VoxRoom lets anyone create or join an audio room by sharing a simple Room ID.  
It runs entirely in the browser using **WebRTC** for peer-to-peer audio and **Socket.io** for signalling.

---

## ✨ Features

| Feature | Status |
|---|---|
| Create room (auto-generated ID) | ✅ |
| Join room by Room ID | ✅ |
| Mute / Unmute microphone | ✅ |
| Live participant list | ✅ |
| Raise hand | ✅ |
| Copy / share invite link | ✅ |
| Share via WhatsApp | ✅ |
| Dark & light mode | ✅ |
| Nickname (guest, no login) | ✅ |
| Nickname persistence (localStorage) | ✅ |
| Mobile-friendly responsive UI | ✅ |
| SEO meta tags & JSON-LD | ✅ |
| Rate limiting & input sanitisation | ✅ |

---

## 🗂 Folder Structure

```
Audio/
├── backend/
│   ├── server.js              # Express + Socket.io entry point
│   ├── package.json
│   ├── .env.example
│   ├── routes/
│   │   └── rooms.js           # REST: create room, validate room
│   ├── sockets/
│   │   └── roomSocket.js      # Socket.io room + WebRTC signalling
│   └── utils/
│       └── roomManager.js     # In-memory room state
└── frontend/
    ├── index.html             # Homepage (SEO optimised)
    ├── room.html              # Audio room UI
    ├── styles.css             # Responsive, dark/light CSS
    ├── app.js                 # Homepage JS (create/join)
    ├── room.js                # Room JS (WebRTC + Socket.io)
    ├── sitemap.xml
    └── robots.txt
```

---

## 🏗 Architecture

```
Browser A                  Signalling Server             Browser B
   |                       (Node.js + Socket.io)            |
   |── join-room ─────────────────>|                         |
   |<── room-joined (peers: [B]) ──|                         |
   |                               |<──── join-room ─────────|
   |<── user-connected ────────────|                         |
   |                               |─── user-connected ─────>|
   |                                                         |
   |────── signal (offer) ─────────────────────────────────>|
   |<───── signal (answer) ─────────────────────────────────|
   |<────> signal (ICE candidates) ─────────────────────────|
   |                                                         |
   |<══════════════ P2P Audio (WebRTC) ═══════════════════>|
```

**Socket events**

| Direction | Event | Payload |
|---|---|---|
| Client → Server | `join-room` | `{ roomId, nickname }` |
| Client → Server | `leave-room` | `{ roomId }` |
| Client → Server | `signal` | `{ targetId, signal }` |
| Client → Server | `raise-hand` | `{ roomId, raised }` |
| Server → Client | `room-joined` | `{ socketId, peers, participants }` |
| Server → Client | `user-connected` | `{ socketId, participants }` |
| Server → Client | `user-disconnected` | `{ socketId, participants }` |
| Server → Client | `signal` | `{ fromId, signal }` |
| Server → Client | `hand-raised` | `{ socketId, raised }` |

**REST endpoints**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/rooms/create` | Generate a new room ID |
| `GET` | `/api/rooms/:roomId/validate` | Validate a room ID format |
| `GET` | `/api/rooms` | List active rooms (participant count only) |
| `GET` | `/health` | Health check |

---

## 🚀 Local Development

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### 1 – Backend

```bash
cd backend
cp .env.example .env          # edit FRONTEND_URL if needed
npm install
npm run dev                    # starts on http://localhost:3000
```

### 2 – Frontend

Serve the frontend with any static server, e.g.:

```bash
cd frontend
npx serve .                    # http://localhost:5500 (or use VS Code Live Server)
```

> **Important:** The `BACKEND_URL` constant at the top of `app.js` and `room.js` must
> match your running backend URL (default: `http://localhost:3000`).

Open **http://localhost:5500** (or whichever port your static server uses) in two browser
tabs to test multi-user audio.

---

## ☁️ Deployment

### Backend – Render / Railway

1. Push the repository to GitHub.
2. Create a new **Web Service** on [Render](https://render.com) or [Railway](https://railway.app).
3. Set **Root Directory** → `backend`.
4. Set **Build Command** → `npm install`.
5. Set **Start Command** → `npm start`.
6. Add environment variables:
   ```
   PORT=3000
   FRONTEND_URL=https://your-frontend-domain.com
   NODE_ENV=production
   ```
7. Note the deployed URL (e.g. `https://voxroom-backend.onrender.com`).

### Frontend – Vercel / GitHub Pages

#### Vercel (recommended)
1. Import the repo in [Vercel](https://vercel.com).
2. Set **Root Directory** → `frontend`.
3. Deploy – Vercel auto-detects static files.

#### GitHub Pages
1. Go to **Settings → Pages** in your repo.
2. Source: **Deploy from a branch** → `main` → `/frontend`.
3. Save. Your site will be at `https://<user>.github.io/<repo>/frontend/`.

### Connect frontend to backend

Edit the `BACKEND_URL` constant at the top of both `frontend/app.js` and `frontend/room.js`:

```js
const BACKEND_URL = 'https://voxroom-backend.onrender.com';
```

### CORS

In `backend/.env` set:
```
FRONTEND_URL=https://your-frontend-domain.com
```

---

## 🔐 Security Notes

- Room IDs are sanitised (alphanumeric + hyphens, 4–16 chars).
- Nicknames are stripped of HTML characters.
- Per-socket join rate limiting (10 joins/minute).
- HTTP API rate limiting (60 requests/minute).
- Rooms are capped at 20 participants.
- No audio is relayed through the server (WebRTC P2P).
- **HTTPS is required** in production for microphone access (`getUserMedia`).

---

## 📈 Roadmap / Ideas

- 🔴 Record rooms (MediaRecorder API)
- 🤖 AI transcription (Whisper API)
- 📅 Scheduled rooms
- 🔕 Silent mode (text-only)
- 💰 Premium private rooms
- 📊 Redis-backed room state for horizontal scaling
- 🌐 TURN server support for restrictive NAT environments

---

## 💡 Niche Variations

| Variation | Description |
|---|---|
| 📚 **StudyRoom** | Silent + discussion modes, Pomodoro timer |
| 💚 **SafeSpace** | Anonymous mental health support rooms |
| 🏘 **LocalVoice** | Hyperlocal community discussions by postcode |

---

## 📄 License

MIT © VoxRoom Contributors