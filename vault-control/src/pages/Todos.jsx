import { useState } from 'react'
import { Plus, Trash2, CheckCircle2, Circle, Edit2, Search, Filter } from 'lucide-react'

const mockTodos = [
  { id: 1, title: 'Update LinkedIn profile banner', completed: true, priority: 'high', date: '2024-03-06' },
  { id: 2, title: 'Review pending email approvals', completed: false, priority: 'high', date: '2024-03-06' },
  { id: 3, title: 'Schedule weekly social media posts', completed: false, priority: 'medium', date: '2024-03-07' },
  { id: 4, title: 'Check invoices in accounting', completed: true, priority: 'medium', date: '2024-03-05' },
  { id: 5, title: 'Generate marketing content', completed: false, priority: 'high', date: '2024-03-06' },
  { id: 6, title: 'Verify WhatsApp integrations', completed: false, priority: 'low', date: '2024-03-08' },
  { id: 7, title: 'Update company handbook', completed: true, priority: 'low', date: '2024-03-04' },
  { id: 8, title: 'Review cloud system status', completed: false, priority: 'medium', date: '2024-03-06' },
  { id: 9, title: 'Backup important documents', completed: false, priority: 'high', date: '2024-03-06' },
  { id: 10, title: 'Schedule team meeting', completed: true, priority: 'low', date: '2024-03-03' },
  { id: 11, title: 'Process new customer leads', completed: false, priority: 'high', date: '2024-03-06' },
  { id: 12, title: 'Update API documentation', completed: false, priority: 'medium', date: '2024-03-09' },
]

const getPriorityColor = (priority) => {
  switch (priority) {
    case 'high':
      return 'dark:bg-red-500/20 dark:text-red-400 bg-red-50 text-red-600'
    case 'medium':
      return 'dark:bg-yellow-500/20 dark:text-yellow-400 bg-yellow-50 text-yellow-600'
    case 'low':
      return 'dark:bg-green-500/20 dark:text-green-400 bg-green-50 text-green-600'
    default:
      return ''
  }
}

export default function Todos() {
  const [todos, setTodos] = useState(mockTodos)
  const [newTodo, setNewTodo] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [filter, setFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  const addTodo = async () => {
    if (!newTodo.trim()) return

    try {
      const todo = {
        id: Math.max(...todos.map(t => t.id), 0) + 1,
        title: newTodo,
        completed: false,
        priority: newPriority,
        date: new Date().toISOString().split('T')[0],
      }
      // Add to beginning (newer tasks first)
      setTodos([todo, ...todos])
      setNewTodo('')
      setNewPriority('medium')
    } catch (err) {
      console.error('Failed to add todo:', err)
    }
  }

  const toggleTodo = (id) => {
    setTodos(todos.map(t =>
      t.id === id ? { ...t, completed: !t.completed } : t
    ))
  }

  const deleteTodo = (id) => {
    setTodos(todos.filter(t => t.id !== id))
  }

  const startEdit = (todo) => {
    setEditingId(todo.id)
    setEditValue(todo.title)
  }

  const saveEdit = (id) => {
    setTodos(todos.map(t =>
      t.id === id ? { ...t, title: editValue } : t
    ))
    setEditingId(null)
  }

  // Apply filters and search
  const filteredTodos = todos
    .filter(todo => {
      // Status filter
      if (filter === 'completed') return todo.completed
      if (filter === 'pending') return !todo.completed
      return true
    })
    .filter(todo => {
      // Priority filter
      if (priorityFilter === 'all') return true
      return todo.priority === priorityFilter
    })
    .filter(todo => {
      // Search filter
      if (!searchQuery.trim()) return true
      return todo.title.toLowerCase().includes(searchQuery.toLowerCase())
    })

  const completedCount = todos.filter(t => t.completed).length
  const pendingCount = todos.length - completedCount

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6">
          <p className="text-sm dark:text-[#B0C4FF] text-gray-500 font-mono">TOTAL TASKS</p>
          <p className="text-4xl font-bold dark:text-[#00FF88] text-blue-600 mt-2">{todos.length}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm dark:text-[#B0C4FF] text-gray-500 font-mono">COMPLETED</p>
          <p className="text-4xl font-bold dark:text-[#00FF88] text-blue-600 mt-2">{completedCount}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm dark:text-[#B0C4FF] text-gray-500 font-mono">PENDING</p>
          <p className="text-4xl font-bold dark:text-orange-500 text-orange-600 mt-2">{pendingCount}</p>
        </div>
      </div>

      {/* Add New Todo */}
      <div className="card p-6">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 mb-4 font-mono">
          ✨ ADD NEW TASK
        </h2>
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTodo()}
            placeholder="What needs to be done?"
            className="flex-1 px-4 py-2 rounded-lg dark:bg-[#2A3E5F] dark:text-[#E0E0E6] bg-gray-50 text-gray-900 placeholder-gray-500 dark:placeholder-[#B0C4FF]"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            className="px-4 py-2 rounded-lg dark:bg-[#2A3E5F] dark:text-[#E0E0E6] bg-gray-50 text-gray-900"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button
            onClick={addTodo}
            className="flex items-center gap-2 px-6 py-2 rounded-lg font-medium dark:bg-[#00FF88] dark:text-[#0F1A2E] bg-blue-500 text-white hover:opacity-90"
          >
            <Plus size={18} />
            Add
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-bold dark:text-[#E0E0E6] text-gray-900 font-mono">
          🔍 SEARCH & FILTERS
        </h2>

        {/* Search Box */}
        <div className="relative">
          <Search size={18} className="absolute left-3 top-3 dark:text-[#B0C4FF] text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title..."
            className="w-full pl-10 pr-4 py-2 rounded-lg dark:bg-[#2A3E5F] dark:text-[#E0E0E6] dark:border-[#3A5E7F] bg-gray-50 text-gray-900 border border-gray-300 placeholder-gray-500 dark:placeholder-[#B0C4FF]"
          />
        </div>

        {/* Status Filter */}
        <div>
          <p className="text-sm font-semibold dark:text-[#B0C4FF] text-gray-700 mb-2">Status:</p>
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'completed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === f
                    ? 'dark:bg-[#00FF88] dark:text-[#0F1A2E] bg-blue-500 text-white'
                    : 'dark:bg-[#2A3E5F] dark:text-[#B0C4FF] bg-gray-100 text-gray-600 hover:dark:bg-[#3A5E7F]'
                }`}
              >
                {f === 'all' ? '📋 All' : f === 'pending' ? '⏳ Pending' : '✅ Completed'}
              </button>
            ))}
          </div>
        </div>

        {/* Priority Filter */}
        <div>
          <p className="text-sm font-semibold dark:text-[#B0C4FF] text-gray-700 mb-2">Priority:</p>
          <div className="flex gap-2 flex-wrap">
            {['all', 'high', 'medium', 'low'].map(p => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  priorityFilter === p
                    ? p === 'high'
                      ? 'dark:bg-red-500 dark:text-white bg-red-500 text-white'
                      : p === 'medium'
                      ? 'dark:bg-yellow-500 dark:text-white bg-yellow-500 text-white'
                      : p === 'low'
                      ? 'dark:bg-green-500 dark:text-white bg-green-500 text-white'
                      : 'dark:bg-[#00FF88] dark:text-[#0F1A2E] bg-blue-500 text-white'
                    : 'dark:bg-[#2A3E5F] dark:text-[#B0C4FF] bg-gray-100 text-gray-600 hover:dark:bg-[#3A5E7F]'
                }`}
              >
                {p === 'all' ? '🎯 All' : p === 'high' ? '🔴 High' : p === 'medium' ? '🟡 Medium' : '🟢 Low'}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div className="text-xs dark:text-[#B0C4FF] text-gray-500">
          Showing {filteredTodos.length} of {todos.length} tasks
        </div>
      </div>

      {/* Todo List */}
      <div className="space-y-3">
        {filteredTodos.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="dark:text-[#B0C4FF] text-gray-500 font-mono">No tasks found</p>
            {searchQuery && (
              <p className="text-xs dark:text-[#7A7A85] text-gray-400 mt-2">Try adjusting your search criteria</p>
            )}
          </div>
        ) : (
          filteredTodos.map(todo => (
            <div
              key={todo.id}
              className="card p-4 flex items-center gap-4 hover:dark:bg-[#2A3E5F]/80 hover:bg-gray-50/80 transition-all"
            >
              <button
                onClick={() => toggleTodo(todo.id)}
                className="flex-shrink-0 dark:text-[#00FF88] dark:hover:text-[#00FF88] text-blue-500 hover:text-blue-600"
              >
                {todo.completed ? (
                  <CheckCircle2 size={24} fill="currentColor" />
                ) : (
                  <Circle size={24} />
                )}
              </button>

              <div className="flex-1 min-w-0">
                {editingId === todo.id ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => saveEdit(todo.id)}
                    onKeyPress={(e) => e.key === 'Enter' && saveEdit(todo.id)}
                    autoFocus
                    className="w-full px-2 py-1 rounded dark:bg-[#2A3E5F] dark:text-[#E0E0E6] bg-gray-100 text-gray-900"
                  />
                ) : (
                  <p
                    className={`font-medium dark:text-[#E0E0E6] text-gray-900 ${
                      todo.completed ? 'line-through dark:text-[#B0C4FF] text-gray-500' : ''
                    }`}
                  >
                    {todo.title}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-xs px-2 py-1 rounded font-semibold capitalize ${getPriorityColor(todo.priority)}`}>
                    {todo.priority}
                  </span>
                  <span className="text-xs dark:text-[#B0C4FF] text-gray-500">{todo.date}</span>
                </div>
              </div>

              <div className="flex-shrink-0 flex items-center gap-2">
                <button
                  onClick={() => startEdit(todo)}
                  className="dark:text-[#B0C4FF] dark:hover:text-[#00FF88] text-gray-500 hover:text-blue-500 transition-colors"
                >
                  <Edit2 size={18} />
                </button>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="dark:text-[#B0C4FF] dark:hover:text-red-400 text-gray-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
