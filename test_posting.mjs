import { getPublicImageUrl } from './vault-control/server/services/imageHosting.js'
import { postToFacebook, postToLinkedIn, postToInstagram } from './vault-control/server/services/socialMediaService.js'
import { generatePostImage } from './vault-control/server/services/imageGenerator.js'

const TEST_TEXT = 'Youm e Arafa is biggest Blessing of Allah — ' + new Date().toLocaleString()

async function runTests() {
  console.log('\n=== TEST 1: Image Generation ===')
  let imageUrl
  try {
    imageUrl = await generatePostImage('AI automation technology')
    // Verify Pollinations actually gives us bytes
    const { downloadImageBuffer } = await import('./vault-control/server/services/imageHosting.js')
    await downloadImageBuffer(imageUrl, 2)
    console.log('Pollinations image verified OK')
  } catch (e) {
    console.warn('Pollinations failed, using picsum fallback:', e.message)
    imageUrl = 'https://picsum.photos/1080/1080'
  }
  console.log('Image URL:', imageUrl)
  
  console.log('\n=== TEST 2: Image Hosting ===')
  const publicUrl = await getPublicImageUrl(imageUrl, true)
  console.log('Public URL:', publicUrl)
  
  console.log('\n=== TEST 3: Facebook Post ===')
  const fbResult = await postToFacebook(TEST_TEXT, publicUrl || imageUrl)
  console.log('Facebook:', JSON.stringify(fbResult))
  
  console.log('\n=== TEST 4: LinkedIn Post ===')
  let liResult
  try {
    liResult = await postToLinkedIn(TEST_TEXT, publicUrl || imageUrl)
  } catch (e) {
    liResult = { platform: 'linkedin', skipped: true, message: e.message }
  }
  console.log('LinkedIn:', JSON.stringify(liResult))
  
  console.log('\n=== TEST 5: Instagram Post ===')
  let igResult
  try {
    igResult = await postToInstagram(TEST_TEXT, publicUrl || imageUrl)
  } catch (e) {
    igResult = { platform: 'instagram', skipped: true, message: e.message }
  }
  console.log('Instagram:', JSON.stringify(igResult))

  console.log('\n=== ALL TESTS DONE ===')
}

runTests().catch(e => console.error('TEST FAILED:', e))
