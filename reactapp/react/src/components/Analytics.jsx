import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './Analytics.css';

import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  Tooltip, LineChart, Line,
  CartesianGrid, ResponsiveContainer,
  Legend
} from 'recharts';

const api = axios.create({
  baseURL: 'http://localhost:8000',
  withCredentials: true
});

// Themed Colors from your SafeSight Logo
const THEME_COLORS = ['#FF6B00', '#FFB800', '#334155', '#ef4444', '#64748b'];

// Custom Tooltip for Industrial Look
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-chart-tooltip">
        <p className="label">{`${label || payload[0].name} : ${payload[0].value}`}</p>
        <p className="desc">Safety Violation Log</p>
      </div>
    );
  }
  return null;
};

function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setIsRefreshing(true);
    
    try {
      const res = await api.get('/analytics');
      setData(res.data);
    } catch (err) {
      console.error("Analytics fetch failed:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    // Dynamic Update: Poll every 30 seconds for live monitoring
    const interval = setInterval(() => fetchAnalytics(true), 30000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  if (loading && !data) {
    return (
      <div className="analytics-loading">
        <div className="industrial-spinner"></div>
        <p>Initializing SafeSight Data...</p>
      </div>
    );
  }

  const pieData = data ? [
    { name: 'Vest Missing', value: data.vest_missing },
    { name: 'Helmet Missing', value: data.helmet_missing }
  ] : [];

  return (
    <div className={`analytics-page ${isRefreshing ? 'refresh-active' : ''}`}>
      
      {/* HEADER WITH STATUS INDICATOR */}
      <div className="analytics-header">
        <div>
          <h2>Analytics Dashboard</h2>
          <span className="live-indicator">
            <span className="dot"></span> LIVE SYSTEM MONITORING
          </span>
        </div>

        <button
          onClick={() => fetchAnalytics()}
          className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
          disabled={loading || isRefreshing}
        >
          {isRefreshing ? "SYNCING..." : "REFRESH DATA"}
        </button>
      </div>

      {/* TOP STATS - Added incremental counters feel via CSS */}
      <div className="stats-grid">
        <div className="stat-card highlight-orange">
          <h3>Total Violations</h3>
          <p className="counter">{data?.total_violations || 0}</p>
        </div>
        <div className="stat-card">
          <h3>Vest Missing</h3>
          <p className="counter text-orange">{data?.vest_missing || 0}</p>
        </div>
        <div className="stat-card">
          <h3>Helmet Missing</h3>
          <p className="counter text-yellow">{data?.helmet_missing || 0}</p>
        </div>
      </div>

<div className="centered-chart-wrapper">
  <div className="chart-box">
    <h3>Violation Distribution</h3>
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie 
          data={pieData} 
          dataKey="value" 
          nameKey="name" 
          innerRadius={60} 
          outerRadius={100} 
          cx="50%" 
          cy="50%"
          paddingAngle={5}
          animationBegin={0}
          animationDuration={1500}
        >
          {pieData.map((_, index) => (
            <Cell key={index} fill={THEME_COLORS[index % THEME_COLORS.length]} stroke="none" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend verticalAlign="bottom" align="center" />
      </PieChart>
    </ResponsiveContainer>
  </div>
</div>
      <div className="charts-main-grid">
        {/* PIE CHART - Dynamic Animation */}
        
        

        {/* DAILY TREND - Smooth Lines */}
        <div className="chart-box full-width">
          <h3>Compliance Trend (Last 7 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data?.daily_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="_id" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#FF6B00" 
                strokeWidth={3}
                dot={{ r: 4, fill: '#FF6B00', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 8, stroke: '#FFB800', strokeWidth: 2 }}
                animationDuration={2000}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* TOP WORKERS - Interaction bars */}
        <div className="chart-box">
          <h3>Critical Workers (Top Violations)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.top_workers}>
              <XAxis dataKey="_id" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" />
              <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} content={<CustomTooltip />} />
              <Bar 
                dataKey="count" 
                fill="#ef4444" 
                radius={[4, 4, 0, 0]} 
                animationDuration={1000}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* CAMERA STATS */}
        <div className="chart-box">
          <h3>Active Camera Load</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.camera_stats}>
              <XAxis dataKey="_id" stroke="#64748b" fontSize={10} />
              <YAxis stroke="#64748b" />
              <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} content={<CustomTooltip />} />
              <Bar 
                dataKey="count" 
                fill="#FFB800" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Analytics;