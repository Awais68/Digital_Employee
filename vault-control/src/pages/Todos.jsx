import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Trash2, CheckCircle2, Circle, Edit2, Search, Filter,
  Calendar, GripVertical, Loader2, AlertCircle, Save, X, ChevronUp, ChevronDown,
  Square, CheckSquare,
} from 'lucide-react'
import axios from 'axios'
import { useToast } from '../context/ToastContext'

// Priority helpers (can be memoized if needed, but they're simple expressions)
const getPriorityColor = (priority) => {
  switch (priority) {
    case 'high': return 'dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-600'
    case 'medium': return 'dark:bg-yellow-500/20 dark:text-yellow-400 bg-yellow-50 text-yellow-600'
    case 'low': return 'dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-600'
    default: return ''
  }
}

const getPriorityWeight = (priority) => {
  switch (priority) {
    case 'high': return 3
    case 'medium': return 2
    case 'low': return 1
    default: return 0
  }
}

export default function Todos() {
  const [todos, setTodos] = useState([])
  const [newTodo, setNewTodo] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [newDueDate, setNewDueDate] = useState('')
  const [filter, setFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [sortBy, setSortBy] = useState('priority') // 'priority', 'date', 'dueDate', 'title'
  const [selectedForBulk, setSelectedForBulk] = useState(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [showBulkPriority, setShowBulkPriority] = useState(false)
  const { success, error: toastError } = useToast()

  useEffect(() => {
    fetchTodos()
  }, [])

  const fetchTodos = async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/todos')
      setTodos(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error('Failed to fetch todos:', err)
      setTodos([])
    } finally {
      setLoading(false)
    }
  }

  const addTodo = async () => {
    if (!newTodo.trim()) return

    setSaving(true)
    try {
      const res = await axios.post('/api/todos', {
        title: newTodo,
        priority: newPriority,
        dueDate: newDueDate || null,
      })
      setTodos([res.data, ...todos])
      setNewTodo('')
      setNewPriority('medium')
      setNewDueDate('')
      success('Task added')
    } catch (err) {
      console.error('Failed to add todo:', err)
      // Optimistic add for file-based mode
      const todo = {
        id: `todo-${Date.now()}`,
        title: newTodo,
        completed: false,
        priority: newPriority,
        dueDate: newDueDate || null,
        date: new Date().toISOString().split('T')[0],
        order: 0,
      }
      setTodos([todo, ...todos])
      setNewTodo('')
      setNewPriority('medium')
      setNewDueDate('')
    } finally {
      setSaving(false)
    }
  }

  const toggleTodo = async (id) => {
    const todo = todos.find(t => t.id === id)
    const newCompleted = !todo.completed
    
    // Optimistic update
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: newCompleted } : t))
    
    try {
      await axios.patch(`/api/todos/${id}`, { completed: newCompleted })
    } catch (err) {
      // Rollback on error
      setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !newCompleted } : t))
      toastError('Failed to update task')
    }
  }

  const deleteTodo = async (id) => {
    const backup = todos.find(t => t.id === id)
    setTodos(prev => prev.filter(t => t.id !== id))
    
    try {
      await axios.delete(`/api/todos/${id}`)
      success('Task deleted')
    } catch (err) {
      setTodos(prev => [...prev, backup])
      toastError('Failed to delete task')
    }
  }

  const startEdit = (todo) => {
    setEditingId(todo.id)
    setEditValue(todo.title)
    setEditPriority(todo.priority)
    setEditDueDate(todo.dueDate || '')
  }

  const saveEdit = async (id) => {
    if (!editValue.trim()) return
    
    setSaving(true)
    try {
      await axios.put(`/api/todos/${id}`, {
        title: editValue,
        priority: editPriority,
        dueDate: editDueDate || null,
      })
      setTodos(prev => prev.map(t =>
        t.id === id ? { ...t, title: editValue, priority: editPriority, dueDate: editDueDate } : t
      ))
      setEditingId(null)
      success('Task updated')
    } catch (err) {
      toastError('Failed to update task')
    } finally {
      setSaving(false)
    }
  }

  // Drag to reorder
  const handleDragStart = (id) => {
    setDragId(id)
  }

  const handleDragOver = (e, targetId) => {
    e.preventDefault()
    if (dragId === targetId) return
    
    setTodos(prev => {
      const newTodos = [...prev]
      const dragIndex = newTodos.findIndex(t => t.id === dragId)
      const targetIndex = newTodos.findIndex(t => t.id === targetId)
      if (dragIndex === -1 || targetIndex === -1) return prev
      
      const [dragged] = newTodos.splice(dragIndex, 1)
      newTodos.splice(targetIndex, 0, dragged)
      return newTodos
    })
  }

  const handleDragEnd = () => {
    setDragId(null)
    // TODO: Persist new order to API
  }

  const toggleBulkSelect = (id) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllTodos = () => {
    if (selectedForBulk.size === filteredTodos.length) {
      setSelectedForBulk(new Set())
    } else {
      setSelectedForBulk(new Set(filteredTodos.map(t => t.id)))
    }
  }

  const handleBulkComplete = async () => {
    if (selectedForBulk.size === 0) return
    
    setBulkActionLoading(true)
    const selectedIds = Array.from(selectedForBulk)
    
    setTodos(prev => prev.map(t => selectedIds.includes(t.id) ? { ...t, completed: true } : t))
    
    try {
      await Promise.all(
        selectedIds.map(id => axios.patch(`/api/todos/${id}`, { completed: true }))
      )
      success(`${selectedIds.length} task(s) completed`)
      setSelectedForBulk(new Set())
    } catch (err) {
      console.error('Bulk complete failed:', err)
      toastError('Failed to complete tasks')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedForBulk.size === 0) return
    
    setBulkActionLoading(true)
    const selectedIds = Array.from(selectedForBulk)
    const backup = todos.filter(t => selectedIds.includes(t.id))
    
    setTodos(prev => prev.filter(t => !selectedIds.includes(t.id)))
    
    try {
      await Promise.all(
        selectedIds.map(id => axios.delete(`/api/todos/${id}`))
      )
      success(`${selectedIds.length} task(s) deleted`)
      setSelectedForBulk(new Set())
    } catch (err) {
      console.error('Bulk delete failed:', err)
      setTodos(prev => [...prev, ...backup])
      toastError('Failed to delete tasks')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkPriority = async (priority) => {
    if (selectedForBulk.size === 0) return
    
    setBulkActionLoading(true)
    const selectedIds = Array.from(selectedForBulk)
    
    setTodos(prev => {
      if (!Array.isArray(prev)) return prev
      return prev.map(t => selectedIds.includes(t.id) ? { ...t, priority } : t)
    })
    
    try {
      await Promise.all(
        selectedIds.map(id => axios.put(`/api/todos/${id}`, { priority }))
      )
      success(`${selectedIds.length} task(s) updated to ${priority} priority`)
      setSelectedForBulk(new Set())
      setShowBulkPriority(false)
    } catch (err) {
      console.error('Bulk priority failed:', err)
      toastError('Failed to update priority')
    } finally {
      setBulkActionLoading(false)
    }
  }

  // Apply filters and sorting (memoized with useMemo - rerender-derived-state-no-effect)
  const { filteredTodos, completedCount, pendingCount } = useMemo(() => {
    let filtered = todos
      .filter(todo => {
        if (filter === 'completed') return todo.completed
        if (filter === 'pending') return !todo.completed
        return true
      })
      .filter(todo => {
        if (priorityFilter === 'all') return true
        return todo.priority === priorityFilter
      })
      .filter(todo => {
        if (!searchQuery.trim()) return true
        return todo.title.toLowerCase().includes(searchQuery.toLowerCase())
      })

    // Sort
    filtered.sort((a, b) => {
      // Completed items go to bottom
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      
      switch (sortBy) {
        case 'priority':
          return getPriorityWeight(b.priority) - getPriorityWeight(a.priority)
        case 'dueDate':
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return new Date(a.dueDate) - new Date(b.dueDate)
        case 'date':
          return new Date(b.date || 0) - new Date(a.date || 0)
        case 'title':
          return a.title.localeCompare(b.title)
        default:
          return (b.order || 0) - (a.order || 0)
      }
    })

    const completedCount = todos.filter(t => t.completed).length
    const pendingCount = todos.length - completedCount

    return { filteredTodos: filtered, completedCount, pendingCount }
  }, [todos, filter, priorityFilter, searchQuery, sortBy])

  const isOverdue = (dueDate) => {
    if (!dueDate) return false
    return new Date(dueDate) < new Date(new Date().toISOString().split('T')[0])
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'TOTAL TASKS', value: todos.length, color: 'dark:text-[#00FF88] text-blue-600' },
          { label: 'COMPLETED', value: completedCount, color: 'dark:text-[#10B981] text-green-600' },
          { label: 'PENDING', value: pendingCount, color: 'dark:text-[#FFB800] text-orange-600' },
          { label: 'OVERDUE', value: todos.filter(t => isOverdue(t.dueDate) && !t.completed).length, color: 'dark:text-[#EF4444] text-red-600' },
        ].map(stat => (
          <div key={stat.label} className="card p-4">
            <p className="text-xs dark:text-[#7A7A85] text-gray-500 font-mono">{stat.label}</p>
            <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Add New Todo */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
          ADD NEW TASK
        </h2>
        <div className="flex flex-col md:flex-row gap-3 mb-3">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder="What needs to be done?"
            className="flex-1 px-4 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-gray-900"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            className="px-4 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50"
          >
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="px-4 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50"
          />
          <button
            onClick={addTodo}
            disabled={saving || !newTodo.trim()}
            className="flex items-center justify-center gap-2 px-6 py-2 rounded-lg font-medium dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Add
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-2.5 dark:text-[#7A7A85] text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-4 py-2 rounded-lg dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-50 text-sm"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-1">
            {['all', 'pending', 'completed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  filter === f
                    ? 'dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white'
                    : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-600'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <div className="flex gap-1">
            {['all', 'high', 'medium', 'low'].map(p => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  priorityFilter === p
                    ? getPriorityColor(p)
                    : 'dark:bg-[#1A1A24] dark:text-[#7A7A85] bg-gray-100 text-gray-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 rounded text-xs dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100"
          >
            <option value="priority">Sort: Priority</option>
            <option value="dueDate">Sort: Due Date</option>
            <option value="date">Sort: Created</option>
            <option value="title">Sort: Title</option>
          </select>
        </div>

        <div className="text-xs dark:text-[#7A7A85] text-gray-500 mt-2">
          {filteredTodos.length} of {todos.length} tasks
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedForBulk.size > 0 && (
        <div className="card p-4 border-[#00FF88]/30 dark:bg-[#00FF88]/5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold dark:text-[#00FF88]">{selectedForBulk.size} selected</span>
            <button
              onClick={() => setSelectedForBulk(new Set())}
              className="text-xs dark:text-[#7A7A85] hover:dark:text-[#E0E0E6]"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleBulkComplete}
              disabled={bulkActionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium dark:bg-green-500/20 dark:text-green-400 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={14} />
              Complete
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkActionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium dark:bg-red-500/20 dark:text-red-400 disabled:opacity-50 transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
            <div className="relative">
              <button
                onClick={() => setShowBulkPriority(!showBulkPriority)}
                disabled={bulkActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium dark:bg-[#1A1A24] dark:text-[#E0E0E6] disabled:opacity-50 transition-colors"
              >
                <Filter size={14} />
                Set Priority
              </button>
              {showBulkPriority && (
                <div className="absolute top-full left-0 mt-1 card rounded-lg shadow-xl z-10 w-32">
                  {['high', 'medium', 'low'].map(p => (
                    <button
                      key={p}
                      onClick={() => handleBulkPriority(p)}
                      className={`w-full text-left px-3 py-2 text-xs font-medium capitalize first:rounded-t-lg last:rounded-b-lg transition-colors hover:dark:bg-[#1A1A24] ${getPriorityColor(p)}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Todo List - content-visibility for rendering performance (rendering-content-visibility) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="animate-spin text-[#00FF88]" size={24} />
          <p className="text-xs dark:text-[#7A7A85] mt-2">Loading tasks...</p>
        </div>
      ) : filteredTodos.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="dark:text-[#7A7A85] text-gray-500 font-mono">No tasks found</p>
          {searchQuery && (
            <p className="text-xs dark:text-[#7A7A85] mt-2">Try adjusting your search</p>
          )}
        </div>
      ) : (
        <>
          {/* Select All */}
          <div className="flex items-center justify-between px-4 py-2">
            <button
              onClick={selectAllTodos}
              className="flex items-center gap-2 text-xs dark:text-[#7A7A85] hover:dark:text-[#E0E0E6] transition-colors"
            >
              {selectedForBulk.size === filteredTodos.length ? (
                <CheckSquare size={14} className="dark:text-[#00FF88]" />
              ) : (
                <Square size={14} />
              )}
              {selectedForBulk.size === filteredTodos.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="space-y-2 content-visibility-auto" style={{ containIntrinsicSize: '0 3000px' }}>
          {filteredTodos.map((todo, index) => (
            <div
              key={todo.id}
              draggable
              onDragStart={() => handleDragStart(todo.id)}
              onDragOver={(e) => handleDragOver(e, todo.id)}
              onDragEnd={handleDragEnd}
              className={`card p-4 flex items-center gap-3 transition-all ${
                dragId === todo.id ? 'dark:bg-[#00FF88]/5 border-[#00FF88] opacity-50' : 'hover:dark:bg-[#1A1A24]/50'
              } ${todo.completed ? 'opacity-60' : ''} ${isOverdue(todo.dueDate) && !todo.completed ? 'dark:border-red-500/30' : ''} ${selectedForBulk.has(todo.id) ? 'dark:bg-[#00FF88]/5' : ''}`}
            >
              {/* Bulk Select Checkbox */}
              <button
                onClick={() => toggleBulkSelect(todo.id)}
                className="flex-shrink-0"
              >
                {selectedForBulk.has(todo.id) ? (
                  <CheckSquare size={16} className="dark:text-[#00FF88]" />
                ) : (
                  <Square size={16} className="dark:text-[#7A7A85] opacity-0 hover:opacity-100 transition-opacity" />
                )}
              </button>
              {/* Drag Handle */}
              <button className="flex-shrink-0 dark:text-[#7A7A85] text-gray-400 cursor-grab active:cursor-grabbing">
                <GripVertical size={16} />
              </button>

              {/* Checkbox */}
              <button
                onClick={() => toggleTodo(todo.id)}
                className={`flex-shrink-0 ${todo.completed ? 'dark:text-[#00FF88] text-green-600' : 'dark:text-[#7A7A85] text-gray-400'}`}
              >
                {todo.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {editingId === todo.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full px-2 py-1 rounded dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        className="px-2 py-1 rounded text-xs dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="px-2 py-1 rounded text-xs dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100"
                      />
                    </div>
                  </div>
                ) : (
                  <p className={`text-sm font-medium dark:text-[#E0E0E6] text-gray-900 ${todo.completed ? 'line-through dark:text-[#7A7A85] text-gray-500' : ''}`}>
                    {todo.title}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize ${getPriorityColor(editingId === todo.id ? editPriority : todo.priority)}`}>
                    {editingId === todo.id ? editPriority : todo.priority}
                  </span>
                  {todo.dueDate ? (
                    <span className={`text-[10px] flex items-center gap-1 ${isOverdue(todo.dueDate) && !todo.completed ? 'text-red-500 font-bold' : 'dark:text-[#7A7A85] text-gray-500'}`}>
                      <Calendar size={10} />
                      {isOverdue(todo.dueDate) && !todo.completed ? 'OVERDUE: ' : ''}{todo.dueDate}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-1">
                {editingId === todo.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(todo.id)}
                      disabled={saving}
                      className="p-1.5 rounded dark:bg-[#00FF88]/20 dark:text-[#00FF88] hover:dark:bg-[#00FF88]/30 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded dark:bg-[#1A1A24] dark:text-[#7A7A85] hover:dark:bg-[#2A2A3A] transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(todo)}
                      className="p-1.5 rounded dark:text-[#7A7A85] dark:hover:text-[#E0E0E6] text-gray-400 hover:text-blue-500 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="p-1.5 rounded dark:text-[#7A7A85] dark:hover:text-red-400 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          </div>
        </>
      )}
    </div>
  )
}
