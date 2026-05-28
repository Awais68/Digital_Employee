const store = new Map()

export function cacheGet(key) {
  const item = store.get(key)
  if (!item) return null
  if (Date.now() > item.expires) {
    store.delete(key)
    return null
  }
  return item.value
}

export function cacheSet(key, value, ttlSeconds = 30) {
  store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 })
}

export function cacheDel(key) {
  store.delete(key)
}

export function cacheClear() {
  store.clear()
}
