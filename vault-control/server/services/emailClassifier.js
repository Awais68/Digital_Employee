import { callAI } from './aiProvider.js';

const CATEGORIES = {
  important:     'Requires action, from real person, time-sensitive',
  client:        'From existing or potential client/customer',
  invoice:       'Payment request, billing, financial document',
  info:          'General information, FYI, no action needed',
  newsletter:    'Regular newsletter, blog update, digest',
  advertisement: 'Promotional, marketing, sales pitch',
  spam:          'Junk, irrelevant, phishing attempt',
};

export async function classifyEmail(emailData) {
  const { from, subject, snippet, body } = emailData;

  const prompt = `Classify this email. Return ONLY valid JSON, no markdown:

Email:
From: ${from}
Subject: ${subject}
Preview: ${snippet || body?.substring(0, 500)}

Return exactly:
{
  "category": "<one of: important|client|invoice|info|newsletter|advertisement|spam>",
  "is_ai_generated": <true if automated system/bot, false if real human>,
  "confidence": <0.0 to 1.0>,
  "reason": "<one sentence why>",
  "requires_action": <true|false>,
  "priority": "<high|medium|low>"
}`;

  try {
    const response = await callAI('You are an email classifier.', prompt, 500);
    const clean = response.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return {
      category:      result.category || 'info',
      is_ai_generated: result.is_ai_generated || false,
      confidence:    result.confidence || 0.5,
      reason:        result.reason || '',
      requires_action: result.requires_action || false,
      priority:      result.priority || 'medium',
    };
  } catch (e) {
    console.error('Email classification error:', e);
    return { category: 'info', is_ai_generated: false, confidence: 0.3, reason: 'Classification failed', requires_action: false, priority: 'medium' };
  }
}

export async function extractTaskFromEmail(emailData, classification) {
  if (!classification.requires_action) return null;

  const prompt = `Extract the task from this email if any action is required.
From: ${emailData.from}
Subject: ${emailData.subject}
Body: ${emailData.snippet}

Return ONLY JSON or null:
{
  "has_task": true,
  "title": "short task title under 80 chars",
  "description": "what needs to be done",
  "due_date": "ISO date or null",
  "priority": "high|medium|low"
}`;

  try {
    const resp = await callAI('Extract tasks from emails.', prompt, 300);
    const data = JSON.parse(resp.replace(/```json|```/g, '').trim());
    if (!data.has_task) return null;
    return data;
  } catch {
    return null;
  }
}
