import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Workers.css';

const api = axios.create({ baseURL: '', withCredentials: true });

const Workers = () => {
  const [workers, setWorkers]   = useState([]);
  const [search, setSearch]     = useState('');
  const [form, setForm]         = useState({ name: '', worker_number: '', phone: '' });
  const [editing, setEditing]   = useState(null);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile]       = useState(null);
  const fileInputRef = useRef();

  const load = async () => {
    const res = await api.get('/workers');
    setWorkers(res.data);
  };

  useEffect(() => { load(); }, []);

  const filtered = workers.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.worker_number.includes(search) ||
    (w.phone || '').includes(search)
  );

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      let workerId = editing;
      if (editing) {
        await api.put(`/workers/${editing}`, form);
        setSuccess('Worker updated');
      } else {
        const res = await api.post('/workers', form);
        workerId = res.data.id;
        setSuccess('Worker added');
      }

      // Upload photo if selected
      if (photoFile && workerId) {
        const fd = new FormData();
        fd.append('file', photoFile);
        await api.post(`/workers/${workerId}/photo`, fd);
      }

      setEditing(null);
      setForm({ name: '', worker_number: '', phone: '' });
      setPhotoFile(null);
      setPhotoPreview(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error saving worker');
    }
  };

  const handleEdit = (w) => {
    setEditing(w._id);
    setForm({ name: w.name, worker_number: w.worker_number, phone: w.phone || '' });
    setPhotoPreview(w.photo || null);
    setPhotoFile(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this worker?')) return;
    await api.delete(`/workers/${id}`);
    load();
  };

  const handleDeletePhoto = async (id) => {
    await api.delete(`/workers/${id}/photo`);
    load();
    if (editing === id) setPhotoPreview(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ name: '', worker_number: '', phone: '' });
    setPhotoFile(null);
    setPhotoPreview(null);
  };

 return (
    <div className="workers-page">
      <div className="page-header">
        <div>
          <h2>Worker Profiles</h2>
          <p className="workers-desc">Manage identification via vest/helmet numbers and facial recognition.</p>
        </div>
        <br></br>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="workers-layout">
        {/* ── TACTICAL FORM CARD ── */}
        <div className="card workers-form-card">
          <h3 className="card-title">{editing ? 'Modify Profile' : 'Register New Worker'}</h3>
          <form onSubmit={handleSubmit} className="industrial-form">
            <div className="photo-upload-container">
              <div className="photo-upload-area" onClick={() => fileInputRef.current.click()}>
                {photoPreview
                  ? <img src={photoPreview} alt="Preview" className="photo-preview" />
                  : <div className="photo-placeholder">
            
                      <span>Upload Photo</span>
                    </div>
                }
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              </div>
              {photoPreview && editing && (
                <button type="button" className="btn-remove-photo" onClick={() => handleDeletePhoto(editing)}>
                  Remove Photo
                </button>
              )}
            </div>

            <div className="form-group">
              <label>Full Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. John Doe" required />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>ID Number (Vest/Helmet)</label>
                <input value={form.worker_number} onChange={e => setForm({...form, worker_number: e.target.value})} placeholder="e.g. 42" required />
              </div>
              <div className="form-group">
                <label>Contact Phone</label>
                <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+91..." />
              </div>
            </div>

           <div className="form-actions">
  <button type="submit" className="btn btn-primary">
    {editing ? 'Update Record' : 'Add Worker'}
  </button>

  {editing && (
    <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
      Cancel
    </button>
  )}
</div>
          </form>
        </div>

        {/* ── TACTICAL TABLE CARD ── */}
        <div className="card workers-table-card">
          <div className="workers-table-header">
          
            <div className="search-wrapper">
              <input
                className="search-input"
                placeholder="Search by name, ID, or phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="empty-state">No records found matching query.</div>
            ) : (
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Name</th>
                    <th>ID Tag</th>
                    <th>Contact</th>
                    <th className="text-right">Management</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => (
                    <tr key={w._id}>
                      <td>
                        <div className="thumb-container">
                          {w.photo
                            ? <img src={w.photo} alt={w.name} className="worker-thumb" />
                            : <div className="worker-thumb-placeholder">👤</div>
                          }
                        </div>
                      </td>
                      <td className="td-name">{w.name}</td>
                      <td><span className="worker-badge">{w.worker_number}</span></td>
                      <td className="text-dim">{w.phone || 'N/A'}</td>
                      <td className="text-right">
                        <div className="action-group">
                          <button className="btn-action btn-edit" title="Edit" onClick={() => handleEdit(w)}>
                            <span>EDIT</span>
                          </button>
                          <button className="btn-action btn-delete" title="Delete" onClick={() => handleDelete(w._id)}>
                            <span>DELETE</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Workers;
