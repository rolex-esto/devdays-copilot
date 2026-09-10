import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createDataset, deleteDataset, fetchDatasets, updateDataset } from './api';
import type { Dataset, DatasetRecord, DatasetSourceType } from './types';

const emptyForm = {
  name: '',
  description: '',
  source_type: 'Manual' as DatasetSourceType,
  file_name: ''
};

const sampleRecords: DatasetRecord[] = [
  { order_id: 'A-1001', customer_name: 'Ada Lovelace', status: 'Active', amount: 1250 },
  { order_id: 'A-1002', customer_name: 'Grace Hopper', status: 'Pending', amount: 980 },
  { order_id: 'A-1003', customer_name: 'Katherine Johnson', status: 'Active', amount: 1640 }
];

function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
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
      setError(loadError instanceof Error ? loadError.message : 'We could not load your datasets.');
    }
  }, []);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (isCreating || !selectedDataset) {
      return;
    }

    setForm({
      name: selectedDataset.name,
      description: selectedDataset.description,
      source_type: selectedDataset.source_type,
      file_name: selectedDataset.file_name ?? ''
    });
  }, [isCreating, selectedDataset]);

  const showCreateForm = () => {
    setSelectedId(null);
    setIsCreating(true);
    setForm(emptyForm);
    setStatus('');
    setError('');
  };

  const create = async (payload: {
    name: string;
    description: string;
    source_type: DatasetSourceType;
    file_name: string | null;
    records: DatasetRecord[];
  }) => {
    setIsSubmitting(true);
    setError('');
    setStatus('');

    try {
      const dataset = await createDataset(payload);
      setDatasets((current) => [dataset, ...current]);
      setSelectedId(dataset.id);
      setIsCreating(false);
      setStatus(`"${dataset.name}" is ready to explore.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not create that dataset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await create({
      name: form.name,
      description: form.description,
      source_type: form.source_type,
      file_name: form.file_name || null,
      records: form.source_type === 'Generated Sample' ? sampleRecords : []
    });
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

      setDatasets((current) => current.map((item) => (item.id === dataset.id ? dataset : item)));
      setStatus('Your changes have been saved.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not save those changes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete this dataset? Its information cannot be recovered.');
    if (!confirmed) {
      return;
    }

    setError('');
    try {
      await deleteDataset(id);
      setDatasets((current) => current.filter((dataset) => dataset.id !== id));
      setSelectedId(null);
      setIsCreating(false);
      setStatus('Dataset deleted.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not delete that dataset.');
    }
  };

  const totalRows = datasets.reduce((sum, dataset) => sum + dataset.row_count, 0);
  const totalColumns = datasets.reduce((sum, dataset) => sum + dataset.column_count, 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">DP</div>
          <div>
            <p className="eyebrow">Your data, made clearer</p>
            <h1>DataPulse</h1>
          </div>
        </div>
        <button type="button" className="primary-button header-action" onClick={showCreateForm}>
          Add a dataset
        </button>
      </header>

      <div className="workspace">
        <aside className="sidebar panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Your workspace</p>
              <h2>Datasets</h2>
            </div>
            <span className="count-badge">{datasets.length}</span>
          </div>

          {datasets.length === 0 ? (
            <div className="empty-list">
              <div className="empty-icon">+</div>
              <strong>No datasets yet</strong>
              <p>Add a file or start with sample data to see it here.</p>
              <button type="button" className="text-button" onClick={showCreateForm}>
                Get started
              </button>
            </div>
          ) : (
            <ul className="dataset-list">
              {datasets.map((dataset) => (
                <li key={dataset.id}>
                  <button
                    type="button"
                    className={dataset.id === selectedId ? 'dataset-item active' : 'dataset-item'}
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedId(dataset.id);
                      setStatus('');
                      setError('');
                    }}
                  >
                    <span className="dataset-name">{dataset.name}</span>
                    <span className="dataset-meta">{dataset.row_count} rows · {dataset.source_type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="content">
          {isCreating ? (
            <form className="panel form-panel" onSubmit={handleCreate}>
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Step 1 of 3</p>
                  <h2>Add a dataset</h2>
                  <p className="helper-text">Give your data a name so you can find it again later.</p>
                </div>
                <button type="button" className="quiet-button" onClick={() => setIsCreating(false)}>
                  Cancel
                </button>
              </div>

              <div className="field-grid">
                <label>
                  What should we call it?
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="For example, E-commerce sales"
                    required
                    autoFocus
                  />
                </label>

                <label>
                  Where is it from?
                  <select
                    value={form.source_type}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, source_type: event.target.value as DatasetSourceType }))
                    }
                  >
                    <option value="Manual">I will add it manually</option>
                    <option value="CSV">A CSV file</option>
                    <option value="Generated Sample">Use sample data</option>
                  </select>
                </label>
              </div>

              <label>
                Tell us a little about it <span className="optional">(optional)</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={4}
                  placeholder="Example: Monthly orders from our online store"
                />
              </label>

              {form.source_type === 'CSV' ? (
                <label>
                  File name <span className="optional">(optional for now)</span>
                  <input
                    value={form.file_name}
                    onChange={(event) => setForm((current) => ({ ...current, file_name: event.target.value }))}
                    placeholder="orders.csv"
                  />
                  <span className="field-note">CSV upload is coming next. You can save the dataset details now.</span>
                </label>
              ) : null}

              {form.source_type === 'Generated Sample' ? (
                <div className="info-callout">
                  <strong>Ready-to-use example</strong>
                  <p>We will add three sample orders so you can explore the experience immediately.</p>
                </div>
              ) : null}

              <div className="button-row">
                <button type="submit" className="primary-button" disabled={isSubmitting || !form.name.trim()}>
                  {isSubmitting ? 'Creating...' : 'Create dataset'}
                </button>
              </div>
            </form>
          ) : selectedDataset ? (
            <form className="panel form-panel" onSubmit={handleUpdate}>
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Dataset details</p>
                  <h2>{selectedDataset.name}</h2>
                  <p className="helper-text">{selectedDataset.description || 'Add a description to help your team understand this data.'}</p>
                </div>
                <button type="button" className="danger-button" onClick={() => handleDelete(selectedDataset.id)}>
                  Delete
                </button>
              </div>

              <div className="stats-grid">
                <div><span>Rows</span><strong>{selectedDataset.row_count}</strong></div>
                <div><span>Columns</span><strong>{selectedDataset.column_count}</strong></div>
                <div><span>Source</span><strong>{selectedDataset.source_type}</strong></div>
                <div><span>Last updated</span><strong>{new Date(selectedDataset.updated_at).toLocaleDateString()}</strong></div>
              </div>

              <div className="divider" />
              <p className="section-kicker">Edit information</p>
              <div className="field-grid">
                <label>
                  Dataset name
                  <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label>
                  Source type
                  <select value={form.source_type} onChange={(event) => setForm((current) => ({ ...current, source_type: event.target.value as DatasetSourceType }))}>
                    <option value="Manual">I will add it manually</option>
                    <option value="CSV">A CSV file</option>
                    <option value="Generated Sample">Use sample data</option>
                  </select>
                </label>
              </div>
              <label>
                Description
                <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} />
              </label>
              <div className="button-row">
                <button type="submit" className="primary-button" disabled={isSubmitting || !form.name.trim()}>
                  {isSubmitting ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          ) : (
            <section className="panel welcome-panel">
              <div className="welcome-copy">
                <p className="section-kicker">Welcome to DataPulse</p>
                <h2>Make better decisions with data you can trust.</h2>
                <p>Start by adding a dataset. We will help you organize it now and make it easier to check and understand as the product grows.</p>
                <button type="button" className="primary-button" onClick={showCreateForm}>Add your first dataset</button>
              </div>
              <div className="steps">
                <div><span>1</span><div><strong>Add</strong><p>Give your data a name.</p></div></div>
                <div><span>2</span><div><strong>Understand</strong><p>See its size and source.</p></div></div>
                <div><span>3</span><div><strong>Improve</strong><p>Quality checks are next.</p></div></div>
              </div>
            </section>
          )}

          {status ? <p className="status success" role="status">{status}</p> : null}
          {error ? <p className="status error" role="alert">{error}</p> : null}
        </main>
      </div>

      <footer className="summary-bar panel">
        <div><span>Total records</span><strong>{totalRows}</strong></div>
        <div><span>Total columns</span><strong>{totalColumns}</strong></div>
        <div><span>Datasets</span><strong>{datasets.length}</strong></div>
      </footer>
    </div>
  );
}

export default App;
