import { generatePostImage } from './imageGenerator.js'

const content = {
  headline: 'AI Agents Are Reshaping How Teams Ship Software',
  bullets: [
    'Autonomous agents now handle multi-step engineering tasks end to end',
    'Human review shifts from writing code to steering and verifying it',
    'Early adopters report 30-40% faster delivery on routine work',
  ],
  stats: [],
  cta: 'How is your team putting AI agents to work today?',
}

const url = await generatePostImage('AI agents in software', 'professional', '4:5', content)
console.log('RENDERED:', url)
