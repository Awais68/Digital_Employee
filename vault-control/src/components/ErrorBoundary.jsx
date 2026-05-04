import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[200px] p-6">
          <div className="max-w-md w-full card p-6 border dark:border-red-500/30 border-red-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg dark:bg-red-500/20 bg-red-50">
                <AlertTriangle size={24} className="dark:text-red-400 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold dark:text-[#E0E0E6] text-gray-900">Something went wrong</h3>
                <p className="text-xs dark:text-[#7A7A85] text-gray-500">
                  {this.props.fallbackTitle || 'Component Error'}
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="mb-4 p-3 rounded-lg dark:bg-[#1A1A24] bg-gray-50 font-mono text-xs overflow-auto max-h-32">
                <p className="dark:text-red-400 text-red-600 font-bold mb-1">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                <p className="dark:text-[#7A7A85] text-gray-500">
                  {this.state.error.stack?.split('\n').slice(0, 3).join('\n')}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm dark:bg-[#00FF88] dark:text-[#0A0A0F] bg-blue-500 text-white"
              >
                <RefreshCw size={16} />
                Try Again
              </button>
              {this.props.onReset && (
                <button
                  onClick={this.props.onReset}
                  className="px-4 py-2 rounded-lg font-medium text-sm dark:bg-[#1A1A24] dark:text-[#E0E0E6] bg-gray-100 text-gray-700"
                >
                  Go to Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
