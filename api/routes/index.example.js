// Example index.js - Complete integration with all 4 route modules
// Deploy to: /home/ubuntu/vutler/app/index.js in vutler-api container

const express = require('express');
const app = express();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// CORS (optional - adjust origins for production)
const cors = require('cors');
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Import route modules
const emailRoutes = require('./routes/email');
const tasksRoutes = require('./routes/tasks');
const calendarRoutes = require('./routes/calendar');
const driveRoutes = require('./routes/drive');

// Mount API routes
app.use('/api/v1/email', emailRoutes);
app.use('/api/v1/tasks', tasksRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/drive', driveRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API info endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    name: 'Vutler API',
    version: '1.0.0',
    endpoints: {
      email: {
        inbox: 'GET /api/v1/email/inbox',
        single: 'GET /api/v1/email/:uid',
        send: 'POST /api/v1/email/send'
      },
      tasks: {
        list: 'GET /api/v1/tasks',
        create: 'POST /api/v1/tasks',
        update: 'PUT /api/v1/tasks/:id',
        delete: 'DELETE /api/v1/tasks/:id'
      },
      calendar: {
        list: 'GET /api/v1/calendar/events',
        create: 'POST /api/v1/calendar/events',
        update: 'PUT /api/v1/calendar/events/:id',
        delete: 'DELETE /api/v1/calendar/events/:id'
      },
      drive: {
        list: 'GET /api/v1/drive/files',
        metadata: 'GET /api/v1/drive/files/:id',
        download: 'GET /api/v1/drive/files/:id/download',
        upload: 'POST /api/v1/drive/files/upload',
        delete: 'DELETE /api/v1/drive/files/:id'
      }
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================================
// SERVER
// ============================================================================

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Vutler API Server`);
  console.log('='.repeat(60));
  console.log(`📍 Listening on: http://${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📧 Email: alex@vutler.com (IMAP/SMTP ready)`);
  console.log(`🗄️  PostgreSQL: vutler-postgres:5432`);
  console.log(`📁 kDrive: ID ${process.env.KDRIVE_ID || '2021270'}`);
  console.log('='.repeat(60));
  console.log('Available endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /api/v1');
  console.log('  GET  /api/v1/email/inbox');
  console.log('  POST /api/v1/email/send');
  console.log('  GET  /api/v1/tasks');
  console.log('  GET  /api/v1/calendar/events');
  console.log('  GET  /api/v1/drive/files');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
