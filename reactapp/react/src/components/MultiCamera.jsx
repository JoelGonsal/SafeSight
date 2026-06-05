import React, { useState, useEffect } from 'react';
import CameraStream from './CameraStream';
import './MultiCamera.css';

const MultiCamera = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCam, setActiveCam] = useState(null);

  const loadDevices = () => {
    setLoading(true);
    navigator.mediaDevices.enumerateDevices()
      .then(all => {
        const cams = all.filter(d => d.kind === 'videoinput');
        setDevices(cams.slice(0, 4));
        setLoading(false);
      })
      .catch(err => {
        console.error('Camera enum error:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDevices();
  }, []);

  if (loading) return <div className="mc-loading">Detecting cameras...</div>;

  if (devices.length === 0) {
    return (
      <div className="mc-empty">
        <p>No cameras detected. Allow camera permissions and refresh.</p>
      </div>
    );
  }

  return (
    <div className="multi-camera">
      <div className="mc-header">
        <div>
          <h2>Multi-Camera Feed</h2>
          <p className="mc-desc">
            {devices.length} camera{devices.length > 1 ? 's' : ''}
          </p>
        </div>
<br></br>
        <button className="btn mc-refresh" onClick={loadDevices}>
          ↻ Refresh
        </button>
        <br></br>
      </div>

      <div className={`mc-grid ${activeCam !== null ? 'expanded' : ''}`}>
        {devices.map((device, i) => (
          <div
            key={device.deviceId}
            className={`mc-tile ${activeCam === i ? 'active' : ''}`}
          >
            <button
              className="mc-expand-btn"
              onClick={() =>
                setActiveCam(activeCam === i ? null : i)
              }
              title={activeCam === i ? 'Collapse' : 'Expand'}
            >
              {activeCam === i ? '✕' : '⛶'}
            </button>

            <CameraStream
              cameraId={`cam${i + 1}`}
              label={device.label || `Camera ${i + 1}`}
              deviceId={device.deviceId}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiCamera;