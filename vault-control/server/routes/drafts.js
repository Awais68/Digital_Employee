import express from 'express'
import { readVaultFiles, getVaultPath, writeFile, deleteFile } from '../vault-reader.js'

const router = express.Router()

// GET all drafts
router.get('/', (req, res) => {
  try {
    const files = readVaultFiles('Pending_Approval')
    
    // Filter for draft-type files
    const drafts = files
      .filter(f => 
        f.frontmatter.type === 'draft' || 
        f.filename.startsWith('DRAFT_') || 
        f.filename.toLowerCase().includes('draft')
      )
      .map(file => ({
        id: file.id,
        type: file.frontmatter.type || 'draft',
        title: file.frontmatter.title || file.frontmatter.subject || file.filename.replace('.md', '').replace(/_/g, ' '),
        preview: file.content.substring(0, 150),
        content: file.content,
        createdAt: file.createdAt.toISOString(),
        updatedAt: file.updatedAt.toISOString(),
        ...file.frontmatter,
      }))

    res.json(drafts)
  } catch (err) {
    console.error('Error fetching drafts:', err)
    res.status(500).json({ error: 'Failed to fetch drafts', message: err.message })
  }
})

// GET single draft
router.get('/:id', (req, res) => {
  try {
    const files = readVaultFiles('Pending_Approval')
    const draft = files.find(f => f.id === req.params.id)

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' })
    }

    res.json({
      id: draft.id,
      ...draft.frontmatter,
      content: draft.content,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('Error fetching draft:', err)
    res.status(500).json({ error: 'Failed to fetch draft', message: err.message })
  }
})

// CREATE new draft
router.post('/', (req, res) => {
  try {
    const { type, title, content, ...meta } = req.body
    const timestamp = new Date().toISOString().replace(/[:.]/g, '')
    const id = `DRAFT_${timestamp}`
    const filePath = getVaultPath('Pending_Approval', `${id}.md`)

    const frontmatter = {
      type: type || 'draft',
      title,
      ...meta,
      createdAt: new Date().toISOString(),
    }

    const success = writeFile(filePath, frontmatter, content)
    if (success) {
      res.json({ success: true, id, message: 'Draft created' })
    } else {
      res.status(500).json({ success: false, message: 'Failed to create draft' })
    }
  } catch (err) {
    console.error('Error creating draft:', err)
    res.status(500).json({ error: 'Failed to create draft', message: err.message })
  }
})

// UPDATE draft
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { title, content, ...meta } = req.body
    const filePath = getVaultPath('Pending_Approval', `${id}.md`)

    const frontmatter = {
      ...meta,
      title,
      updatedAt: new Date().toISOString(),
    }

    const success = writeFile(filePath, frontmatter, content)
    if (success) {
      res.json({ success: true, message: 'Draft updated' })
    } else {
      res.status(500).json({ success: false, message: 'Failed to update draft' })
    }
  } catch (err) {
    console.error('Error updating draft:', err)
    res.status(500).json({ error: 'Failed to update draft', message: err.message })
  }
})

// DELETE draft
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const filePath = getVaultPath('Pending_Approval', `${id}.md`)

    const success = deleteFile(filePath)
    if (success) {
      res.json({ success: true, message: 'Draft deleted' })
    } else {
      res.status(404).json({ success: false, message: 'Draft not found' })
    }
  } catch (err) {
    console.error('Error deleting draft:', err)
    res.status(500).json({ error: 'Failed to delete draft', message: err.message })
  }
})

export default router
