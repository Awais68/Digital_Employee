// test_image_hosting.js
// Run: node test_image_hosting.js

import { getPublicImageUrl } from './vault-control/server/services/imageHosting.js'

const TEST_IMAGE_URL = 'https://picsum.photos/1080/1080'

console.log('='.repeat(50))
console.log('IMAGE HOSTING FALLBACK TEST')
console.log('='.repeat(50))
console.log('SERVER_PUBLIC_URL:', process.env.SERVER_PUBLIC_URL || 'NOT SET')
console.log('CLOUDINARY_URL:   ', process.env.CLOUDINARY_URL    ? 'SET' : 'NOT SET')
console.log('IMGUR_CLIENT_ID:  ', process.env.IMGUR_CLIENT_ID   || 'NOT USED (removed)')
console.log('='.repeat(50))

try {
  const result = await getPublicImageUrl(TEST_IMAGE_URL, true)
  if (result) {
    console.log('\nFINAL URL:', result)
    console.log('\nTest this URL in browser — image should open!')
  } else {
    console.log('\nALL METHODS FAILED — check .env values')
  }
} catch (e) {
  console.error('Test crashed:', e)
}
