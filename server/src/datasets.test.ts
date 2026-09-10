import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import db from './db.js';
import { app } from './app.js';

beforeEach(() => {
  db.prepare('DELETE FROM datasets').run();
});

describe('dataset API', () => {
  it('creates a dataset and returns it', async () => {
    const response = await request(app)
      .post('/api/datasets')
      .send({
        name: 'Demo sales dataset',
        description: 'Customer orders',
        source_type: 'Manual',
        records: [
          { order_id: 1, customer: 'Ada', status: 'Active' },
          { order_id: 2, customer: 'Linus', status: 'Pending' }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Demo sales dataset');
    expect(response.body.row_count).toBe(2);
    expect(response.body.column_count).toBe(3);
  });

  it('updates and deletes a dataset', async () => {
    const created = await request(app)
      .post('/api/datasets')
      .send({
        name: 'Example dataset',
        description: 'Original description',
        source_type: 'CSV',
        records: [{ product: 'Widget', quantity: 3 }]
      });

    const updated = await request(app)
      .put(`/api/datasets/${created.body.id}`)
      .send({ description: 'Updated description' });

    expect(updated.status).toBe(200);
    expect(updated.body.description).toBe('Updated description');

    const deleted = await request(app).delete(`/api/datasets/${created.body.id}`);
    expect(deleted.status).toBe(204);

    const fetched = await request(app).get(`/api/datasets/${created.body.id}`);
    expect(fetched.status).toBe(404);
  });
});
