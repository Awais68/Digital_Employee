import express from 'express'
import { readVaultFiles, getVaultPath, writeFile, deleteFile } from '../vault-reader.js'

const router = express.Router()

// GET all drafts
router.get('/', (req, res) => {
  const files = readVaultFiles('Drafts')

  if (files.length === 0) {
    return res.json([
      {
        id: 'draft-email-1',
        type: 'email',
        subject: 'Reply to customer inquiry',
        preview: 'Thank you for reaching out...',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'draft-post-1',
        type: 'post',
        title: 'Product Launch Announcement',
        preview: 'Excited to announce our latest product...',
        platforms: ['linkedin', 'twitter'],
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
    ])
  }

  const drafts = files.map(file => ({
    id: file.id,
    ...file.frontmatter,
    preview: file.content.substring(0, 100),
  }))

  res.json(drafts)
})

// GET single draft
router.get('/:id', (req, res) => {
  const files = readVaultFiles('Drafts')
  const draft = files.find(f => f.id === req.params.id)

  if (!draft) {
    return res.status(404).json({ error: 'Draft not found' })
  }

  res.json({
    id: draft.id,
    ...draft.frontmatter,
    content: draft.content,
  })
})

// CREATE new draft
router.post('/', (req, res) => {
  const { type, title, content, ...meta } = req.body
  const id = `draft-${Date.now()}`
  const filePath = getVaultPath('Drafts', `${id}.md`)

  const frontmatter = {
    type,
    title,
    ...meta,
    createdAt: new Date().toISOString(),
  }

  writeFile(filePath, frontmatter, content)
  res.json({ success: true, id, message: 'Draft created' })
})

// UPDATE draft
router.put('/:id', (req, res) => {
  const { id } = req.params
  const { title, content, ...meta } = req.body
  const filePath = getVaultPath('Drafts', `${id}.md`)

  const frontmatter = {
    ...meta,
    title,
    updatedAt: new Date().toISOString(),
  }

  writeFile(filePath, frontmatter, content)
  res.json({ success: true, message: 'Draft updated' })
})

// DELETE draft
router.delete('/:id', (req, res) => {
  const { id } = req.params
  const filePath = getVaultPath('Drafts', `${id}.md`)

  deleteFile(filePath)
  res.json({ success: true, message: 'Draft deleted' })
})

export default router
