import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import datasetRouter from './routes/datasets.js';
import agentRouter from './routes/agents.js';
import mutationRouter from './routes/mutations.js';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.use('/api/datasets', datasetRouter);
app.use('/api/agents', agentRouter);
app.use('/api/mutations', mutationRouter);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json({ message });
});
