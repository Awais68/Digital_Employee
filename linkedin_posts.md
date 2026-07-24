# LinkedIn Posts — Digital Employee Project

---

## 1. SaaS vs Self-Build

I didn't use a SaaS tool for WhatsApp automation. Built it with Playwright. Bad decision? Maybe.

Session persistence was the first wall. Bot restarts, WhatsApp Web asks for QR again. Turns out Chromium's user-data-dir alone isn't enough — you need to persist session cookies separately. And even then, WhatsApp invalidates sessions if the IP changes. I burned three days staring at `AUTH_FAILURE` logs before I found the right combo of flags. Then the QR code re-scan loop hit. Bot would connect, work for 2 hours, then silently drop. No error, no crash. Just a blank page. Added a health check that screenshots every 5 minutes. Seeing a QR code on what should have been a chat screen hurt.

Running this on Oracle Cloud free tier means no GPU, 1GB RAM, headless Chromium. The browser config file is now longer than the actual bot code — `--disable-gpu`, `--disable-dev-shm-usage`, `--no-sandbox`, `--single-process`, no fonts, no extensions, nothing. A SaaS tool would've cost $20/month and saved two weeks. But now I own every layer. And when WhatsApp changes something at 2 AM, I don't wait for a vendor.

My favorite piece of jank: a cron job that force-restarts Chromium every 6 hours because memory creeps from 200MB to 1.2GB and the whole VM freezes. That script is held together with hope. And it works.

---

## 2. Bug/Failure Story

Every 4 to 6 hours, all 10 database connections died at once. No timeout error, no connection refused. Just dead sockets that looked alive but returned nothing.

Day one I blamed the app code. Bumped connectionTimeout from 30s to 120s. Same crash 4 hours later. Day two I checked PostgreSQL logs — the DB thought everything was fine. `pg_stat_activity` showed connections in `idle` state, then gone. Day three I checked Oracle Cloud networking. Firewall rules were fine. Security lists were fine. I was about to blame it on bad luck.

Turns out Oracle Cloud's NAT gateway silently drops TCP connections idle for more than 5 minutes. No RST packet, no FIN. Just silence. The server thinks the socket is alive, but it's already dead on the network level. So when the app tries to query, it waits until the pool's timeout kicks in — by then every connection is zombified.

Fix was one line: a 30-second keepalive on the Postgres connection string, plus a background worker pinging `SELECT 1` every 2 minutes on each connection.

Three days of debugging for a config change that took 10 seconds to deploy. The pool has a heartbeat now. I sleep slightly better.

---

## 3. Contrarian Take

LinkedIn is full of people talking about AI agents. "Built a multi-agent system in 2 hours with CrewAI." "AutoGPT is the future." "Agents will replace entire departments."

Cool demos. But is your agent running in production, processing real requests, 24/7, unattended?

I've been running my autonomous AI employee for weeks. It handles real emails, monitors directories, executes approved tasks. Here's what the demos don't show you: my agent hallucinated credentials twice. I caught it before it committed to git. It got stuck processing the same file 4 times in a loop — I added a dedup hash after that. Your 2-hour CrewAI setup will break at hour 3 when an API returns slightly different JSON and the agent doesn't know what to do. Running on free tier Oracle Cloud means the VM gets preempted and your autonomous agent is suddenly very not autonomous until you SSH in and restart.

The gap between "I built an agent" and "I run an agent in production" isn't a technology gap. It's ops. Error handling, monitoring, session recovery, resource limits, rate limiting, edge cases from real users doing unexpected things. Demos are easy. Production is boring, painful work. That's what makes it fun.

---

## 4. Behind-the-Scenes / Candid

[Photo: terminal with htop + multi-pane tmux session on Oracle Cloud VM]

2:47 AM. Three tmux panes — orchestrator, log tail, SSH into the voice VM debugging a WebSocket timeout. The free tier Oracle box has 1GB RAM and I'm running Chromium, Node, Python, and PostgreSQL on it. If you open too many browser tabs on your laptop, my entire AI system slows down.

Internet went down for 10 minutes last night. I panicked — not because I couldn't browse, but because I didn't know if the WhatsApp session survived the reconnect. It didn't. QR re-scan at 3 AM. Worth it? Probably not. Doing it anyway.

The dream is a self-hosted AI employee that never sleeps. The reality is me, a second-hand monitor, and a cron job that force-restarts Chromium every 6 hours so RAM doesn't leak. Zero VC money. Zero SaaS subscriptions. Duct tape, coffee, and a wife who's stopped asking why the server light is blinking at 4 AM.

---

## 5. Milestone Update

500 messages auto-processed. That's the number.

Emails, WhatsApp messages, social media drafts — all through the pipeline without me touching a keyboard for routine stuff. 314 emails classified, 12 needed human escalation (legal/financial stuff I didn't trust the agent with). 186 WhatsApp messages handled. 2 payments processed under $100. 17 bugs caught and patched by the system itself — yes, my AI employee does its own DevOps. One infinite loop that generated 47 draft responses to the same email before I killed it at 2 AM.

27 days live. Numbers are small but they're real. Actual production traffic from actual people.

Next up: multi-language support. The agent processes English and Urdu, but WhatsApp responses mix Roman Urdu with English and the tone matching is still rough. Also need to fix session migration so I don't manually copy auth files between VMs. 500 messages, 27 days, one grumpy Oracle Cloud free tier VM. Not bad for a side project.

---

## 6. Architecture Decision

"Why not run everything on one server?" I get this a lot. The answer is boring: isolation.

One VM runs the orchestrator, file watchers, database, email MCP, social posting pipeline. The brain. Another VM runs voice processing — speech-to-text, LLM inference, text-to-speech. The mouth. When the voice agent crashes (WebSocket timeouts are a recurring nightmare), the main system keeps running. Emails still process. WhatsApp still responds. A crash in the mouth shouldn't paralyze the brain.

The other reason is embarrassingly practical. Both VMs are Oracle free tier — 1GB RAM each. Running Chromium plus Node plus Postgres on one machine already hits 85% RAM. Adding voice processing would make it unusable. Oracle lets you have two free AMD instances. Not using both means leaving free compute on the table.

The tradeoff is everything got more complex. File syncing between VMs. Shared database access. WhatsApp session files that need to be on both machines. But when the voice VM goes down — and it will, probably today — the main VM doesn't even blink. Sometimes the right architecture isn't the simplest one. It's the one that isolates failure so your whole system doesn't die from one bad WebSocket.

---

## 7. Honest Struggle

WhatsApp session migration between servers is broken. I don't know when I'll fix it.

Two VMs. Main server runs WhatsApp automation. If it crashes or needs maintenance, I want the second VM to take over seamlessly. Sounds simple. It's not.

WhatsApp Web ties your session to browser fingerprints. User-Agent, screen resolution, WebGL renderer, canvas fingerprint, audio context. Move session data to a different VM with a different Chromium build and WhatsApp detects the mismatch. Invalid session. QR re-scan required. I've tried copying the user-data-dir between VMs — fails because GPU fingerprints differ. Took a full disk snapshot and restored on the other VM — worked once, but Chromium updates broke it. Ran Chromium in Docker with identical base images — Docker overlay networking introduced latency that triggered WhatsApp's reconnection logic. Thought about the WhatsApp Business API but Meta charges per message and it defeats the whole self-built point.

Current solution: the system detects a dead VM and sends me a Telegram alert. I wake up, SSH in, scan the QR code manually, go back to sleep. Takes 90 seconds. It's manual. It's embarrassing. The tech isn't the hard part. It's that WhatsApp's anti-automation measures are designed exactly for this use case — they don't want sessions moving between machines, and they've made it genuinely difficult.

I'll solve it eventually. But right now I haven't figured it out. Some problems don't need an immediate fix. They need you to admit you're beat. For now.