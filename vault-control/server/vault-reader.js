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

    const files = []
    
    // Read files from the main directory
    const readDirectory = (dir, parentSubdir = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        
        if (entry.isDirectory()) {
          // Recursively read subdirectories
          readDirectory(fullPath, parentSubdir ? `${parentSubdir}/${entry.name}` : entry.name)
        } else if (entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')
            let parsed
            try {
              parsed = matter(content)
            } catch (parseErr) {
              // If frontmatter parsing fails, use raw content
              parsed = { data: {}, content: content }
            }
            
            files.push({
              id: entry.name.replace('.md', ''),
              filename: entry.name,
              path: fullPath,
              frontmatter: parsed.data,
              content: parsed.content,
              createdAt: fs.statSync(fullPath).birthtime,
              updatedAt: fs.statSync(fullPath).mtime,
              subdir: parentSubdir,
            })
          } catch (readErr) {
            console.error(`Error reading file ${fullPath}:`, readErr)
          }
        }
      }
    }
    
    readDirectory(dirPath)

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
    
    // Ensure parent directory exists
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    
    fs.writeFileSync(filePath, fileContent, 'utf-8')
    return true
  } catch (err) {
    console.error(`Error writing file ${filePath}:`, err)
    return false
  }
}

export function moveFile(sourcePath, destPath) {
  try {
    // Ensure destination directory exists
    const destDir = path.dirname(destPath)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
    
    if (fs.existsSync(sourcePath)) {
      fs.renameSync(sourcePath, destPath)
      return true
    }
    
    // If exact file doesn't exist, try to find it in subdirectories
    const baseName = path.basename(sourcePath)
    const parentDir = path.dirname(sourcePath)
    
    if (fs.existsSync(parentDir)) {
      const entries = fs.readdirSync(parentDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(parentDir, entry.name, baseName)
          if (fs.existsSync(subPath)) {
            fs.renameSync(subPath, destPath)
            return true
          }
        }
      }
    }
    
    return false
  } catch (err) {
    console.error(`Error moving file from ${sourcePath} to ${destPath}:`, err)
    return false
  }
}

export function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
    
    // Try to find in subdirectories
    const baseName = path.basename(filePath)
    const parentDir = path.dirname(filePath)
    
    if (fs.existsSync(parentDir)) {
      const entries = fs.readdirSync(parentDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(parentDir, entry.name, baseName)
          if (fs.existsSync(subPath)) {
            fs.unlinkSync(subPath)
            return true
          }
        }
      }
    }
    
    return false
  } catch (err) {
    console.error(`Error deleting file ${filePath}:`, err)
    return false
  }
}

export function getVaultPath(...parts) {
  return path.join(VAULT_PATH, ...parts)
}

export function searchVaultFiles(query) {
  const folders = ['Pending_Approval', 'Approved', 'Rejected', 'Emails', 'WhatsApp', 'Social', 'Logs', 'Todos', 'Drafts']
  const results = []
  const q = query.toLowerCase()

  for (const folder of folders) {
    const files = readVaultFiles(folder)
    for (const file of files) {
      const matches = 
        file.filename.toLowerCase().includes(q) ||
        (file.frontmatter.title && file.frontmatter.title.toLowerCase().includes(q)) ||
        (file.frontmatter.subject && file.frontmatter.subject.toLowerCase().includes(q)) ||
        file.content.toLowerCase().includes(q) ||
        (file.frontmatter.from && file.frontmatter.from.toLowerCase().includes(q))

      if (matches) {
        results.push({
          ...file,
          folder,
          matchType: file.frontmatter.title ? 'title' : file.frontmatter.subject ? 'subject' : 'content'
        })
      }
    }
  }
  return results.slice(0, 20) // Limit results
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
