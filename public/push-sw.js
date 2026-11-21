/* Imported into the generated service worker (vite.config.ts → workbox.importScripts).
   Shows the "Pause vorbei" web push and focuses the app when it is tapped. */
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'VIS', body: event.data && event.data.text() } }
  const title = data.title || 'Pause vorbei'
  const options = {
    body: data.body || 'Zeit für den nächsten Satz',
    tag: data.tag || 'rest',
    renotify: true,
    icon: './icon-192-v3.png',
    badge: './icon-192-v3.png',
    data: { url: self.registration.scope },
  }
  event.waitUntil((async () => {
    // the open app already chimes and shows its own banner – don't double up
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.some((c) => c.visibilityState === 'visible')) return
    await self.registration.showNotification(title, options)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = wins.find((c) => 'focus' in c)
    if (open) return open.focus()
    return self.clients.openWindow(event.notification.data && event.notification.data.url || './')
  })())
})
