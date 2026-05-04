// Standardized error response format
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

// Error handler middleware
export function errorHandler(err, req, res, next) {
  // Log the error
  console.error(`[Error] ${err.message}`, {
    stack: err.isOperational ? undefined : err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  // Don't leak internal errors in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    success: false,
    message: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
}

// 404 handler
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
}

// Async error wrapper - catches errors in async route handlers
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
