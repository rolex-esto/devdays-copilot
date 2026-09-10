import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import datasetRouter from './routes/datasets.js';
import agentRouter from './routes/agents.js';
import mutationRouter from './routes/mutations.js';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
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
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'CSV exceeds the maximum upload size.' });
  }

  return res.status(500).json({ message: 'The request could not be processed.' });
});
