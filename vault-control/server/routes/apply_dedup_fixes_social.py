path = "social.js"

with open(path, "r") as f:
    content = f.read()

errors = []

anchor1 = "const router = express.Router()"
count1 = content.count(anchor1)
if count1 != 1:
    errors.append(f"FIX 1: expected 1 occurrence of anchor, found {count1}")
else:
    new1 = anchor1 + "\n\n// ---- Publish dedup guard (in-memory, single PM2 fork instance) ----\nconst recentPublishes = new Map()\nconst DEDUP_WINDOW_MS = 60000\n\nfunction checkDuplicatePublish(key) {\n  const now = Date.now()\n  const last = recentPublishes.get(key)\n  if (last && (now - last) < DEDUP_WINDOW_MS) {\n    return true\n  }\n  recentPublishes.set(key, now)\n  return false\n}"
    content = content.replace(anchor1, new1, 1)

anchor2 = "console.log('[Publish] Found file at:', sourcePath)\n    const donePath = getVaultPath('Done')"
count2 = content.count(anchor2)
if count2 != 1:
    errors.append(f"FIX 2: expected 1 occurrence of anchor, found {count2}")
else:
    new2 = "console.log('[Publish] Found file at:', sourcePath)\n\n    if (checkDuplicatePublish(sourcePath)) {\n      console.warn('[Publish] Duplicate publish blocked for:', sourcePath)\n      return res.status(429).json({\n        success: false,\n        message: 'Duplicate publish request blocked - this post was already published/attempted in the last 60 seconds.'\n      })\n    }\n\n    const donePath = getVaultPath('Done')"
    content = content.replace(anchor2, new2, 1)

anchor3 = "const postPath = getVaultPath('Pending_Approval', post.filename)\n        const fileContent = fs.readFileSync(postPath, 'utf-8')"
count3 = content.count(anchor3)
if count3 != 1:
    errors.append(f"FIX 3: expected 1 occurrence of anchor, found {count3}")
else:
    new3 = "const postPath = getVaultPath('Pending_Approval', post.filename)\n\n        if (checkDuplicatePublish(postPath)) {\n          console.warn('[Auto-Publish] Duplicate publish blocked for:', postPath)\n          publishResults.push({\n            filename: post.filename,\n            success: false,\n            message: 'Duplicate publish blocked (already attempted within 60s)'\n          })\n          continue\n        }\n\n        const fileContent = fs.readFileSync(postPath, 'utf-8')"
    content = content.replace(anchor3, new3, 1)

if errors:
    print("ABORTED - no changes written. Issues:")
    for e in errors:
        print(" -", e)
else:
    with open(path, "w") as f:
        f.write(content)
    print("SUCCESS: all 3 fixes applied")
