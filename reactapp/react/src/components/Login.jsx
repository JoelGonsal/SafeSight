import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';
import logo from '../assets/safesight.png'; // your logo

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/auth/login',
        { username, password },
        { withCredentials: true }
      );
      onLogin(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* LOGO + TITLE */}
        <div className="brand">
          <div className="logo-wrapper">
  <img src={logo} className="logo-img" />
</div>
          <h1>SafeSight</h1>
          <p className="login-subtitle">AI Safety Monitoring System</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <span className="loader"></span> : 'ACCESS SYSTEM'}
          </button>
        </form>

        
      </div>
    </div>
  );
};

export default Login;