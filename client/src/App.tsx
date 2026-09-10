import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createDataset, deleteDataset, fetchDatasets, updateDataset } from './api';
import type { Dataset, DatasetSourceType } from './types';

const emptyForm = {
  name: '',
  description: '',
  source_type: 'Manual' as DatasetSourceType,
  file_name: ''
};

function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedId) ?? null,
    [datasets, selectedId]
  );

  const loadDatasets = useCallback(async () => {
    try {
      const items = await fetchDatasets();
      setDatasets(items);
      setSelectedId((current) => current ?? items[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load datasets.');
    }
  }, []);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (!selectedDataset) {
      setForm(emptyForm);
      return;
    }

    setForm({
      name: selectedDataset.name,
      description: selectedDataset.description,
      source_type: selectedDataset.source_type,
      file_name: selectedDataset.file_name ?? ''
    });
  }, [selectedDataset]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setStatus('');

    try {
      const dataset = await createDataset({
        name: form.name,
        description: form.description,
        source_type: form.source_type,
        file_name: form.file_name || null,
        records: [
          { order_id: 'A-1001', customer_name: 'Ada', status: 'Active' },
          { order_id: 'A-1002', customer_name: 'Grace', status: 'Pending' }
        ]
      });

      setDatasets((current) => [dataset, ...current]);
      setSelectedId(dataset.id);
      setForm(emptyForm);
      setStatus('Dataset created successfully.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create dataset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDataset) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setStatus('');

    try {
      const dataset = await updateDataset(selectedDataset.id, {
        name: form.name,
        description: form.description,
        source_type: form.source_type,
        file_name: form.file_name || null
      });

      setDatasets((current) =>
        current.map((item) => (item.id === dataset.id ? dataset : item))
      );
      setStatus('Dataset updated successfully.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to update dataset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete this dataset? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      await deleteDataset(id);
      setDatasets((current) => current.filter((dataset) => dataset.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
      }
      setStatus('Dataset deleted.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to delete dataset.');
    }
  };

  const totalRows = datasets.reduce((sum, dataset) => sum + dataset.row_count, 0);
  const totalColumns = datasets.reduce((sum, dataset) => sum + dataset.column_count, 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Data quality + analytics</p>
          <h1>DataPulse</h1>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar panel">
          <div className="panel-header">
            <h2>Datasets</h2>
            <span>{datasets.length}</span>
          </div>

          <ul className="dataset-list">
            {datasets.map((dataset) => (
              <li key={dataset.id}>
                <button
                  type="button"
                  className={dataset.id === selectedId ? 'dataset-item active' : 'dataset-item'}
                  onClick={() => setSelectedId(dataset.id)}
                >
                  <strong>{dataset.name}</strong>
                  <small>{dataset.source_type}</small>
                  <span>{dataset.row_count} rows</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="content">
          <form className="panel" onSubmit={handleCreate}>
            <div className="panel-header">
              <h2>Create dataset</h2>
            </div>

            <div className="field-grid">
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="E-commerce sales"
                  required
                />
              </label>

              <label>
                Source type
                <select
                  value={form.source_type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, source_type: event.target.value as DatasetSourceType }))
                  }
                >
                  <option value="Manual">Manual</option>
                  <option value="CSV">CSV</option>
                  <option value="Generated Sample">Generated Sample</option>
                </select>
              </label>
            </div>

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={4}
                placeholder="Short description of the dataset"
              />
            </label>

            <label>
              File name
              <input
                value={form.file_name}
                onChange={(event) => setForm((current) => ({ ...current, file_name: event.target.value }))}
                placeholder="orders.csv"
              />
            </label>

            <div className="button-row">
              <button type="submit" disabled={isSubmitting || !form.name.trim()}>
                {isSubmitting ? 'Saving...' : 'Create dataset'}
              </button>
            </div>

            {status ? <p className="status success">{status}</p> : null}
            {error ? <p className="status error">{error}</p> : null}
          </form>

          {selectedDataset ? (
            <form className="panel details-panel" onSubmit={handleUpdate}>
              <div className="panel-header">
                <div>
                  <h2>{selectedDataset.name}</h2>
                  <p>{selectedDataset.description || 'No description provided.'}</p>
                </div>
                <button type="button" className="danger" onClick={() => handleDelete(selectedDataset.id)}>
                  Delete
                </button>
              </div>

              <div className="stats-grid">
                <div>
                  <label>Rows</label>
                  <strong>{selectedDataset.row_count}</strong>
                </div>
                <div>
                  <label>Columns</label>
                  <strong>{selectedDataset.column_count}</strong>
                </div>
                <div>
                  <label>Source</label>
                  <strong>{selectedDataset.source_type}</strong>
                </div>
                <div>
                  <label>Updated</label>
                  <strong>{new Date(selectedDataset.updated_at).toLocaleDateString()}</strong>
                </div>
              </div>

              <div className="field-grid">
                <label>
                  Dataset name
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>

                <label>
                  Source type
                  <select
                    value={form.source_type}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, source_type: event.target.value as DatasetSourceType }))
                    }
                  >
                    <option value="Manual">Manual</option>
                    <option value="CSV">CSV</option>
                    <option value="Generated Sample">Generated Sample</option>
                  </select>
                </label>
              </div>

              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={4}
                />
              </label>

              <label>
                File name
                <input
                  value={form.file_name}
                  onChange={(event) => setForm((current) => ({ ...current, file_name: event.target.value }))}
                />
              </label>

              <div className="button-row">
                <button type="submit" disabled={isSubmitting || !form.name.trim()}>
                  Save changes
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </main>

      <footer className="summary-bar panel">
        <div>
          <label>Total records</label>
          <strong>{totalRows}</strong>
        </div>
        <div>
          <label>Total columns</label>
          <strong>{totalColumns}</strong>
        </div>
        <div>
          <label>Datasets</label>
          <strong>{datasets.length}</strong>
        </div>
      </footer>
    </div>
  );
}

export default App;
