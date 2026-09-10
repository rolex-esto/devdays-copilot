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

  it('imports a dirty-cafe-sized CSV and persists it', async () => {
    const rows = Array.from({ length: 750 }, (_, index) => (
      `${index + 1},${index % 4 + 1},${(index % 17 + 1) * 5}.00,${index % 2 ? 'Card' : 'Cash'}`
    ));
    const csv = `Transaction ID,Quantity,Price Per Unit,Payment Method\n${rows.join('\n')}\n`;

    const response = await request(app)
      .post('/api/datasets/import-csv?name=Dirty%20Cafe%20Sales&file_name=dirty_cafe_sales.csv')
      .set('Content-Type', 'text/csv')
      .send(csv);

    expect(response.status).toBe(201);
    expect(response.body.row_count).toBe(750);

    const persisted = await request(app).get(`/api/datasets/${response.body.id}`);
    expect(persisted.status).toBe(200);
    expect(persisted.body.records).toHaveLength(750);
  });

  it('rejects malformed CSV rows instead of silently dropping them', async () => {
    const response = await request(app)
      .post('/api/datasets/import-csv?name=Broken%20orders')
      .set('Content-Type', 'text/csv')
      .send('order_id,amount\nA-1,1250,unexpected\n');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('CSV could not be parsed.');
  });

  it('rejects a CSV larger than the upload limit', async () => {
    const oversizedCsv = `name\n${'x'.repeat(4 * 1024 * 1024)}\n`;

    const response = await request(app)
      .post('/api/datasets/import-csv?name=Oversized')
      .set('Content-Type', 'text/csv')
      .send(oversizedCsv);

    expect(response.status).toBe(413);
    expect(response.body.message).toBe('CSV exceeds the maximum upload size.');
  });

  it('persists a small CSV import and returns it from the dataset API', async () => {
    const response = await request(app)
      .post('/api/datasets/import-csv?name=Small%20CSV')
      .set('Content-Type', 'text/csv')
      .send('name,score\nAda,10\nGrace,9\n');

    expect(response.status).toBe(201);
    const persisted = await request(app).get(`/api/datasets/${response.body.id}`);
    expect(persisted.status).toBe(200);
    expect(persisted.body.name).toBe('Small CSV');
    expect(persisted.body.records).toEqual([
      { name: 'Ada', score: 10 },
      { name: 'Grace', score: 9 }
    ]);
  });

  it('returns an explainable quality report for imported data', async () => {
    const created = await request(app)
      .post('/api/datasets/import-csv?name=Dirty%20Cafe&file_name=cafe.csv')
      .set('Content-Type', 'text/csv')
      .send('Transaction ID,Quantity,Price Per Unit,Payment Method\n1,2,5.00,Cash\n1,,ERROR,UNKNOWN\n3,-2,100.00,Card\n');

    const beforeAnalysis = await request(app).get(`/api/datasets/${created.body.id}/quality`);
    expect(beforeAnalysis.body.analysis_status).toBe('NOT_ANALYZED');

    const report = await request(app).post(`/api/datasets/${created.body.id}/quality`);

    expect(report.status).toBe(200);
    expect(report.body.summary.rows).toBe(3);
    expect(report.body.summary.columns).toBe(4);
    expect(report.body.summary.missing_values).toBeGreaterThan(0);
    expect(report.body.summary.duplicate_rows).toBe(0);
    expect(report.body.issues.length).toBeGreaterThan(0);
    expect(report.body.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Quantity', inferred_type: 'number' })
    ]));
  });

  it('keeps the completed score and marks it stale after a record changes', async () => {
    const created = await request(app)
      .post('/api/datasets')
      .send({ name: 'Scored data', records: [{ id: 1, amount: 10 }, { id: 2, amount: 20 }] });

    const analyzed = await request(app).post(`/api/datasets/${created.body.id}/quality`);
    expect(analyzed.body.analysis_status).toBe('COMPLETED');
    expect(analyzed.body.score).toBe(100);

    const updated = await request(app)
      .put(`/api/datasets/${created.body.id}/records/0`)
      .send({ id: 1, amount: 'not-a-number' });
    expect(updated.body.analysis_status).toBe('STALE');

    const stale = await request(app).get(`/api/datasets/${created.body.id}/quality`);
    expect(stale.body.analysis_status).toBe('STALE');
    expect(stale.body.score).toBe(100);
  });

  it('updates one stored record without replacing the dataset', async () => {
    const created = await request(app)
      .post('/api/datasets')
      .send({ name: 'Editable data', records: [{ amount: 'ERROR', status: 'Open' }] });

    const response = await request(app)
      .put(`/api/datasets/${created.body.id}/records/0`)
      .send({ amount: '12.50', status: 'Open' });

    expect(response.status).toBe(200);
    expect(response.body.records[0]).toEqual({ amount: '12.50', status: 'Open' });
    expect(response.body.row_count).toBe(1);
  });

  it('does not score an empty dataset as excellent', async () => {
    const created = await request(app)
      .post('/api/datasets')
      .send({ name: 'Empty data', records: [] });

    const report = await request(app).post(`/api/datasets/${created.body.id}/quality`);

    expect(report.status).toBe(200);
    expect(report.body.analysis_status).toBe('EMPTY');
    expect(report.body.score).toBeNull();
    expect(report.body.label).toBe('No data');
  });
});
