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

  it('imports a CSV and profiles its rows and columns', async () => {
    const response = await request(app)
      .post('/api/datasets/import-csv?name=Customer%20orders&file_name=orders.csv')
      .set('Content-Type', 'text/csv')
      .send('order_id,customer,amount\nA-1,"Ada, Lovelace",1250\nA-2,Grace,980\n');

    expect(response.status).toBe(201);
    expect(response.body.source_type).toBe('CSV');
    expect(response.body.file_name).toBe('orders.csv');
    expect(response.body.row_count).toBe(2);
    expect(response.body.column_count).toBe(3);
    expect(response.body.records[0]).toEqual({
      order_id: 'A-1',
      customer: 'Ada, Lovelace',
      amount: 1250
    });
  });

  it('rejects malformed CSV rows instead of silently dropping them', async () => {
    const response = await request(app)
      .post('/api/datasets/import-csv?name=Broken%20orders')
      .set('Content-Type', 'text/csv')
      .send('order_id,amount\nA-1,1250,unexpected\n');

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('expected 2');
  });
});
