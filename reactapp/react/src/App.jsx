import React, { useState, useEffect } from 'react';
import axios from 'axios';

import Login from './components/Login';
import FrameUploader from './components/FrameUploader';
import Workers from './components/Workers';
import Violations from './components/Violations';
import MultiCamera from './components/MultiCamera';
import Analytics from './components/Analytics';
import About from './components/About';

import {
  Camera,
  LayoutGrid,
  Users,
  AlertTriangle,
  BarChart3,
  Info,
  LogOut
} from 'lucide-react';

import './App.css';
import logo from './assets/safesight.png';

const api = axios.create({
  baseURL: '',
  withCredentials: true
});

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('live');

  useEffect(() => {
    api.get('/auth/me')
      .then(res => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  if (checking) {
    return (
      <div className="loading-screen">
        Loading SafeSight...
      </div>
    );
  }

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="app-shell">

      {/* SIDEBAR */}
      <nav className="sidebar">

        <div className="brand">
          <img src={logo} alt="SafeSight" className="logo-img" />
        </div>

        <div className="sidebar-user">
          <span className="user-name">{user.username}</span>
        </div>

        <ul className="sidebar-nav">

          <li className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
            <Camera size={18} /> Live Feed
          </li>

          <li className={tab === 'multi' ? 'active' : ''} onClick={() => setTab('multi')}>
            <LayoutGrid size={18} /> Multi-Camera
          </li>

          <li className={tab === 'workers' ? 'active' : ''} onClick={() => setTab('workers')}>
            <Users size={18} /> Workers
          </li>

          <li className={tab === 'violations' ? 'active' : ''} onClick={() => setTab('violations')}>
            <AlertTriangle size={18} /> Violations
          </li>

          <li className={tab === 'analytics' ? 'active' : ''} onClick={() => setTab('analytics')}>
            <BarChart3 size={18} /> Analytics
          </li>

          <li className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>
            <Info size={18} /> About
          </li>

        </ul>

        <button className="logout-btn" onClick={handleLogout}>
          <LogOut size={16} />
          Sign Out
        </button>

      </nav>

      {/* MAIN */}
      <main className="main-content">
        {tab === 'live' && <FrameUploader />}
        {tab === 'multi' && <MultiCamera />}
        {tab === 'workers' && <Workers />}
        {tab === 'violations' && <Violations />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'about' && <About />}
      </main>

    </div>
  );
}

export default App;
