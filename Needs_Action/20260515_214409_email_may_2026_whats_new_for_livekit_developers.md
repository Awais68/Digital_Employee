---
type: email
from: LiveKit Team <marketing@hello.livekit.io>
subject: May 2026 | What's New for LiveKit Developers
received: 2026-05-15T16:44:09.363142+00:00
priority: normal
status: pending
email_id: 19e2918c3e48dd15
thread_id: 19e2918c3e48dd15
---

# 📧 Email: May 2026 | What's New for LiveKit Developers

## Email Details

| Field | Value |
|-------|-------|
| **From** | LiveKit Team <marketing@hello.livekit.io> |
| **To** | codetheagent1@gmail.com |
| **Received** | 2026-05-15 00:45:48 UTC |
| **Priority** | NORMAL |
| **Status** | Pending |

---

## Email Content

Answering machine detection, voice cloning, structured data collection

͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏
  ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏
  ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏
  ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏
  ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏
  ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏
  ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­͏   ­

 


Hey LiveKit devs,


We’ve got this month’s roundup for you, let’s get into it.

 
 



 
 


Product Changelog


Answering Machine Detection (AMD)

LiveKit Agents can now figure out who (or what) actually picks up an outbound call. Answering machine detection (AMD)
[https://docs.livekit.io/telephony/features/answering-machine-detection/] classifies recipients as human, voicemail, IVR, or
unavailable within the first second of the call so your agent can adapt accordingly: start the conversation, leave a voicemail,
navigate the IVR menu, or hang up and retry.
 
AMD is available in Python 1.5.9+ and TypeScript 1.4.2+ and surfaces classifications in Agent Console
[https://docs.livekit.io/agents/start/console/] and Agent Observability [https://livekit.com/products/agent-observability] as
distinct events. Learn more in our blog [https://livekit.com/blog/answering-machine-detection] or watch Shayne’s walkthrough
[https://www.youtube.com/watch?v=aVXk6N31X7o] to see it in action.
 

https://www.youtube.com/watch?v=aVXk6N31X7o

 


Custom voices in LiveKit Inference

You can now clone a voice on LiveKit Inference [https://docs.livekit.io/agents/multimodality/audio/custom-voices/] across multiple
TTS providers. A custom voice gives your agent character that fits your brand and the specific job it’s doing. Record or upload an
audio sample and get a custom voice ID to use with your agents.
 
If your TTS request fails mid-call, LiveKit Inference [https://livekit.com/products/inference] automatically falls back to the
same voice on another provider so the call can continue with minimal disruptions instead of switching to a different default
voice. Voice cloning is available today on all paid plans on LiveKit Cloud. Read our announcement blog
[https://livekit.com/blog/voice-cloning-livekit-inference] and watch Jesse’s video [https://www.youtube.com/watch?v=W88yGyaGrZs]
to learn more.
 

https://www.youtube.com/watch?v=W88yGyaGrZs


Structured data collection in LiveKit Agents

Need your agent to capture lead details, appointment info, or any other structured output during a call? Define a schema and your
LiveKit agent will collect that data over the course of the conversation, prompting for missing fields, validating answers, and
emitting a clean JSON record at the end.
 
Structured data collection is available in code [https://docs.livekit.io/agents/logic/tasks/] using Tasks and TaskGroups, or in
your browser using Data collection mode [https://docs.livekit.io/agents/start/builder/#data-collection] in Agent Builder
[https://livekit.com/products/agent-builder]. Watch Jesse’s walkthrough [https://www.youtube.com/watch?v=uLT96gQdm-I] to see an
example and read the blog [https://livekit.com/blog/collect-structured-data-with-livekit-agents] for more details.
 

https://www.youtube.com/watch?v=uLT96gQdm-I




Content & Community Highlights


Add agent guardrails with the observer pattern

Most voice agent guardrails live in the system prompt, where they compete with everything else the LLM has to track. Our latest
deep dive [https://livekit.com/blog/observer-pattern-voice-agent-guardrails] walks through using the observer pattern in LiveKit
Agents to run guardrails as a separate process, catching prompt injection, off-topic responses, and policy violations in real time
without slowing down your main loop. Check out Shayne’s video [https://www.youtube.com/watch?v=jzpHIY_iTTw] for the full
breakdown:
 

https://www.youtube.com/watch?v=jzpHIY_iTTw


Run a full voice pipeline on xAI

With xAI's new STT model [https://docs.livekit.io/agents/integrations/xai/], you can now run an entire voice agent pipeline on xAI
(STT, Grok, and TTS) through LiveKit Inference with a single API key. Watch Jesse's video
[https://www.youtube.com/watch?v=ER4ZoA6jsbI] on why a cascaded pipeline still wins over a realtime model when you need control,
debuggability, and full visibility at every sta

---

## Action Items

- [ ] Review email content
- [ ] Determine required action
- [ ] Draft response (if needed)
- [ ] Execute action items
- [ ] Mark as complete

## Notes

*Add context, decisions, or follow-up notes here*

---
*Generated by Gmail Watcher v2.0 on 2026-05-15 21:44:09*
