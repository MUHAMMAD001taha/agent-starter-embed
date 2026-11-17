# Deployment task: Learn Easy voice agent "Anaya" — frontend to Vercel, backend to AWS EC2

You have access to the project folder `F:\d drive storage\agent-starter-embed-main`. Your job is
to deploy this working voice-agent project to production: the **frontend (Next.js) to Vercel**
and the **backend (Python LiveKit agent) to an AWS EC2 instance**, and make sure the two work
together in production exactly as they do locally today.

Talk to me (the owner) in simple Roman Urdu. I am not a deep DevOps expert, so explain each
step briefly and tell me exactly what I must click or provide.

---

## 0. Ground rules (read first)

1. **Read before you change.** Read the files named below before editing anything. Several
   config files in this project are stale (see section 3) — trust the code that actually runs,
   not the template files.
2. **Ask before anything that costs money or is hard to undo:** creating EC2 instances, Elastic
   IPs, domains, paid Vercel plans, deleting anything, changing DNS, or changing the LiveKit /
   Braintel phone setup. Tell me what it costs and wait for my "yes".
3. **Never print, commit, or paste secret values** (API keys, secrets, passwords) into chat,
   code, logs, or git. Refer to them by variable name only. Secrets live in:
   - `agent-starter-embed-main\.env` (frontend)
   - `backend\.env` (backend)
   - `backend\telephony\telephony.env` (phone line — Braintel + LiveKit SIP passwords)
4. **Do not change the agent's behaviour.** Do not edit the system prompt or logic in
   `backend\src\second.py` except for what deployment strictly needs. Do not change
   `agentName` / `AGENT_NAME` (see section 2).
5. **Only one production agent at a time.** See section 6 — two workers registered under the
   same agent name will split real calls between them.
6. This folder is **not a git repository**. Ask me how I want to deploy to Vercel (Vercel CLI
   from this folder, or I create a GitHub repo and import it) before choosing.
7. The local machine is Windows 11. Windows "Smart App Control" blocks some native binaries
   locally (Next.js SWC, LiveKit noise-cancellation DLL). That is a local-only problem; it does
   NOT apply on Vercel or on Linux EC2. Don't "fix" it by changing the code.

---

## 1. Project layout

| What | Path |
|---|---|
| Root | `F:\d drive storage\agent-starter-embed-main` |
| Frontend (Next.js 15, pnpm) | `agent-starter-embed-main\` (yes, same name nested) |
| Frontend env | `agent-starter-embed-main\.env` |
| Agent name used by frontend | `agent-starter-embed-main\app-config.ts` → `agentName: 'vidazin'` |
| Token API route | `agent-starter-embed-main\app\api\connection-details\route.ts` |
| Hook that calls the route | `agent-starter-embed-main\hooks\use-connection-details.ts` |
| Embed popup build (webpack) | `agent-starter-embed-main\webpack.config.js` (reads `.env.local` via dotenv-webpack) |
| Backend (Python agent) | `backend\` |
| Agent entry point (the real one) | `backend\src\second.py` |
| Course data | `backend\src\learneasy_data.py` |
| Backend env | `backend\.env` |
| Backend tests | `backend\tests\` (unit tests: `pytest`, end-to-end: `e2e_*.py`, `check_*.py`) |
| Existing Linux deploy scripts | `backend\telephony\deploy-to-vps.ps1`, `deploy-remote.sh`, `install-agent-service.sh`, `setup-asterisk.sh`, `setup_livekit_sip.py`, `check_livekit_sip.py` |
| Phone line notes | `backend\telephony\GUIDE.md`, `backend\telephony\LOCAL-SETUP.md` |
| Per-call logs (local) | `backend\logs\calls\` |

---

## 2. How the frontend and backend actually connect (IMPORTANT)

There is **no direct HTTP/API connection between the frontend and the backend.** Do not
invent one, do not open an API port on EC2 for the frontend, and do not put the EC2 IP in
the frontend. They meet inside **LiveKit Cloud**:

```
Browser ──► Vercel (Next.js)
              └─ POST /api/connection-details
                   uses LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL
                   creates a random room + a user token
                   and puts an agent dispatch for agent_name "vidazin" inside the token
Browser ──► LiveKit Cloud (wss://…livekit.cloud) joins the room with that token
                   LiveKit dispatches the job to a worker registered as "vidazin"
EC2 (backend) ──► LiveKit Cloud: the Python agent connects OUT over wss/443,
                   registers as worker "vidazin" (@server.rtc_session(agent_name=os.getenv("AGENT_NAME","vidazin"))),
                   receives the job, joins the room, talks to Gemini (Google API) and the caller.
```

So the "connection" is three things that must match:

1. **Same LiveKit project:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` must be the
   same project in the Vercel env vars and in the EC2 `backend/.env`.
2. **Same agent name:** frontend `app-config.ts` `agentName: 'vidazin'` == backend
   `AGENT_NAME` (unset → defaults to `vidazin`).
3. **Backend running and registered:** the EC2 log must show `registered worker {"agent_name":
   "vidazin", ...}`.

The phone line works the same way: Braintel → Asterisk → LiveKit SIP trunk → dispatch rule
`vidazin-inbound-calls` → agent `vidazin`. `backend\telephony\check_livekit_sip.py` prints the
trunk and rule.

### The one frontend URL setting that must change
`agent-starter-embed-main\.env` currently has
`NEXT_PUBLIC_CONN_DETAILS_ENDPOINT=http://localhost:3000/api/connection-details`.
`NEXT_PUBLIC_*` values are baked in at build time.
- For the Vercel site itself (and the `/embed` iframe): **do not set it** on Vercel (the hook
  falls back to the relative `/api/connection-details`), or set it to
  `https://<the-vercel-domain>/api/connection-details`. Never leave `localhost`.
- For the **embed popup script** (`public/embed-popup.js`, built by `pnpm build-embed-popup-script`
  from `.env.local`) that will be placed on another website (e.g. learneasy.pk): it needs the
  **absolute** Vercel URL, and because it calls the route from another origin, the route needs
  **CORS** (handle `OPTIONS` and add `Access-Control-Allow-Origin` for the allowed site(s) — do
  not use `*` with credentials). Ask me which website(s) will embed it.

---

## 3. Known problems to fix before deploying the backend

1. **`backend\pyproject.toml` is stale** (template from the starter): it lists
   `livekit-agents[google,silero,turn-detector]~=1.4`, `livekit-plugins-noise-cancellation~=0.2`.
   The code that runs today was built and tested with these versions (from the local venv,
   Python 3.12.10):
   ```
   livekit-agents==1.8.11        livekit==1.2.0              livekit-api==1.2.2
   livekit-plugins-google==1.8.10   livekit-plugins-silero==1.8.10
   livekit-plugins-turn-detector==1.8.10   livekit-plugins-noise-cancellation==0.3.2
   livekit-plugins-deepgram==1.8.11 (only used by second_pipeline.py, not by second.py)
   livekit-blingfire==1.2.0   livekit-protocol==1.1.31   google-genai==2.34.0
   numpy==2.5.4   aiohttp==3.14.5   certifi   python-dotenv==1.2.4   onnxruntime==1.31.1
   ```
   `uv.lock` pins `livekit-agents` 1.8.10. Make the server install match what runs locally:
   get the full list with `backend\.venv\Scripts\python.exe -m pip freeze`, update
   `pyproject.toml` dependencies accordingly (add `numpy`, `google-genai`, `certifi`, etc.
   that `second.py` imports directly), regenerate `uv.lock` (`uv lock`), and confirm the server
   ends up with livekit-agents 1.8.10/1.8.11. Use Python 3.12 on the server.
2. **`backend\Dockerfile` is stale**: it runs `src/agent.py`, which does not exist. The entry
   point is `src/second.py`. If you deploy with Docker, fix it (`uv run src/second.py start`,
   `download-files` likewise). If you deploy with systemd (recommended, scripts exist), the
   Dockerfile can be left alone — just don't use it as-is.
3. **`backend\tests\test_agent.py`** is a broken starter-template test (imports a missing
   `agent` module). Run the suite with `--ignore=tests/test_agent.py`. All other tests (110)
   should pass: `uv run pytest tests -q --ignore=tests/test_agent.py`.
4. The backend folder contains `.bak` files, `GE.PY`, `second_pipeline.py`, `logs\`, `.venv\`.
   Do not upload `.venv` (Windows venv does not work on Linux) or `logs\`. The other files are
   harmless; don't delete them without asking.

---

## 4. Frontend → Vercel

1. Read `package.json`: build is `next build && pnpm build-embed-popup-script`, package
   manager pnpm (`pnpm-lock.yaml`). Root directory on Vercel = the nested
   `agent-starter-embed-main` folder.
2. Ask me: Vercel CLI from this folder, or GitHub import? Then create/link the Vercel project.
3. Set Vercel environment variables (Production, and Preview if wanted) — values from the
   local `.env`, entered by me in the dashboard or by you via `vercel env add` without echoing
   them:
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (server-side only — must NOT be
     prefixed `NEXT_PUBLIC_`)
   - `NEXT_PUBLIC_CONN_DETAILS_ENDPOINT` — omit, or the production URL (section 2)
4. Make sure the embed popup build reads the right endpoint (it uses `.env.local` via
   dotenv-webpack; on Vercel there is no `.env.local`, so check what ends up in
   `public/embed-popup.js` and fix the config so it uses the Vercel env var or the production
   URL).
5. Deploy, then verify: open the Vercel URL, `POST /api/connection-details` returns 200 with
   `serverUrl`, `roomName`, `participantToken`; starting a call creates a room in LiveKit.
6. If the popup will run on another site, add CORS to the route (section 2) and test from that
   origin.

---

## 5. Backend → AWS EC2

Before creating anything, propose this and wait for my OK:
- **Region:** `ap-south-1` (Mumbai) — the LiveKit Cloud project is in "India South"; keep the
  agent close to it.
- **Instance:** at least `t3.medium` (2 vCPU, 4 GB). The agent keeps 2 warm worker processes
  (`NUM_IDLE_PROCESSES=2`), each loading Silero VAD, noise cancellation and the Gemini client.
  Smaller instances risk slow joins and audio stalls.
- **OS:** Ubuntu Server LTS (24.04 or newer), x86_64. Python 3.12 via `uv`.
- **Elastic IP:** yes if the phone line (Asterisk) will move to EC2 too (Braintel whitelists
  the IP); optional otherwise.
- **Security group:**
  - Agent only: inbound **SSH 22 from my IP only**. No other inbound ports — the agent only
    makes outbound connections (443 to LiveKit and Google).
  - If Asterisk also moves to EC2: inbound `5060/udp` (from Braintel's IP only), `5061/tcp`
    (LiveKit SIP over TLS), `10000-20000/udp` (RTP audio).

Deployment steps:
1. Fix `pyproject.toml` / `uv.lock` first (section 3).
2. Read `backend\telephony\deploy-to-vps.ps1`, `deploy-remote.sh`, `install-agent-service.sh`.
   They already: upload the backend (without `.venv`), install `uv`, run `uv sync`, run
   `src/second.py download-files`, and create a systemd service **`vidazin-agent`** running
   `uv run src/second.py start` (auto-restart, starts on boot). `deploy-remote.sh` ALSO runs
   `setup-asterisk.sh` (phone line). **Ask me whether the phone line moves to EC2 now.** If not,
   run only `install-agent-service.sh` on the server, not `deploy-remote.sh`.
3. Upload `backend\.env` to the server securely (scp), never via chat. Fix Windows line
   endings (`sed -i 's/\r$//'`), as the scripts already do. Required variables:
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GOOGLE_API_KEY`
   (`DEEPGRAM_API_KEY` only matters for `second_pipeline.py`). Optional tuning variables the
   code reads (leave unset for defaults): `AGENT_NAME` (default `vidazin`),
   `NUM_IDLE_PROCESSES` (2), `BROWSER_NC` (`bvc`), `PHONE_NC` (`none`), `BARGE_IN` (`on`),
   `BARGE_IN_PHONE_LEVEL` (0.01), `BARGE_IN_BROWSER_LEVEL` (0.02),
   `BARGE_IN_BROWSER_MIN_SPEECH` (0.6), `GEMINI_TEMPERATURE` (0.5), `OFFICE_AMBIENCE` (on),
   `OFFICE_AMBIENCE_LEVEL` (0.006), `VOICE_GATE` (off), `GENDER_NOTE_MODE` (restart).
4. On the server: `uv run pytest tests -q --ignore=tests/test_agent.py` must pass before
   starting the service.
5. Start: `sudo systemctl enable --now vidazin-agent`; check
   `journalctl -u vidazin-agent -f` for `registered worker {"agent_name": "vidazin" ... }` and no
   tracebacks. On Linux the noise-cancellation plugin should load normally (no
   "noise_cancellation plugin failed to load" warning — if you see it, tell me).
6. Run one end-to-end test against production from the server or my PC, e.g.
   `uv run tests/e2e_interrupt.py` (needs the same LiveKit env vars; it dispatches to
   `AGENT_NAME`). Expect `7/7 passed`.

---

## 6. Cut-over (avoid two "vidazin" agents)

Right now a local agent may be running on my Windows PC as `vidazin` (started with
`backend\.venv\Scripts\python.exe src\second.py dev`, or `telephony\run-phone-line.ps1` for the
phone line). If both the local one and the EC2 one are registered as `vidazin`, LiveKit splits
calls between them at random.
- Before going live on EC2, tell me to stop the local one (`telephony\stop-phone-line.ps1`, or
  stop the python process). Check no call is in progress first (LiveKit dashboard → Rooms, or
  newest file in `backend\logs\calls\`).
- For later local testing, run the local agent with `AGENT_NAME=vidazin-test` and point a local
  frontend at it — never reuse `vidazin` locally.
- In the LiveKit dashboard → Agents, confirm only the EC2 worker(s) are registered.

---

## 7. Phone line (only if I say it moves to EC2)

- Today: Asterisk 22 on Ubuntu (WSL2) on my PC, PJSIP. Trunk to Braintel over UDP 5060
  (registers as user `2105074` to `122.129.64.200`), trunk to LiveKit SIP over TLS 5061,
  RTP 10000–20000, number +92 42 32105074. All settings come from
  `backend\telephony\telephony.env`; `setup-asterisk.sh` writes the Asterisk config.
- Moving it: Elastic IP on EC2 → I ask Braintel to whitelist the new IP → run
  `deploy-to-vps.ps1 -ServerIp <elastic-ip> -SipHost <project>.sip.livekit.cloud` (it also
  updates the LiveKit trunk/rule via `setup_livekit_sip.py`) → verify
  `sudo asterisk -rx "pjsip show registrations"` shows `Registered` → place a test call.
- Then stop Asterisk in WSL on my PC so two PBXs don't register the same Braintel account.

---

## 8. Done means

- [ ] Vercel URL loads; starting a call connects and Anaya greets.
- [ ] `/api/connection-details` works on Vercel; no `localhost` anywhere in the built JS.
- [ ] EC2 `vidazin-agent` service running, survives a reboot, logs show `registered worker`.
- [ ] Unit tests pass on EC2; `e2e_interrupt.py` passes against production.
- [ ] Only the EC2 worker is registered as `vidazin`.
- [ ] (If embed popup is used) works from the target site; CORS restricted to that site.
- [ ] (If phone moved) Braintel `Registered` on EC2 and a real test call works.
- [ ] No secrets in code, chat, or any file outside the `.env` files.
- [ ] A short `DEPLOYMENT_NOTES.md` in the root: URLs, instance id/region/IP, service name, how
      to redeploy (frontend and backend), how to view logs, how to roll back.
