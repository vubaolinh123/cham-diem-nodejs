require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { connectDB } = require('./config/database');
const config = require('./config/environment');

// Import middlewares
const {
  securityHeaders,
  generalLimiter,
  sanitizeInput,
} = require('./middlewares/security');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const schoolYearRoutes = require('./routes/schoolYearRoutes');
const violationTypeRoutes = require('./routes/violationTypeRoutes');
const classRoutes = require('./routes/classRoutes');
const studentRoutes = require('./routes/studentRoutes');
const weekRoutes = require('./routes/weekRoutes');
const conductScoreRoutes = require('./routes/conductScoreRoutes');
const academicScoreRoutes = require('./routes/academicScoreRoutes');
const violationLogRoutes = require('./routes/violationLogRoutes');
const weeklySummaryRoutes = require('./routes/weeklySummaryRoutes');
const monthlySummaryRoutes = require('./routes/monthlySummaryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const disciplineGradingRoutes = require('./routes/disciplineGradingRoutes');
const classAcademicGradingRoutes = require('./routes/classAcademicGradingRoutes');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(securityHeaders);
app.use(generalLimiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// CORS middleware
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);

// Input sanitization
app.use(sanitizeInput);

// Logging middleware
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/school-years', schoolYearRoutes);
app.use('/api/violation-types', violationTypeRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/weeks', weekRoutes);
app.use('/api/conduct-scores', conductScoreRoutes);
app.use('/api/academic-scores', academicScoreRoutes);
app.use('/api/violation-logs', violationLogRoutes);
app.use('/api/weekly-summaries', weeklySummaryRoutes);
app.use('/api/monthly-summaries', monthlySummaryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/discipline-grading', disciplineGradingRoutes);
app.use('/api/class-academic-grading', classAcademicGradingRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Chamdiem API Server',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      schoolYears: '/api/school-years',
      violationTypes: '/api/violation-types',
      classes: '/api/classes',
      students: '/api/students',
      weeks: '/api/weeks',
      conductScores: '/api/conduct-scores',
      academicScores: '/api/academic-scores',
      violationLogs: '/api/violation-logs',
      weeklySummaries: '/api/weekly-summaries',
      monthlySummaries: '/api/monthly-summaries',
      reports: '/api/reports',
      dashboard: '/api/dashboard',
      disciplineGrading: '/api/discipline-grading',
      classAcademicGrading: '/api/class-academic-grading',
      health: '/health',
    },
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = config.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Database: ${config.MONGODB_DATABASE}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;

