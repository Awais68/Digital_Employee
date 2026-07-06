import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_DURATION = 4000;

let toastCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = TOAST_DURATION) => {
    const id = `toast-${++toastCounter}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message) => addToast(message, 'success'), [addToast]);
  const error = useCallback((message) => addToast(message, 'error'), [addToast]);
  const warning = useCallback((message) => addToast(message, 'warning'), [addToast]);
  const info = useCallback((message) => addToast(message, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, removeToast }) {
  if (toasts.length === 0) return null;

  const icons = {
    success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/50' },
    error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/50' },
    warning: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/50' },
    info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/50' },
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map(toast => {
        const { icon: Icon, color, bg } = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 p-4 rounded-lg border ${bg} backdrop-blur-sm animate-slide-in shadow-lg`}
          >
            <Icon size={18} className={color} />
            <p className="flex-1 text-sm dark:text-[#E0E0E6] text-gray-900">{toast.message}</p>
            <button onClick={() => removeToast(toast.id)} className="dark:text-[#7A7A85] hover:dark:text-[#E0E0E6]">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
