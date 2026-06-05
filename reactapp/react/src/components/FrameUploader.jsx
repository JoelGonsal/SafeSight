import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './FrameUploader.css';

const FrameUploader = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showRawVideo, setShowRawVideo] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const bufferCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const processingRef = useRef(false);

  // Start webcam
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
        setError(null);
        
        // Wait for video to be ready before processing
        videoRef.current.onloadedmetadata = () => {
          console.log('Video ready, starting frame processing...');
          startFrameProcessing();
        };
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setError('Failed to access webcam. Please ensure camera permissions are granted.');
    }
  };

  // Stop webcam
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setIsStreaming(false);
    setResult(null);
    
    // Clear display canvas
    if (displayCanvasRef.current) {
      const ctx = displayCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
    }
  };

  // Process frames continuously
  const startFrameProcessing = () => {
    intervalRef.current = setInterval(async () => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && !processingRef.current) {
        await captureAndProcess();
      }
    }, 50); // Process every 50ms (20 FPS attempt, actual will be limited by backend)
  };

  // Capture frame and send to backend
  const captureAndProcess = async () => {
    // Skip if already processing
    if (processingRef.current) {
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) return;
    
    // Check if video dimensions are valid
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }
    
    processingRef.current = true;
    
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Add a timestamp to verify we're capturing different frames
    context.fillStyle = 'yellow';
    context.font = '20px Arial';
    context.fillText(`Captured: ${Date.now()}`, 10, canvas.height - 10);
    
    canvas.toBlob(async (blob) => {
      if (!blob) {
        processingRef.current = false;
        return;
      }
      
      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');
      
      try {
        const response = await axios.post('/process_frame/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          withCredentials: true,
          timeout: 5000
        });
        
        setResult(response.data);
        
        // Draw the annotated image on a buffer canvas first, then copy to display
        if (displayCanvasRef.current && response.data.annotated_image) {
          const img = new Image();
          img.onload = () => {
            const displayCanvas = displayCanvasRef.current;
            if (!displayCanvas) return;
            
            const ctx = displayCanvas.getContext('2d', { alpha: false });
            
            // Resize canvas only if needed
            if (displayCanvas.width !== img.width || displayCanvas.height !== img.height) {
              displayCanvas.width = img.width;
              displayCanvas.height = img.height;
            }
            
            // Draw directly - no clear needed since we're drawing the full image
            ctx.drawImage(img, 0, 0);
          };
          img.src = response.data.annotated_image;
        }
        
        setError(null);
      } catch (error) {
        console.error("Error processing frame:", error);
        if (error.code === 'ECONNABORTED') {
          setError('Backend timeout. Processing may be slow.');
        } else if (!error.response) {
          setError('Cannot connect to backend. Make sure the Python API is running on port 8000.');
        } else {
          setError(`Backend error: ${error.response.status}`);
        }
      } finally {
        processingRef.current = false;
      }
    }, 'image/jpeg', 0.8);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  return (
    <div className="dashboard">
      <header className={`dashboard-header ${isStreaming ? 'is-live' : ''}`}>
  <div className="header-text-container">
    <div className="status-indicator">
      <span className="pulse-dot"></span>
      <span className="status-text">{isStreaming ? 'SYSTEM LIVE' : 'SYSTEM READY'}</span>
    </div>
    <h2 className="glitch-text" data-text="Safety Equipment Detection">
      Safety Equipment Detection
    </h2>
    <p className="typing-text">Real-time vest and helmet monitoring</p>
  </div>
  
  {/* Move your button logic here or keep it below, 
      but I've styled the header to accommodate the "Live" state */}
</header>

<div className="dashboard-content">
  <div className="camera-section">
    <div className="camera-card">
      <div className="controls-center">
        {!isStreaming ? (
          <button className="btn btn-start" onClick={startWebcam}>
            <span className="btn-icon">▶</span> START CAMERA
          </button>
        ) : (
          <button className="btn btn-stop" onClick={stopWebcam}>
            <span className="btn-icon">■</span> STOP CAMERA
          </button>
        )}
      </div>

            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}

            <div className="video-container">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="webcam-video"
                style={{ 
                  position: showRawVideo ? 'relative' : 'absolute',
                  opacity: showRawVideo ? 1 : 0,
                  pointerEvents: showRawVideo ? 'auto' : 'none',
                  zIndex: showRawVideo ? 2 : 1
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              <canvas 
                ref={displayCanvasRef}
                className="detection-feed"
                style={{ 
                  display: isStreaming ? 'block' : 'none',
                  position: showRawVideo ? 'absolute' : 'relative',
                  opacity: showRawVideo ? 0 : 1,
                  pointerEvents: showRawVideo ? 'none' : 'auto',
                  zIndex: showRawVideo ? 1 : 2
                }}
              />
              
              {!isStreaming && (
                <div className="placeholder-feed">
                  <p>📹 Click "Start Camera" to begin</p>
                </div>
              )}
              
              {isStreaming && !showRawVideo && !result && (
                <div className="placeholder-feed" style={{ position: 'absolute', zIndex: 3 }}>
                  <p>🔄 Processing video feed...</p>
                  <p style={{ fontSize: '0.9em', marginTop: '10px' }}>
                    Make sure the backend is running at http://127.0.0.1:8000
                  </p>
                  <p style={{ fontSize: '0.8em', marginTop: '10px', opacity: 0.7 }}>
                    Check browser console (F12) for details
                  </p>
                </div>
              )}
            </div>
            
            {isStreaming && (
              <div style={{ marginTop: '10px', textAlign: 'center' }}>
                <div style={{
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: '20px'
}}>
  <button 
    className="btn btn-primary"
    onClick={() => setShowRawVideo(!showRawVideo)}
    style={{ fontSize: '0.9rem', padding: '8px 20px' }}
  >
    {showRawVideo ? '📊 Show Processed' : '📹 Show Raw Video'}
  </button>
  <br></br><br></br>
</div>
              </div>
            )}
          </div>
        </div>

        {result && isStreaming && (
          <div className="results-section">
            <div className="stats-grid">
              <div className="stat-card total">
                <div className="stat-icon">👥</div>
                <div className="stat-content">
                  <h3>Total Persons</h3>
                  <p className="stat-value">{result.total_persons}</p>
                </div>
              </div>

              <div className="stat-card safe">
                <div className="stat-icon">🦺</div>
                <div className="stat-content">
                  <h3>With Vest</h3>
                  <p className="stat-value">{result.vest_count}</p>
                </div>
              </div>

              <div className="stat-card safe">
                <div className="stat-icon">⛑️</div>
                <div className="stat-content">
                  <h3>With Helmet</h3>
                  <p className="stat-value">{result.helmet_count}</p>
                </div>
              </div>

              <div className="stat-card danger">
                <div className="stat-icon">❌</div>
                <div className="stat-content">
                  <h3>Missing Safety Gear</h3>
                  <p className="stat-value">{Math.max(result.no_vest_count, result.no_helmet_count)}</p>
                </div>
              </div>

              <div className="stat-card info">
                <div className="stat-icon">⚡</div>
                <div className="stat-content">
                  <h3>Processing Speed</h3>
                  <p className="stat-value">{result.fps.toFixed(1)} FPS</p>
                </div>
              </div>
            </div>

            <div className="compliance-status">
              {result.no_vest_count === 0 && result.no_helmet_count === 0 && result.total_persons > 0 ? (
                <div className="status-badge success">
                  ✓ All personnel wearing complete safety equipment (vest + helmet)
                </div>
              ) : result.no_vest_count > 0 || result.no_helmet_count > 0 ? (
                <div className="status-badge warning">
                  ⚠ Safety violations detected: {result.no_vest_count} without vest, {result.no_helmet_count} without helmet
                </div>
              ) : (
                <div className="status-badge info">
                  ℹ No persons detected
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FrameUploader;