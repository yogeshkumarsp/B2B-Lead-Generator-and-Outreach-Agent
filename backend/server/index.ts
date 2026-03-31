import './init.js';
import './env.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import leadsRouter from './routes/leads.js';
import campaignsRouter from './routes/campaigns.js';
import authRouter from './routes/auth.js';
import settingsRouter from './routes/settings.js';
import logsRouter from './routes/logs.js';
import adminRouter from './routes/admin.js';
import outreachRouter from './routes/outreach.js';
import dashboardRouter from './routes/dashboard.js';
import aiRouter from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 6001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Monorepo-aware static file path
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
const hasFrontend = fs.existsSync(frontendDistPath);

const allowedOrigins = [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:3001', 'http://127.0.0.1:3001',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [])
];

app.use(cors({
    origin: (origin, callback) => {
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
    res.json({ status: 'ok', timestamp: Date.now(), frontend: hasFrontend });
});

// Serve static files ONLY if they exist
if (hasFrontend) {
    console.log(`[SERVER] Serving frontend from: ${frontendDistPath}`);
    app.use(express.static(frontendDistPath));
} else {
    console.warn(`[SERVER] Frontend dist folder not found at ${frontendDistPath}. API-only mode enabled.`);
}

// Catch-all route for SPA
app.get('/:catchall(.*)', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    
    if (hasFrontend) {
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    } else {
        res.json({ message: 'AutoSDR Backend is running. Frontend not deployed on this instance.' });
    }
});

import { replyDetector } from './services/reply_detector.js';
import { backendAgent } from './services/agent.js';

const server = app.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`✅ AutoSDR Server running on http://127.0.0.1:${PORT}`);

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
