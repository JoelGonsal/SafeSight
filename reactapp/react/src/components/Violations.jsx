import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Violations.css';

const api = axios.create({ baseURL: '', withCredentials: true });

const Violations = () => {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [snapshot, setSnapshot]     = useState(null);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('all'); // all | no_vest | no_helmet | both

  const load = async () => {
    setLoading(true);
    const res = await api.get('/violations?limit=100');
    setViolations(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const openSnapshot = async (v) => {
    try {
      const res = await api.get(`/violations/${v._id}/snapshot`);
      setSnapshot({ url: res.data.snapshot, info: v });
    } catch {
      alert('No snapshot available for this violation');
    }
  };

  const deleteViolation = async (id) => {
    await api.delete(`/violations/${id}`);
    setViolations(prev => prev.filter(v => v._id !== id));
    if (snapshot?.info._id === id) setSnapshot(null);
  };

  const deleteAll = async () => {
    if (!confirm('Delete ALL violations? This cannot be undone.')) return;
    await api.delete('/violations');
    setViolations([]);
    setSnapshot(null);
  };

  const formatTime = (ts) => ts ? new Date(ts).toLocaleString() : '—';

  const filtered = violations.filter(v => {
    const matchSearch = !search ||
      (v.worker_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (v.worker_number || '').includes(search) ||
      (v.camera_id || '').includes(search);

    const matchType =
      filterType === 'all' ? true :
      filterType === 'both'     ? (!v.has_vest && !v.has_helmet) :
      filterType === 'no_vest'  ? (!v.has_vest && v.has_helmet) :
      filterType === 'no_helmet'? (v.has_vest && !v.has_helmet) : true;

    return matchSearch && matchType;
  });

  const getMissingBadge = (v) => {
    if (!v.has_vest && !v.has_helmet) return <span className="badge badge-red">No Vest + No Helmet</span>;
    if (!v.has_vest)   return <span className="badge badge-orange">No Vest</span>;
    if (!v.has_helmet) return <span className="badge badge-yellow">No Helmet</span>;
    return null;
  };

  return (
    <div className="violations-page">
      <div className="violations-header">
        <div>
          <h2>Violation Log</h2>
          <p className="violations-desc">Real-time safety compliance violations</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>↻ Refresh</button>
        <button className="btn btn-danger-outline" onClick={deleteAll}>🗑 Clear All</button>
      </div>

      {loading ? (
        <div className="loading">Loading violations...</div>
      ) : violations.length === 0 ? (
        <div className="empty-violations">
          <div className="empty-icon">✅</div>
          <p>No violations recorded yet.</p>
        </div>
      ) : (
        <div className="violations-table-card">
          <div className="violations-filters">
            <input className="search-input" placeholder="🔍 Search worker, camera..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All violations</option>
              <option value="both">Missing both</option>
              <option value="no_vest">No vest only</option>
              <option value="no_helmet">No helmet only</option>
            </select>
            <span className="filter-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="violations-table">
            <thead>
              <tr>
                <th>Snapshot</th>
                <th>Time</th>
                <th>Worker</th>
                <th>Worker #</th>
                <th>Camera</th>
                <th>Violation</th>
                <th>WhatsApp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v._id} className={!v.has_vest && !v.has_helmet ? 'row-critical' : 'row-warning'}>
                  <td>
                    <button className="snapshot-btn" onClick={() => openSnapshot(v)} title="View snapshot">
                      📸
                    </button>
                  </td>
                  <td className="td-time">{formatTime(v.timestamp)}</td>
                  <td>{v.worker_name || '—'}</td>
                  <td>{v.worker_number ? <span className="worker-badge">{v.worker_number}</span> : '—'}</td>
                  <td>{v.camera_id || '—'}</td>
                  <td>{getMissingBadge(v)}</td>
                  <td>{!v.has_vest && !v.has_helmet ? <span className="sent-badge">Sent ✓</span> : <span className="flag-badge">Flagged</span>}</td>
                  <td>
                    <button className="del-btn" onClick={() => deleteViolation(v._id)} title="Delete">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Snapshot modal */}
      {snapshot && (
        <div className="snapshot-modal" onClick={() => setSnapshot(null)}>
          <div className="snapshot-modal-inner" onClick={e => e.stopPropagation()}>
            <div className="snapshot-modal-header">
              <div>
                <strong>{snapshot.info.worker_name || 'Unknown'}</strong>
                <span className="snapshot-time"> — {formatTime(snapshot.info.timestamp)}</span>
              </div>
              <button className="snapshot-close" onClick={() => setSnapshot(null)}>✕</button>
            </div>
            <img src={snapshot.url} alt="Violation snapshot" className="snapshot-img" />
            <div className="snapshot-footer">
              {getMissingBadge(snapshot.info)}
              <span style={{ marginLeft: 8 }}>Camera: {snapshot.info.camera_id || '—'}</span>
              <button className="del-btn" style={{ marginLeft: '10px' }} title="Delete violation"
                onClick={() => deleteViolation(snapshot.info._id)}>
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Violations;
