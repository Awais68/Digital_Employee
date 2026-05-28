import { EventEmitter } from 'events'

class AIEmployeeEventBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(100)
    this._log = []
  }

  emit(event, data) {
    const entry = {
      event,
      data: JSON.stringify(data).substring(0, 200),
      time: new Date().toISOString()
    }
    this._log.unshift(entry)
    if (this._log.length > 200) this._log.pop()
    console.log(`[EventBus] ${event}`, JSON.stringify(data).substring(0, 100))
    return super.emit(event, data)
  }

  getLog(limit = 50) {
    return this._log.slice(0, limit)
  }
}

export const bus = new AIEmployeeEventBus()

export const EVENTS = {
  EMAIL_NEW:           'email:new',
  EMAIL_PROCESSED:     'email:processed',
  EMAIL_DRAFT_CREATED: 'email:draft_created',

  WA_MESSAGE:          'whatsapp:message',
  WA_STATUS:           'whatsapp:status',
  WA_QR:               'whatsapp:qr',
  WA_CONNECTED:        'whatsapp:connected',

  POST_GENERATED:      'post:generated',
  POST_APPROVED:       'post:approved',
  POST_PUBLISHED:      'post:published',
  POST_FAILED:         'post:failed',

  TODO_CREATED:        'todo:created',
  TODO_REMINDER:       'todo:reminder',
  TODO_DONE:           'todo:done',

  NOTIFY:              'notify',

  SYSTEM_HEALTH:       'system:health',
}
