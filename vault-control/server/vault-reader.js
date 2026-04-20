import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const VAULT_PATH = process.env.VAULT_PATH || './AI_Employee_Vault'

export function readVaultFiles(subdir = '', pattern = '*.md') {
  try {
    const dirPath = path.join(VAULT_PATH, subdir)
    if (!fs.existsSync(dirPath)) {
      return []
    }

    const files = fs.readdirSync(dirPath)
      .filter(file => file.endsWith('.md'))
      .map(file => {
        const filePath = path.join(dirPath, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const { data, content: body } = matter(content)
        
        return {
          id: file.replace('.md', ''),
          filename: file,
          path: filePath,
          frontmatter: data,
          content: body,
          createdAt: fs.statSync(filePath).birthtime,
          updatedAt: fs.statSync(filePath).mtime,
        }
      })

    return files.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (err) {
    console.error(`Error reading vault files from ${subdir}:`, err)
    return []
  }
}

export function readFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data, content: body } = matter(content)
    return { frontmatter: data, content: body }
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err)
    return null
  }
}

export function writeFile(filePath, frontmatter, content) {
  try {
    const yamlContent = Object.entries(frontmatter)
      .map(([key, val]) => `${key}: ${JSON.stringify(val)}`)
      .join('\n')
    
    const fileContent = `---\n${yamlContent}\n---\n\n${content}`
    fs.writeFileSync(filePath, fileContent, 'utf-8')
    return true
  } catch (err) {
    console.error(`Error writing file ${filePath}:`, err)
    return false
  }
}

export function moveFile(sourcePath, destPath) {
  try {
    const destDir = path.dirname(destPath)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
    fs.renameSync(sourcePath, destPath)
    return true
  } catch (err) {
    console.error(`Error moving file from ${sourcePath} to ${destPath}:`, err)
    return false
  }
}

export function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch (err) {
    console.error(`Error deleting file ${filePath}:`, err)
    return false
  }
}

export function getVaultPath(...parts) {
  return path.join(VAULT_PATH, ...parts)
}

// Mock data generators for empty vault
export function generateMockApprovals() {
  return [
    {
      id: 'pay-001',
      type: 'PAYMENT',
      title: 'Invoice #INV-2024-001',
      description: 'AWS Services - March 2024',
      amount: 1250.00,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000),
    },
    {
      id: 'email-001',
      type: 'EMAIL',
      title: 'Reply to: "Project Timeline"',
      description: 'Customer inquiry about project deadline',
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    {
      id: 'post-001',
      type: 'POST',
      title: 'LinkedIn: Q1 Results Announcement',
      description: 'Quarterly earnings post for LinkedIn',
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  ]
}

export function generateMockEmails() {
  return [
    {
      id: 'email-1',
      from: 'customer@example.com',
      subject: 'Question about pricing',
      preview: 'Hi, I wanted to ask about your enterprise pricing...',
      time: new Date(Date.now() - 15 * 60 * 1000),
      priority: 'high',
      type: 'email',
    },
    {
      id: 'email-2',
      from: 'team@company.com',
      subject: 'Weekly standup notes',
      preview: 'Here are this week\'s standup notes...',
      time: new Date(Date.now() - 2 * 60 * 60 * 1000),
      priority: 'medium',
      type: 'email',
    },
    {
      id: 'email-3',
      from: 'support@service.io',
      subject: 'Monthly report',
      preview: 'Your monthly service report is ready...',
      time: new Date(Date.now() - 24 * 60 * 60 * 1000),
      priority: 'low',
      type: 'email',
    },
  ]
}

export function generateMockWhatsApp() {
  return [
    {
      id: 'wa-1',
      sender: 'John Doe',
      preview: 'Hey, did you see the latest updates?',
      time: new Date(Date.now() - 10 * 60 * 1000),
      unread: true,
    },
    {
      id: 'wa-2',
      sender: 'Sarah',
      preview: 'Can we schedule a meeting for tomorrow?',
      time: new Date(Date.now() - 1 * 60 * 60 * 1000),
      unread: false,
    },
  ]
}

export function generateMockLogs() {
  const actions = ['email_send', 'payment_process', 'post_published', 'file_synced']
  const statuses = ['success', 'failed', 'pending']
  const services = ['Gmail', 'Odoo', 'LinkedIn', 'Twitter', 'WhatsApp']

  return Array.from({ length: 50 }, (_, i) => ({
    id: `log-${i}`,
    timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
    service: services[Math.floor(Math.random() * services.length)],
    action: actions[Math.floor(Math.random() * actions.length)],
    target: 'user@example.com',
    status: statuses[Math.floor(Math.random() * statuses.length)],
    message: 'Operation completed',
  })).sort((a, b) => b.timestamp - a.timestamp)
}
