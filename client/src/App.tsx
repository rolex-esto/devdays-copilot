import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createDataset, deleteDataset, fetchDatasets, fetchQuality, importCsvDataset, runQuality, updateDataset, updateDatasetRecord } from './api';
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
type SeverityFilter = 'all' | QualityIssue['severity'];
const severityOrder: QualityIssue['severity'][] = ['critical', 'high', 'medium', 'low'];

const getQualityRecommendation = (counts: Record<QualityIssue['severity'], number>) => {
  if (counts.critical > 0) {
    return {
      priority: 'critical' as const,
      title: 'Immediate action recommended',
      description: `Resolve ${counts.critical} Critical issue${counts.critical === 1 ? '' : 's'} first before using this dataset for analysis or reporting.${counts.high > 0 ? ` Then review ${counts.high} High-severity issue${counts.high === 1 ? '' : 's'}.` : ''}`,
      actionLabel: 'Review Critical Issues'
    };
  }
  if (counts.high > 0) {
    return {
      priority: 'high' as const,
      title: 'Review High-severity issues first',
      description: `No Critical issues were detected, but ${counts.high} High-severity issue${counts.high === 1 ? '' : 's'} may affect data reliability. Resolve these before reviewing Medium and Low issues.`,
      actionLabel: 'Review High Issues'
    };
  }
  if (counts.medium > 0) {
    return {
      priority: 'medium' as const,
      title: 'Dataset is usable with caution',
      description: `No Critical or High issues were detected. Review the ${counts.medium} Medium-severity issue${counts.medium === 1 ? '' : 's'} before relying on the dataset for important analysis.`,
      actionLabel: 'Review Medium Issues'
    };
  }
  if (counts.low > 0) {
    return {
      priority: 'low' as const,
      title: 'Minor cleanup recommended',
      description: `No major data-quality problems were detected. The remaining ${counts.low} Low-severity issue${counts.low === 1 ? '' : 's'} are unlikely to block analysis but may still be worth cleaning.`,
      actionLabel: 'Review Low Issues'
    };
  }
  return {
    priority: 'all' as const,
    title: 'No major issues detected',
    description: 'No Critical, High, Medium, or Low findings were detected by the current quality checks.',
    actionLabel: ''
  };
};

function QualityOverview({
  dataset,
  report,
  selectedIssue,
  onIssueSelect,
  onRefresh,
  onOpenExplorer
}: {
  dataset: Dataset;
  report: QualityReport;
  selectedIssue: QualityIssue | null;
  onIssueSelect: IssueSelectionHandler;
  onRefresh: () => void;
  onOpenExplorer: (issue: QualityIssue) => void;
}) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const affectedRecords = selectedIssue
    ? selectedIssue.record_indexes.map((index) => ({ index, record: dataset.records[index] })).filter((item) => item.record)
    : [];
  const severityCounts = report.issues.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, {});
  const counts = {
    critical: severityCounts.critical ?? 0,
    high: severityCounts.high ?? 0,
    medium: severityCounts.medium ?? 0,
    low: severityCounts.low ?? 0
  };
  const recommendation = getQualityRecommendation(counts);
  const visibleIssues = report.issues
    .filter((issue) => severityFilter === 'all' || issue.severity === severityFilter)
    .sort((left, right) => {
      const priority = severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity);
      return priority || right.affected_rows - left.affected_rows;
    });

  return (
    <section className="quality-report">
      <div className="quality-heading">
        <div>
          <p className="section-kicker">{report.analysis_status === 'COMPLETED' ? 'Analysis complete' : 'Quality check status'}</p>
          <h2>Data Quality Overview</h2>
          <p className="helper-text">A clear snapshot of the health of {dataset.name}. No data was changed.</p>
        </div>
        <button type="button" className="quiet-button refresh-button" onClick={onRefresh}>{report.analysis_status === 'NOT_ANALYZED' ? 'Run quality check' : 'Run check again'}</button>
      </div>
      <div className="quality-hero panel">
        <div className={`score-circle ${report.score !== null ? `score-${report.label.toLowerCase().replaceAll(' ', '-')}` : 'score-unavailable'}`}>
          <strong>{report.score ?? '—'}</strong>{report.score !== null ? <span>/100</span> : null}
        </div>
        <div className="score-copy">
          <p className="section-kicker">Data quality score</p>
          <h3>{report.analysis_status === 'NOT_ANALYZED' ? 'Not analyzed yet' : report.analysis_status === 'STALE' ? 'Stale analysis' : report.analysis_status === 'FAILED' ? 'Analysis failed' : report.analysis_status === 'ANALYZING' ? 'Analyzing dataset...' : report.label}</h3>
          <p>{report.analysis_status === 'NOT_ANALYZED' ? 'Run a quality check to generate a score.' : report.analysis_status === 'STALE' ? 'This dataset changed after the last quality check. Run the check again to refresh the score.' : report.analysis_status === 'FAILED' ? 'We could not calculate a quality score for this dataset.' : report.analysis_status === 'ANALYZING' ? 'We are checking this dataset now.' : report.total_issues === 0 ? 'No major issues detected by the configured checks.' : `${report.total_issues} issue types affect ${report.affected_rows} records.`}</p>
          {report.last_analyzed_at && report.analysis_status !== 'NOT_ANALYZED' ? <small>Last analyzed: {new Date(report.last_analyzed_at).toLocaleString()}</small> : null}
        </div>
        {report.analysis_status !== 'NOT_ANALYZED' && report.analysis_status !== 'FAILED' && report.analysis_status !== 'ANALYZING' ? <div className="dimension-list">
          {Object.entries(report.dimensions).map(([name, value]) => (
            <div key={name}><span>{name}</span><strong>{value}%</strong><i><em style={{ width: `${value}%` }} /></i></div>
          ))}
        </div> : null}
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
        <div className="section-title-row"><div><p className="section-kicker">Findings</p><h3>Issues detected</h3></div><span className="muted">{report.analysis_status === 'COMPLETED' || report.analysis_status === 'STALE' ? `${report.issues.length} issue types` : 'Available after analysis'}</span></div>
        {(report.analysis_status === 'COMPLETED' || report.analysis_status === 'STALE') ? <div className={`recommendation recommendation-${recommendation.priority}`}>
          <div>
            <p className="recommendation-label">Recommended action</p>
            <h4>{recommendation.title}</h4>
            <p>{recommendation.description}</p>
            {report.affected_rows > 0 ? <small>{report.affected_rows.toLocaleString()} unique records affected across all findings.</small> : null}
          </div>
          {recommendation.actionLabel ? <button type="button" className="primary-button recommendation-action" onClick={() => setSeverityFilter(recommendation.priority)}>{recommendation.actionLabel} →</button> : null}
        </div> : null}
        {report.analysis_status !== 'COMPLETED' && report.analysis_status !== 'STALE' ? <p className="empty-report">{report.analysis_status === 'NOT_ANALYZED' ? 'Run a quality check to see findings and column health.' : 'Findings are unavailable until the quality check finishes.'}</p> : report.issues.length === 0 ? <p className="empty-report">Everything looks healthy based on the checks we can run.</p> : (
          <>
            <div className="filter-label">Filter issues</div>
            <div className="severity-row">
              <button type="button" className={`severity-pill all ${severityFilter === 'all' ? 'active' : ''}`} aria-pressed={severityFilter === 'all'} onClick={() => setSeverityFilter('all')}>All <strong>{report.issues.length}</strong></button>
              {severityOrder.map((severity) => <button type="button" key={severity} className={`severity-pill ${severity} ${severityFilter === severity ? 'active' : ''}`} aria-pressed={severityFilter === severity} disabled={counts[severity] === 0} onClick={() => setSeverityFilter(severity)}>{severityLabel(severity)} <strong>{counts[severity]}</strong></button>)}
            </div>
            <div className="section-title-row filtered-results"><h4>{severityFilter === 'all' ? 'Showing all issues' : `Showing ${severityLabel(severityFilter)}-severity issues`}</h4><span className="muted">{visibleIssues.length} issue{visibleIssues.length === 1 ? '' : 's'}</span>{severityFilter !== 'all' ? <button type="button" className="quiet-button" onClick={() => setSeverityFilter('all')}>Clear filter</button> : null}</div>
            <div className="issue-list">
              <div className="issue-list-header"><span>Severity</span><span>Finding</span><span>Column</span><span>Affected</span><span>Action</span></div>
              {visibleIssues.map((issue) => (
                <button type="button" key={issue.id} className={`issue-row ${selectedIssue?.id === issue.id ? 'selected' : ''}`} onClick={() => onIssueSelect(selectedIssue?.id === issue.id ? null : issue)}>
                  <span className={`severity-text ${issue.severity}`}><span className={`severity-dot ${issue.severity}`} aria-hidden="true" />{severityLabel(issue.severity)}</span>
                  <span><strong>{issue.message}</strong></span>
                  <span className="muted">{issue.column_name ?? 'Dataset-wide'}</span>
                  <span className="muted">{issue.affected_rows}</span>
                  <span className="issue-action" onClick={(event) => { event.stopPropagation(); onOpenExplorer(issue); }}>View rows →</span>
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
          <tbody>{report.columns.map((column) => <tr key={column.name} className="clickable-row" onClick={() => onOpenExplorer(report.issues.find((issue) => issue.column_name === column.name) ?? { id: `column-${column.name}`, severity: 'low', issue_type: 'column', column_name: column.name, message: `Records with findings in ${column.name}`, affected_rows: 0, record_indexes: [] })}><td><strong>{column.name}</strong></td><td><span className="type-badge">{column.inferred_type}</span></td><td>{column.null_values} <small>({column.missing_percentage}%)</small></td><td>{column.unique_values}</td><td>{column.average_value ?? '—'}</td><td>{column.outlier_count}</td></tr>)}</tbody>
        </table></div>
      </div>
    </section>
  );
}

function DataExplorer({
  dataset,
  report,
  initialIssue,
  onBack,
  onDatasetChange,
  onQualityRefresh
}: {
  dataset: Dataset;
  report: QualityReport | null;
  initialIssue: QualityIssue | null;
  onBack: () => void;
  onDatasetChange: (dataset: Dataset) => void;
  onQualityRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [rowFilter, setRowFilter] = useState<'all' | 'issues' | 'clean'>('all');
  const [issueFilter, setIssueFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editRecord, setEditRecord] = useState<DatasetRecord>({});
  const [saving, setSaving] = useState(false);
  const pageSize = 25;
  const issueIndexes = useMemo(() => new Set((report?.issues ?? []).flatMap((issue) => issue.record_indexes)), [report]);
  const initialIndexes = useMemo(() => new Set(initialIssue?.record_indexes ?? []), [initialIssue]);
  const columns = useMemo(() => [...new Set(dataset.records.flatMap((record) => Object.keys(record)))], [dataset.records]);
  const filtered = useMemo(() => dataset.records.map((record, index) => ({ record, index })).filter(({ record, index }) => {
    const matchesSearch = !search.trim() || Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase()));
    const hasIssue = issueIndexes.has(index);
    const matchesRows = rowFilter === 'all' || (rowFilter === 'issues' ? hasIssue : !hasIssue);
    const matchesIssue = issueFilter === 'all' || (report?.issues.some((issue) => issue.issue_type === issueFilter && issue.record_indexes.includes(index)) ?? false);
    return matchesSearch && matchesRows && matchesIssue;
  }), [dataset.records, issueFilter, issueIndexes, report, rowFilter, search]);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => {
    if (initialIssue) {
      setRowFilter('issues');
      setIssueFilter(initialIssue.issue_type === 'column' ? 'all' : initialIssue.issue_type);
      setPage(0);
    }
  }, [initialIssue]);

  const saveRecord = async () => {
    if (editingIndex === null) return;
    setSaving(true);
    try {
      const updated = await updateDatasetRecord(dataset.id, editingIndex, editRecord);
      onDatasetChange(updated);
      setEditingIndex(null);
      onQualityRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="explorer panel">
      <div className="explorer-header">
        <div><p className="section-kicker">Datasets / {dataset.name} / Data Explorer</p><h2>View CSV data</h2><p className="helper-text">{dataset.row_count.toLocaleString()} rows · {dataset.column_count} columns</p></div>
        <button type="button" className="quiet-button" onClick={onBack}>← Back to quality overview</button>
      </div>
      {initialIssue ? <div className="filter-callout"><strong>Showing records affected by:</strong> {initialIssue.message} · {initialIssue.column_name ?? 'Dataset-wide'} <button type="button" className="text-button" onClick={() => { setRowFilter('all'); setIssueFilter('all'); }}>Clear filter</button></div> : null}
      <div className="explorer-controls">
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search records..." aria-label="Search records" />
        <select value={rowFilter} onChange={(event) => { setRowFilter(event.target.value as typeof rowFilter); setPage(0); }} aria-label="Row filter"><option value="all">All records</option><option value="issues">Records with issues</option><option value="clean">Clean records</option></select>
        <select value={issueFilter} onChange={(event) => { setIssueFilter(event.target.value); setPage(0); }} aria-label="Issue type filter"><option value="all">All issue types</option>{[...new Set((report?.issues ?? []).map((issue) => issue.issue_type))].map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select>
      </div>
      {visible.length === 0 ? <div className="empty-report">No records match the current filters.</div> : (
        <div className="explorer-table-wrap"><table className="explorer-table"><thead><tr><th>CSV row</th>{columns.map((column) => <th key={column}>{column}</th>)}<th>Action</th></tr></thead><tbody>
          {visible.map(({ record, index }) => <tr key={index} className={initialIndexes.has(index) ? 'focused-row' : ''}><td>{index + 2}</td>{columns.map((column) => { const issue = report?.issues.find((finding) => finding.record_indexes.includes(index) && finding.column_name === column); return <td key={column} className={issue ? `quality-cell ${issue.severity}` : ''}>{issue ? <span className="cell-flag" title={issue.message}>{issue.issue_type === 'missing_values' ? '⚠ Missing' : issue.issue_type === 'potential_outlier' ? 'ⓘ Outlier' : '✕ Invalid'}</span> : null}<span>{String(record[column] ?? '—')}</span></td>; })}<td><button type="button" className="text-button" onClick={() => { setEditingIndex(index); setEditRecord({ ...record }); }}>Edit</button></td></tr>)}
        </tbody></table></div>
      )}
      <div className="pagination"><span>Showing {filtered.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span><div><button type="button" className="quiet-button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>← Previous</button><button type="button" className="quiet-button" disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage((current) => current + 1)}>Next →</button></div></div>
      {editingIndex !== null ? <div className="edit-record panel"><div className="section-title-row"><div><p className="section-kicker">CSV Row {editingIndex + 2}</p><h3>Edit record</h3></div><button type="button" className="quiet-button" onClick={() => setEditingIndex(null)}>Cancel</button></div>{columns.map((column) => <label key={column}>{column}<input value={String(editRecord[column] ?? '')} onChange={(event) => setEditRecord((current) => ({ ...current, [column]: event.target.value }))} /></label>)}<button type="button" className="primary-button" disabled={saving} onClick={() => void saveRecord()}>{saving ? 'Saving...' : 'Save record'}</button></div> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric-card"><span>{label}</span><strong>{value.toLocaleString()}</strong></div>;
}

function HistoryPanel({ dataset, report }: { dataset: Dataset; report: QualityReport | null }) {
  return (
    <section className="workspace-section panel">
      <div className="section-title-row"><div><p className="section-kicker">History</p><h2>Quality history</h2></div><span className="muted">{dataset.analysis_status === 'COMPLETED' ? 'Latest run' : 'No completed runs'}</span></div>
      <table className="history-table"><thead><tr><th>Run</th><th>Score</th><th>Status</th></tr></thead><tbody>
        <tr><td>{report?.last_analyzed_at ? new Date(report.last_analyzed_at).toLocaleString() : 'No run yet'}</td><td>{report?.score ?? '—'}</td><td><span className={`status-badge ${dataset.analysis_status.toLowerCase()}`}>{dataset.analysis_status.replace('_', ' ')}</span></td></tr>
      </tbody></table>
    </section>
  );
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
  const [activeView, setActiveView] = useState<'overview' | 'data' | 'columns' | 'quality' | 'history'>('quality');

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
          setActiveView('quality');
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
      setActiveView('quality');
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
            <header className="dataset-header">
              <div>
                <p className="section-kicker">Dataset</p>
                <h2>{selectedDataset.name}</h2>
                <p className="dataset-context">{selectedDataset.source_type} · {selectedDataset.row_count.toLocaleString()} rows · {selectedDataset.column_count} columns · Updated {new Date(selectedDataset.updated_at).toLocaleDateString()}</p>
              </div>
              <button type="button" className="quiet-button" onClick={() => setActiveView('overview')}>Edit details</button>
            </header>
            <nav className="dataset-tabs" aria-label="Dataset sections">
              {(['overview', 'data', 'columns', 'quality', 'history'] as const).map((tab) => <button type="button" key={tab} className={activeView === tab ? 'active' : ''} aria-current={activeView === tab ? 'page' : undefined} onClick={() => setActiveView(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
            </nav>
            {qualityLoading ? (
              <section className="panel analysis-panel" aria-live="polite">
                <p className="section-kicker">Data quality check</p>
                <h2>Analyzing {selectedDataset.name}</h2>
                <p className="helper-text">We are checking missing values, duplicates, formats, and unusual values.</p>
                <div className="analysis-bar"><span /></div>
              </section>
            ) : quality && (activeView === 'quality' || activeView === 'columns') ? (
              <QualityOverview
                dataset={selectedDataset}
                report={quality}
                selectedIssue={selectedIssue}
                onIssueSelect={setSelectedIssue}
                onRefresh={() => void (async () => { setQualityLoading(true); try { setQuality(await runQuality(selectedDataset.id)); } catch (runError) { setError(runError instanceof Error ? runError.message : 'We could not analyze this dataset.'); } finally { setQualityLoading(false); } })()}
                onOpenExplorer={(issue) => { setSelectedIssue(issue); setActiveView('data'); }}
              />
            ) : null}
            {activeView === 'data' ? (
              <DataExplorer
                dataset={selectedDataset}
                report={quality}
                initialIssue={selectedIssue}
                onBack={() => setActiveView('quality')}
                onDatasetChange={(updated) => setDatasets((current) => current.map((item) => item.id === updated.id ? updated : item))}
                onQualityRefresh={() => void loadQuality(selectedDataset.id)}
              />
            ) : null}
            {activeView === 'history' ? <HistoryPanel dataset={selectedDataset} report={quality} /> : null}
            {activeView === 'overview' ? <form className="panel form-panel" onSubmit={handleUpdate}>
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
            </form> : null}
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

    </div>
  );
}

export default App;
