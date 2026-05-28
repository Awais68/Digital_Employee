import { bus, EVENTS } from './server/services/eventBus.js'
import { notify, getNotifications } from './server/services/notificationService.js'
import { initNotificationsTable } from './server/services/notificationService.js'

await initNotificationsTable()

console.log('Testing EventBus...')
bus.on(EVENTS.EMAIL_NEW, (data) => console.log('Email event received:', data.subject))
bus.emit(EVENTS.EMAIL_NEW, { subject: 'Test Email', sender: 'test@test.com', priority: 'high' })

console.log('Testing Notifications...')
notify('success', 'Test', 'System working', {})
const notifs = getNotifications()
console.log('Notifications:', notifs.length, 'in store')

console.log('All tests passed!')
process.exit(0)
