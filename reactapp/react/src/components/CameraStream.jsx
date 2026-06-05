import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './CameraStream.css';

const CameraStream = ({ cameraId, label, deviceId }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const displayRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const processingRef = useRef(false);

  const startStream = async () => {
    try {
      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: 1280, height: 720 }
          : { width: 1280, height: 720 }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      streamRef.current = stream;

      // 🔥 FIX: set fixed canvas size
      displayRef.current.width = 640;
      displayRef.current.height = 360;

      setIsStreaming(true);
      setError(null);

      videoRef.current.onloadedmetadata = () => startProcessing();
    } catch (err) {
      setError('Camera access failed: ' + err.message);
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setIsStreaming(false);
    setResult(null);
  };

  const startProcessing = () => {
    intervalRef.current = setInterval(() => {
      if (
        !processingRef.current &&
        videoRef.current?.readyState === videoRef.current?.HAVE_ENOUGH_DATA
      ) {
        captureAndProcess();
      }
    }, 100);
  };

  const captureAndProcess = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    processingRef.current = true;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        processingRef.current = false;
        return;
      }

      const form = new FormData();
      form.append('file', blob, 'frame.jpg');

      try {
        const res = await axios.post(
          `/process_frame/?camera_id=${cameraId}`,
          form,
          { withCredentials: true, timeout: 5000 }
        );

        setResult(res.data);

        if (displayRef.current && res.data.annotated_image) {
          const img = new Image();

          img.onload = () => {
            const dc = displayRef.current;
            const ctx2 = dc.getContext('2d');

            // 🔥 FIX: scale inside fixed canvas (no resize)
            ctx2.clearRect(0, 0, dc.width, dc.height);
            ctx2.drawImage(img, 0, 0, dc.width, dc.height);
          };

          img.src = res.data.annotated_image;
        }

        setError(null);
      } catch (e) {
        if (!e.response) setError('Backend not reachable');
      } finally {
        processingRef.current = false;
      }
    }, 'image/jpeg', 0.8);
  };

  useEffect(() => {
    return () => stopStream();
  }, []);

  return (
    <div className="camera-stream">
     
      




      <div className="stream-header">
  <div className="stream-top">
  

    <span className={`stream-status ${isStreaming ? 'live' : 'off'}`}>
  {label} • {isStreaming ? '● LIVE' : '○ OFF'}
</span>
</div>
</div>

      <div className="stream-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ position: 'absolute', opacity: 0 }}
        />

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <canvas
          ref={displayRef}
          className="stream-canvas"
          style={{ display: isStreaming ? 'block' : 'none' }}
        />

        {!isStreaming && (
          <div className="stream-placeholder">📷 {label}</div>
        )}
      </div>

      {error && <div className="stream-error">{error}</div>}

     <div className="stream-stats">
  {result && isStreaming && (
    <>
      <span>👥 {result.total_persons}</span>
      <span>🦺 {result.vest_count}</span>
      <span>⛑️ {result.helmet_count}</span>
      <span>⚡ {result.fps?.toFixed(1)} fps</span>
      {result.violations?.length > 0 && (
        <span className="stream-violation">
          ⚠️ {result.violations.length}
        </span>
      )}
    </>
  )}
</div>

      <div className="stream-controls">
        {!isStreaming ? (
          <button className="btn-start" onClick={startStream}>
            Start
          </button>
        ) : (
          <button className="btn-stop" onClick={stopStream}>
            Stop
          </button>
        )}
      </div>
    </div>
  );
};

export default CameraStream;