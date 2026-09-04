class NotificationSystem {
  constructor() {
    this.PRIORITIES = {
      IMMEDIATE: { level: 1, label: '🔴 IMMEDIATE', whatsapp: true, email: true },
      URGENT:    { level: 2, label: '🟠 URGENT',    whatsapp: true, email: true },
      NORMAL:    { level: 3, label: '🟡 NORMAL',    whatsapp: false, email: true },
      INFO:      { level: 4, label: '🟢 INFO',      whatsapp: false, email: false }
    }
  }

  async saveToDatabase(event, data, priority) {
    const db = require('./db')
    await db.run(
      'INSERT INTO notifications (event, data, priority, created_at) VALUES (?, ?, ?, ?)',
      [event, JSON.stringify(data), priority, Date.now()]
    )
  }

  async sendWhatsApp(event, data, priority) {
    const { send_whatsapp } = require('./whatsapp')
    await send_whatsapp(`[${this.PRIORITIES[priority].label}] ${event}\n${JSON.stringify(data)}`)
  }

  async sendEmail(event, data, priority) {
    const { send_email } = require('./email')
    await send_email({
      subject: `[${priority}] ${event}`,
      body: JSON.stringify(data)
    })
  }

  async notify(event, data, priority = 'NORMAL') {
    await this.saveToDatabase(event, data, priority)

    if (global.broadcast) {
      global.broadcast({
        type: 'notification',
        notification: {
          id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          category: priority === 'IMMEDIATE' || priority === 'URGENT' ? 'error' : 'info',
          title: event,
          message: typeof data === 'string' ? data : JSON.stringify(data),
          read: false,
          timestamp: new Date().toISOString(),
          data: { event, priority, ...(typeof data === 'object' && data ? data : {}) }
        }
      })
    }

    if (['IMMEDIATE','URGENT'].includes(priority)) {
      await this.sendWhatsApp(event, data, priority)
    }

    if (['IMMEDIATE','URGENT','NORMAL'].includes(priority)) {
      await this.sendEmail(event, data, priority)
    }
  }
}

module.exports = new NotificationSystem()
