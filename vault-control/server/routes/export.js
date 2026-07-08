import express from 'express'
import { getVaultPath } from '../vault-reader.js'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import os from 'os'
import { requireAdmin } from '../database/auth.js'

const router = express.Router()

// GET list of all vault folders
router.get('/folders', (req, res) => {
  try {
    const vaultPath = getVaultPath()
    if (!fs.existsSync(vaultPath)) {
      return res.json({ folders: [] })
    }
    
    const entries = fs.readdirSync(vaultPath, { withFileTypes: true })
    const folders = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(folder => ({
        name: folder.name,
        path: path.join(vaultPath, folder.name),
      }))
    
    res.json({ folders })
  } catch (err) {
    console.error('Error listing folders:', err)
    res.status(500).json({ error: 'Failed to list folders', message: err.message })
  }
})

// POST export vault as zip
router.post('/export', requireAdmin, (req, res) => {
  try {
    const { folders } = req.body || {}
    const vaultPath = getVaultPath()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-export-'))
    const exportDir = path.join(tmpDir, 'vault-backup')
    const zipPath = `${tmpDir}/vault-backup.zip`

    // Copy selected folders (or all)
    const entries = fs.readdirSync(vaultPath, { withFileTypes: true })
    const toExport = folders || entries.filter(e => e.isDirectory()).map(e => e.name)

    toExport.forEach(folderName => {
      const src = path.join(vaultPath, folderName)
      const dest = path.join(exportDir, folderName)
      if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true })
      }
    })

    // Create zip
    execSync(`cd "${tmpDir}" && zip -r "vault-backup.zip" "vault-backup"`)

    // Set headers and send
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename=vault-backup.zip')
    res.setHeader('X-Backup-Date', new Date().toISOString())
    res.sendFile(zipPath, {}, (err) => {
      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true })
      if (err) console.error('Export error:', err)
    })
  } catch (err) {
    console.error('Export error:', err)
    res.status(500).json({ error: 'Export failed', message: err.message })
  }
})

// POST import vault from zip
router.post('/import', requireAdmin, (req, res) => {
  try {
    const { zipData, mode = 'merge' } = req.body
    if (!zipData) {
      return res.status(400).json({ error: 'No zip data provided' })
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-import-'))
    const zipPath = path.join(tmpDir, 'upload.zip')

    // Decode base64 and write zip
    fs.writeFileSync(zipPath, Buffer.from(zipData, 'base64'))

    // Extract
    execSync(`cd "${tmpDir}" && unzip -o "upload.zip"`)

    const vaultPath = getVaultPath()
    const extractedDir = path.join(tmpDir, 'vault-backup')

    if (!fs.existsSync(extractedDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return res.status(400).json({ error: 'Invalid backup format' })
    }

    // Import folders
    const importedFolders = []
    const entries = fs.readdirSync(extractedDir, { withFileTypes: true })
    
    entries.forEach(folder => {
      if (folder.isDirectory()) {
        const src = path.join(extractedDir, folder.name)
        const dest = path.join(vaultPath, folder.name)
        
        if (mode === 'replace' && fs.existsSync(dest)) {
          fs.rmSync(dest, { recursive: true, force: true })
        }
        
        fs.cpSync(src, dest, { recursive: true })
        importedFolders.push(folder.name)
      }
    })

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })

    // Broadcast update
    if (global.broadcast) {
      global.broadcast({ type: 'vault_changed', action: 'import', folders: importedFolders })
    }

    res.json({ 
      success: true, 
      message: `Imported ${importedFolders.length} folders`, 
      folders: importedFolders 
    })
  } catch (err) {
    console.error('Import error:', err)
    res.status(500).json({ error: 'Import failed', message: err.message })
  }
})

// GET generate report
router.get('/report', (req, res) => {
  try {
    const vaultPath = getVaultPath()
    const entries = fs.readdirSync(vaultPath, { withFileTypes: true })
    
    const report = {
      generated: new Date().toISOString(),
      vaultPath,
      folders: [],
      totalFiles: 0,
      totalSize: 0,
    }

    entries.forEach(folder => {
      if (folder.isDirectory() && !folder.name.startsWith('.')) {
        const folderPath = path.join(vaultPath, folder.name)
        let fileCount = 0
        let folderSize = 0

        const countFiles = (dir) => {
          const items = fs.readdirSync(dir, { withFileTypes: true })
          items.forEach(item => {
            const itemPath = path.join(dir, item.name)
            if (item.isDirectory()) {
              countFiles(itemPath)
            } else {
              fileCount++
              folderSize += fs.statSync(itemPath).size
            }
          })
        }

        countFiles(folderPath)
        report.folders.push({
          name: folder.name,
          fileCount,
          size: folderSize,
          sizeFormatted: `${(folderSize / 1024).toFixed(1)} KB`,
        })
        report.totalFiles += fileCount
        report.totalSize += folderSize
      }
    })

    report.totalSizeFormatted = `${(report.totalSize / 1024).toFixed(1)} KB`
    res.json(report)
  } catch (err) {
    console.error('Report error:', err)
    res.status(500).json({ error: 'Report generation failed', message: err.message })
  }
})

export default router
