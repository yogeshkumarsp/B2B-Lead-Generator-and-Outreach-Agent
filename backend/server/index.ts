console.log('[SERVER] Initializing Boot sequence...');
process.on('uncaughtException', (err) => {
    console.error('[SERVER] FATAL CRASH (uncaught):', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('[SERVER] FATAL CRASH (rejection):', reason);
    process.exit(1);
});

import './env';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import leadsRouter from './routes/leads';
import campaignsRouter from './routes/campaigns';
import authRouter from './routes/auth';
import settingsRouter from './routes/settings';
import logsRouter from './routes/logs';
import adminRouter from './routes/admin';
import outreachRouter from './routes/outreach';
import dashboardRouter from './routes/dashboard';
import aiRouter from './routes/ai';


process.on('uncaughtException', (err) => {
    console.error('[SERVER] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[SERVER] Unhandled Rejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 6001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.join(__dirname, '../../frontend/dist');

const allowedOrigins = [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:3001', 'http://127.0.0.1:3001',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [])
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express.json());

app.use((req, _res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/outreach', outreachRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/ai', aiRouter);

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Serve static files from the React app
app.use(express.static(frontendDistPath));

// Catch-all route for SPA
app.get('*path', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
});

import { replyDetector } from './services/reply_detector';
import { backendAgent } from './services/agent';

const server = app.listen(PORT as number, '0.0.0.0', async () => {
    console.log(`✅ AutoSDR Server running on http://127.0.0.1:${PORT}`);

    // Start automated reply detection and SDR agent
    try {
        await replyDetector.start();
        backendAgent.start();
    } catch (err) {
        console.error('[SERVER] Failed to start background services:', err);
    }
});

server.on('error', (e) => {
    console.error('Server error:', e);
});

export default app;
