import { useState, useEffect } from 'react'
import {
  FileText, FolderOpen, Plus, Save, Trash2, Edit2, Eye,
  ChevronRight, Loader2, AlertCircle, CheckCircle2, Search, X,
} from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

const vaultFolders = [
  'Pending_Approval',
  'Approved',
  'Rejected',
  'Emails',
  'WhatsApp',
  'Social',
  'Logs',
  'Todos',
  'Drafts',
]

export default function VaultEditor() {
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [frontmatter, setFrontmatter] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredFiles, setFilteredFiles] = useState([])
  const { success, error: toastError } = useToast()

  useEffect(() => {
    if (selectedFolder) {
      fetchFiles(selectedFolder)
    }
  }, [selectedFolder])

  useEffect(() => {
    if (searchQuery.length > 0) {
      setFilteredFiles(
        files.filter(f =>
          f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (f.frontmatter?.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (f.frontmatter?.subject || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    } else {
      setFilteredFiles(files)
    }
  }, [searchQuery, files])

  const fetchFiles = async (folder) => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`/api/vault/${folder}`)
      setFiles(res.data)
      setSelectedFile(null)
      setEditMode(false)
    } catch (err) {
      console.error('Failed to fetch files:', err)
      setError('Failed to load files from ' + folder)
    } finally {
      setLoading(false)
    }
  }

  const openFile = async (file) => {
    try {
      const res = await axios.get(`/api/vault/${file.folder}/${file.id}`)
      setSelectedFile(res.data)
      setFileContent(res.data.content || '')
      setFrontmatter(res.data.frontmatter || {})
      setEditMode(false)
    } catch (err) {
      console.error('Failed to open file:', err)
      toastError('Failed to open file')
    }
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setSaving(true)
    try {
      await axios.put(`/api/vault/${selectedFile.folder}/${selectedFile.id}`, {
        frontmatter,
        content: fileContent,
      })
      success('File saved successfully')
      setEditMode(false)
      fetchFiles(selectedFile.folder)
    } catch (err) {
      console.error('Failed to save file:', err)
      toastError('Failed to save file')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedFile) return
    if (!confirm(`Delete ${selectedFile.id}.md?`)) return

    try {
      await axios.delete(`/api/vault/${selectedFile.folder}/${selectedFile.id}`)
      success('File deleted')
      setSelectedFile(null)
      fetchFiles(selectedFile.folder)
    } catch (err) {
      console.error('Failed to delete file:', err)
      toastError('Failed to delete file')
    }
  }

  const handleCreateFile = async () => {
    if (!selectedFolder || !newFileName.trim()) return

    const id = newFileName.replace(/\.md$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
    setSaving(true)
    try {
      await axios.post(`/api/vault/${selectedFolder}`, {
        id,
        frontmatter: { title: id, createdAt: new Date().toISOString() },
        content: '',
      })
      success('File created')
      setNewFileName('')
      setShowNewFile(false)
      fetchFiles(selectedFolder)
    } catch (err) {
      console.error('Failed to create file:', err)
      toastError('Failed to create file')
    } finally {
      setSaving(false)
    }
  }

  const frontmatterToText = () => {
    return Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n')
  }

  const parseFrontmatter = (text) => {
    const lines = text.split('\n')
    const result = {}
    lines.forEach(line => {
      const match = line.match(/^([^:]+):\s*(.+)$/)
      if (match) {
        result[match[1].trim()] = match[2].trim()
      }
    })
    return result
  }

  const displayFiles = searchQuery ? filteredFiles : files

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-140px)]">
      {/* Left: Folder Tree */}
      <div className="col-span-3 border-r dark:border-[#1A1A24] pr-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black dark:text-[#7A7A85] uppercase tracking-widest font-mono flex items-center gap-2">
            <FolderOpen size={14} />
            VAULT
          </h3>
          <span className="text-xs dark:text-[#7A7A85] text-gray-500">{files.length} files</span>
        </div>

        {/* Folder List */}
        <div className="space-y-1 overflow-y-auto flex-1">
          {vaultFolders.map(folder => (
            <div key={folder}>
              <button
                onClick={() => setSelectedFolder(folder)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors
                  ${selectedFolder === folder
                    ? 'dark:bg-[#00FF88]/10 dark:text-[#00FF88] bg-blue-50 text-blue-600 font-bold'
                    : 'dark:text-[#7A7A85] text-gray-600 hover:dark:bg-[#1A1A24] hover:bg-gray-50'
                  }
                `}
              >
                <ChevronRight size={14} className={`transition-transform ${selectedFolder === folder ? 'rotate-90' : ''}`} />
                <FolderOpen size={14} />
                {folder.replace(/_/g, ' ')}
              </button>

              {selectedFolder === folder && (
                <div className="ml-4 mt-1 space-y-1">
                  {loading ? (
                    <div className="py-2 text-center">
                      <Loader2 size={14} className="animate-spin dark:text-[#7A7A85] mx-auto" />
                    </div>
                  ) : files.length > 0 ? (
                    <>
                      {/* Search */}
                      <div className="relative mb-2">
                        <Search size={14} className="absolute left-2 top-2 dark:text-[#7A7A85] text-gray-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter files..."
                          className="w-full pl-7 pr-3 py-1.5 rounded text-xs dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-2 dark:text-[#7A7A85]"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      {displayFiles.map(file => (
                        <button
                          key={file.id}
                          onClick={() => openFile(file)}
                          className={`
                            w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors
                            ${selectedFile?.id === file.id
                              ? 'dark:bg-[#1A1A24] dark:text-[#E0E0E6] text-gray-900 font-medium'
                              : 'dark:text-[#7A7A85] text-gray-500 hover:dark:bg-[#1A1A24]/50'
                            }
                          `}
                        >
                          <FileText size={12} />
                          <span className="truncate">{file.frontmatter?.title || file.id}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs dark:text-[#7A7A85] text-gray-500 py-2">No files</p>
                  )}

                  {/* New File */}
                  {showNewFile ? (
                    <div className="flex items-center gap-1 mt-2">
                      <input
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="filename.md"
                        className="flex-1 px-2 py-1.5 rounded text-xs dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                      />
                      <button
                        onClick={handleCreateFile}
                        disabled={saving || !newFileName.trim()}
                        className="p-1.5 rounded dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-green-500 text-white disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      </button>
                      <button
                        onClick={() => { setShowNewFile(false); setNewFileName('') }}
                        className="p-1.5 rounded dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewFile(true)}
                      className="flex items-center gap-1 text-xs dark:text-[#00FF88] text-green-600 hover:underline mt-2"
                    >
                      <Plus size={12} />
                      New file
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right: File Editor */}
      <div className="col-span-9 flex flex-col">
        {selectedFile ? (
          <>
            {/* File Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-[#1A1A24]">
              <div>
                <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900">
                  {selectedFile.frontmatter?.title || selectedFile.id}
                </h3>
                <p className="text-xs dark:text-[#7A7A85] text-gray-500">
                  {selectedFile.folder}/{selectedFile.id}.md
                </p>
              </div>
              <div className="flex items-center gap-2">
                {editMode ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-sm dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-green-500 text-white disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditMode(false)
                        setFileContent(selectedFile.content || '')
                        setFrontmatter(selectedFile.frontmatter || {})
                      }}
                      className="px-3 py-1.5 rounded text-sm dark:text-[#7A7A85] text-gray-500 hover:dark:bg-[#1A1A24]"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditMode(true)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-sm dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-700 hover:dark:bg-[#2A2A3A]"
                    >
                      <Edit2 size={14} />
                      Edit
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-2 rounded dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-600 hover:dark:bg-red-500/30"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Frontmatter */}
            {editMode ? (
              <div className="p-4 border-b dark:border-[#1A1A24] bg-[#0D0D14]">
                <h4 className="text-xs font-black dark:text-[#7A7A85] uppercase tracking-widest mb-2">FRONTMATTER</h4>
                <textarea
                  value={frontmatterToText()}
                  onChange={(e) => setFrontmatter(parseFrontmatter(e.target.value))}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900 text-xs font-mono resize-none"
                />
              </div>
            ) : (
              Object.keys(selectedFile.frontmatter || {}).length > 0 && (
                <div className="p-4 border-b dark:border-[#1A1A24]">
                  <h4 className="text-xs font-black dark:text-[#7A7A85] uppercase tracking-widest mb-2">METADATA</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selectedFile.frontmatter).map(([key, value]) => (
                      <div key={key} className="px-2 py-1 rounded dark:bg-[#1A1A24] bg-gray-50 text-xs">
                        <span className="dark:text-[#7A7A85] text-gray-500 font-semibold">{key}:</span>
                        <span className="dark:text-[#E0E0E6] text-gray-900 ml-1">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {editMode ? (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full h-full px-4 py-4 dark:bg-[#0A0A0F] bg-white dark:text-[#E0E0E6] text-gray-900 text-sm font-mono resize-none outline-none"
                  placeholder="Start typing..."
                />
              ) : (
                <div className="p-6">
                  <pre className="text-sm dark:text-[#E0E0E6] whitespace-pre-wrap leading-relaxed font-mono">
                    {selectedFile.content || 'Empty file'}
                  </pre>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <FileText size={64} className="dark:text-[#1A1A24]" />
            <p className="text-[10px] font-mono dark:text-[#7A7A85] uppercase tracking-widest">Select a file or create a new one</p>
          </div>
        )}
      </div>
    </div>
  )
}
