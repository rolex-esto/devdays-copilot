import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createDataset, deleteDataset, fetchDatasets, fetchQuality, importCsvDataset, updateDataset } from './api';
import type { Dataset, DatasetRecord, DatasetSourceType, QualityIssue, QualityReport } from './types';

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

const severityLabel = (severity: QualityIssue['severity']) => severity[0].toUpperCase() + severity.slice(1);
type IssueSelectionHandler = (value: QualityIssue | null) => void;

function QualityOverview({
  dataset,
  report,
  selectedIssue,
  onIssueSelect,
  onRefresh
}: {
  dataset: Dataset;
  report: QualityReport;
  selectedIssue: QualityIssue | null;
  onIssueSelect: IssueSelectionHandler;
  onRefresh: () => void;
}) {
  const affectedRecords = selectedIssue
    ? selectedIssue.record_indexes.map((index) => ({ index, record: dataset.records[index] })).filter((item) => item.record)
    : [];
  const severityCounts = report.issues.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <section className="quality-report">
      <div className="quality-heading">
        <div>
          <p className="section-kicker">Analysis complete</p>
          <h2>Data Quality Overview</h2>
          <p className="helper-text">A clear snapshot of the health of {dataset.name}. No data was changed.</p>
        </div>
        <button type="button" className="quiet-button refresh-button" onClick={onRefresh}>Run check again</button>
      </div>
      <div className="quality-hero panel">
        <div className={`score-circle score-${report.label.toLowerCase().replaceAll(' ', '-')}`}>
          <strong>{report.score}</strong><span>/100</span>
        </div>
        <div className="score-copy">
          <p className="section-kicker">Data quality score</p>
          <h3>{report.label}</h3>
          <p>{report.total_issues === 0 ? 'No major issues detected by the configured checks.' : `${report.total_issues} issue types affect ${report.affected_rows} records.`}</p>
        </div>
        <div className="dimension-list">
          {Object.entries(report.dimensions).map(([name, value]) => (
            <div key={name}><span>{name}</span><strong>{value}%</strong><i><em style={{ width: `${value}%` }} /></i></div>
          ))}
        </div>
      </div>
      <div className="quality-metrics">
        <Metric label="Rows" value={report.summary.rows} />
        <Metric label="Columns" value={report.summary.columns} />
        <Metric label="Missing values" value={report.summary.missing_values} />
        <Metric label="Duplicate rows" value={report.summary.duplicate_rows} />
        <Metric label="Invalid values" value={report.summary.invalid_values} />
        <Metric label="Potential outliers" value={report.summary.potential_outliers} />
      </div>
      <div className="quality-section panel">
        <div className="section-title-row"><div><p className="section-kicker">Findings</p><h3>Issues detected</h3></div><span className="muted">{report.issues.length} issue types</span></div>
        {report.issues.length === 0 ? <p className="empty-report">Everything looks healthy based on the checks we can run.</p> : (
          <>
            <div className="severity-row">
              {(['critical', 'high', 'medium', 'low'] as const).map((severity) => <span key={severity} className={`severity-pill ${severity}`}>{severityLabel(severity)} <strong>{severityCounts[severity] ?? 0}</strong></span>)}
            </div>
            <div className="issue-list">
              {report.issues.map((issue) => (
                <button type="button" key={issue.id} className={`issue-row ${selectedIssue?.id === issue.id ? 'selected' : ''}`} onClick={() => onIssueSelect(selectedIssue?.id === issue.id ? null : issue)}>
                  <span className={`severity-dot ${issue.severity}`} aria-label={`${severityLabel(issue.severity)} severity`} />
                  <span><strong>{issue.message}</strong><small>{issue.column_name ?? 'Dataset-wide'} · {issue.affected_rows} affected rows</small></span>
                  <span className="issue-action">View rows →</span>
                </button>
              ))}
            </div>
          </>
        )}
        {selectedIssue ? (
          <div className="affected-records">
            <div className="section-title-row"><h3>Rows affected by {selectedIssue.message.toLowerCase()}</h3><button type="button" className="quiet-button" onClick={() => onIssueSelect(null)}>Close</button></div>
            <div className="record-table-wrap">
              <table><thead><tr><th>Row</th>{Object.keys(affectedRecords[0]?.record ?? {}).slice(0, 6).map((key) => <th key={key}>{key}</th>)}</tr></thead>
                <tbody>{affectedRecords.slice(0, 25).map(({ index, record }) => <tr key={index}><td>{index + 1}</td>{Object.values(record).slice(0, 6).map((value, valueIndex) => <td key={valueIndex}>{String(value ?? '—')}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {affectedRecords.length > 25 ? <p className="muted">Showing the first 25 affected rows.</p> : null}
          </div>
        ) : null}
      </div>
      <div className="quality-section panel">
        <div className="section-title-row"><div><p className="section-kicker">Automatic profiling</p><h3>Column health</h3></div><span className="muted">Click a finding above to inspect rows</span></div>
        <div className="column-table-wrap"><table><thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Unique</th><th>Average</th><th>Outliers</th></tr></thead>
          <tbody>{report.columns.map((column) => <tr key={column.name}><td><strong>{column.name}</strong></td><td><span className="type-badge">{column.inferred_type}</span></td><td>{column.null_values} <small>({column.missing_percentage}%)</small></td><td>{column.unique_values}</td><td>{column.average_value ?? '—'}</td><td>{column.outlier_count}</td></tr>)}</tbody>
        </table></div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric-card"><span>{label}</span><strong>{value.toLocaleString()}</strong></div>;
}

function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<QualityIssue | null>(null);

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

  const loadQuality = useCallback(async (id: string) => {
    setQualityLoading(true);
    setSelectedIssue(null);
    try {
      setQuality(await fetchQuality(id));
    } catch (qualityError) {
      // A long-lived browser tab can hold an ID from before a server refresh.
      // Refresh the list once so a transient stale selection does not strand the user.
      try {
        const refreshed = await fetchDatasets();
        const current = refreshed.find((dataset) => dataset.id === id);
        if (current) {
          setDatasets(refreshed);
          setSelectedId(current.id);
          setQuality(await fetchQuality(current.id));
          setError('');
          return;
        }
      } catch {
        // Surface the original quality error below; the retry is best effort.
      }
      setQuality(null);
      setError(qualityError instanceof Error ? qualityError.message : 'We could not analyze this dataset.');
    } finally {
      setQualityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCreating && selectedDataset) {
      void loadQuality(selectedDataset.id);
    } else {
      setQuality(null);
    }
  }, [isCreating, loadQuality, selectedDataset]);

  const showCreateForm = () => {
    setSelectedId(null);
    setIsCreating(true);
    setForm(emptyForm);
    setCsvFile(null);
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
    setError('');
    setStatus('');
    if (form.source_type === 'CSV' && !csvFile) {
      setError('Choose a CSV file before creating the dataset.');
      return;
    }
    if (form.source_type === 'CSV' && csvFile && !csvFile.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a file ending in .csv.');
      return;
    }
    if (form.source_type === 'CSV' && csvFile) {
      setIsSubmitting(true);
      await importCsvDataset({ name: form.name, description: form.description, file: csvFile })
        .then((dataset) => {
          setDatasets((current) => [dataset, ...current]);
          setSelectedId(dataset.id);
          setIsCreating(false);
          setCsvFile(null);
          setStatus(`"${dataset.name}" is ready to explore.`);
          void loadQuality(dataset.id);
        })
        .catch((submitError) => setError(submitError instanceof Error ? submitError.message : 'We could not import that CSV.'))
        .finally(() => setIsSubmitting(false));
      return;
    }
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
      void loadQuality(dataset.id);
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
      setQuality(null);
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
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setCsvFile(file);
                      setForm((current) => ({ ...current, file_name: file?.name ?? '' }));
                    }}
                  />
                  <span className="field-note">{csvFile ? `Selected: ${csvFile.name}` : 'Choose a CSV file up to 5 MB.'}</span>
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
            <>
            {qualityLoading ? (
              <section className="panel analysis-panel" aria-live="polite">
                <p className="section-kicker">Data quality check</p>
                <h2>Analyzing {selectedDataset.name}</h2>
                <p className="helper-text">We are checking missing values, duplicates, formats, and unusual values.</p>
                <div className="analysis-bar"><span /></div>
              </section>
            ) : quality ? (
              <QualityOverview
                dataset={selectedDataset}
                report={quality}
                selectedIssue={selectedIssue}
                onIssueSelect={setSelectedIssue}
                onRefresh={() => void loadQuality(selectedDataset.id)}
              />
            ) : null}
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
            </>
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
