import dotenv from 'dotenv'
dotenv.config({ path: '/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee/vault-control/.env' })
const { generatePostImage } = await import('./server/services/imageGenerator.js')
try {
  const url = await generatePostImage('AI automation for business', 'professional', '4:5', 'AI agents automate 80% of repetitive back-office work. Invoice processing went from 3 days to 20 minutes. Our team cut cost by 62%.')
  console.log('RESULT:', url)
} catch (e) { console.error('THREW:', e.message) }
