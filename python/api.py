import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Request, Response, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os, time, base64, datetime
from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import bcrypt
import easyocr
import re
from twilio.rest import Client as TwilioClient
from pydantic import BaseModel
from typing import Optional

# ── PyTorch 2.6+ fix ──────────────────────────────────────────────────────────
import torch
if hasattr(torch.serialization, 'add_safe_globals'):
    from ultralytics.nn.tasks import DetectionModel
    torch.serialization.add_safe_globals([DetectionModel])
from ultralytics import YOLO

# ── Models ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VEST_MODEL_PATH = os.path.join(SCRIPT_DIR, "Q1", "runs", "detect", "vest_helmet_final", "weights", "best.pt")
if not os.path.exists(VEST_MODEL_PATH):
    print(f"Error: model not found at {VEST_MODEL_PATH}")
    exit()

vest_model   = YOLO(VEST_MODEL_PATH)
person_model = YOLO('yolov8n.pt')

# EasyOCR loads lazily on first use to avoid blocking startup
_ocr_reader = None
def get_ocr():
    global _ocr_reader
    if _ocr_reader is None:
        print("Loading EasyOCR model...")
        _ocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        print("EasyOCR ready")
    return _ocr_reader

# ── MongoDB ───────────────────────────────────────────────────────────────────
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client["miniproject"]
users_col    = db["users"]
workers_col  = db["workers"]
violations_col = db["violations"]

# ── Twilio (WhatsApp) ─────────────────────────────────────────────────────────
TWILIO_SID   = os.getenv("TWILIO_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_TOKEN", "")
TWILIO_FROM  = os.getenv("TWILIO_FROM", "whatsapp:+14155238886")  # Twilio sandbox
ADMIN_WHATSAPP = os.getenv("ADMIN_WHATSAPP", "")  # e.g. whatsapp:+91XXXXXXXXXX

def send_whatsapp(message: str):
    if not TWILIO_SID or not TWILIO_TOKEN or not ADMIN_WHATSAPP:
        print(f"[WhatsApp skipped - not configured] {message}")
        return
    try:
        client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
        client.messages.create(body=message, from_=TWILIO_FROM, to=ADMIN_WHATSAPP)
        print(f"[WhatsApp sent] {message}")
    except Exception as e:
        print(f"[WhatsApp error] {e}")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Session helpers ───────────────────────────────────────────────────────────
SESSION_COOKIE = "session_token"
active_sessions: dict = {}   # token -> {user_id, username, role}

def create_session(user_id: str, username: str, role: str) -> str:
    import secrets
    token = secrets.token_hex(32)
    active_sessions[token] = {"user_id": user_id, "username": username, "role": role}
    return token

def get_session(request: Request) -> Optional[dict]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    return active_sessions.get(token)

def require_session(request: Request) -> dict:
    session = get_session(request)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return session

def require_admin(request: Request) -> dict:
    session = require_session(request)
    if session.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return session

# ── Pydantic models ───────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class WorkerCreate(BaseModel):
    name: str
    worker_number: str   # number printed on vest/helmet
    phone: Optional[str] = ""

class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    worker_number: Optional[str] = None
    phone: Optional[str] = None

# ── Violation cooldowns ───────────────────────────────────────────────────────
# Tracks last violation log time per worker key
_violation_cooldown: dict = {}   # key -> last logged datetime
_whatsapp_cooldown:  dict = {}   # key -> last sent datetime
VIOLATION_COOLDOWN_SECS = 10      # log to DB at most once per 5s per worker
WHATSAPP_COOLDOWN_SECS  = 300    # WhatsApp alert at most once per 5min per worker

def _should_log(key: str) -> bool:
    last = _violation_cooldown.get(key)
    if last is None or (datetime.datetime.utcnow() - last).total_seconds() >= VIOLATION_COOLDOWN_SECS:
        _violation_cooldown[key] = datetime.datetime.utcnow()
        return True
    return False

def _should_whatsapp(key: str) -> bool:
    last = _whatsapp_cooldown.get(key)
    if last is None or (datetime.datetime.utcnow() - last).total_seconds() >= WHATSAPP_COOLDOWN_SECS:
        _whatsapp_cooldown[key] = datetime.datetime.utcnow()
        return True
    return False


class FPS_counter:
    def __init__(self):
        self.prev_time = 0
        self.fps = 0
    def update(self):
        now = time.time()
        if self.prev_time > 0:
            self.fps = 1 / (now - self.prev_time)
        self.prev_time = now
        return self.fps

global_fps_counter = FPS_counter()
camera_fps_counters: dict = {}  # camera_id -> FPS_counter

def get_fps_counter(camera_id: str) -> FPS_counter:
    if camera_id not in camera_fps_counters:
        camera_fps_counters[camera_id] = FPS_counter()
    return camera_fps_counters[camera_id]

# ── OCR: extract worker number from crop ─────────────────────────────────────
def extract_worker_number(crop: np.ndarray) -> Optional[str]:
    try:
        if crop.size == 0:
            return None
        results = get_ocr().readtext(crop, detail=1, allowlist='0123456789')
        for (bbox, text, conf) in results:
            text = text.strip()
            print(f"[OCR] detected: '{text}' confidence: {conf:.2f}")
            if re.match(r'^\d+$', text) and conf > 0.3:
                return text
    except Exception as e:
        print(f"OCR error: {e}")
    return None

# ── Face matching - runs in background thread to avoid blocking ───────────────
import threading
from concurrent.futures import ThreadPoolExecutor
_face_executor = ThreadPoolExecutor(max_workers=1)
_pending_face_match: dict = {}  # camera_id+box -> future

def match_face_to_worker(person_crop: np.ndarray, worker_map: dict) -> Optional[str]:
    """Try to match a person crop to a worker by face using DeepFace."""
    try:
        from deepface import DeepFace
        import tempfile

        workers_with_photos = {num: info for num, info in worker_map.items() if info.get('photo')}
        if not workers_with_photos:
            return None

        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
            cv2.imwrite(f.name, person_crop)
            crop_path = f.name

        best_match   = None
        best_distance = 0.6

        for worker_num, info in workers_with_photos.items():
            worker_path = None
            try:
                photo_str = info['photo']
                if ',' in photo_str:
                    photo_str = photo_str.split(',')[1]
                photo_bytes = base64.b64decode(photo_str)
                np_arr = np.frombuffer(photo_bytes, np.uint8)
                worker_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                if worker_img is None:
                    continue

                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as wf:
                    cv2.imwrite(wf.name, worker_img)
                    worker_path = wf.name

                result = DeepFace.verify(
                    crop_path, worker_path,
                    model_name='Facenet',
                    detector_backend='opencv',
                    enforce_detection=False,
                    silent=True
                )
                print(f"[Face] Worker #{worker_num}: verified={result['verified']} dist={result['distance']:.3f}")

                if result['verified'] and result['distance'] < best_distance:
                    best_distance = result['distance']
                    best_match    = worker_num

            except Exception as e:
                print(f"[Face] Error with worker #{worker_num}: {e}")
            finally:
                if worker_path and os.path.exists(worker_path):
                    os.unlink(worker_path)

        if os.path.exists(crop_path):
            os.unlink(crop_path)

        if best_match:
            print(f"[Face] ✓ Matched worker #{best_match}")
        return best_match

    except Exception as e:
        print(f"[Face] Fatal: {e}")
        return None

# Cache of last known face match per person position key
_face_cache: dict = {}  # key -> (worker_number, timestamp)
FACE_CACHE_TTL = 10  # seconds - reuse face match result for 10s

def get_cached_face_match(key: str, person_crop: np.ndarray, worker_map: dict) -> Optional[str]:
    """Returns cached result immediately, triggers background match if cache expired."""
    now = time.time()
    cached = _face_cache.get(key)

    # Return cached result if still fresh
    if cached and (now - cached[1]) < FACE_CACHE_TTL:
        return cached[0]

    # Submit background job if not already running
    if key not in _pending_face_match or _pending_face_match[key].done():
        crop_copy = person_crop.copy()
        wmap_copy = {k: {kk: vv for kk, vv in v.items() if kk != 'photo' or vv} 
                     for k, v in worker_map.items()}
        
        def run_and_cache():
            result = match_face_to_worker(crop_copy, worker_map)
            _face_cache[key] = (result, time.time())
        
        _pending_face_match[key] = _face_executor.submit(run_and_cache)

    # Return stale cache or None while background job runs
    return cached[0] if cached else None


def process_frame(frame, fps_counter, worker_map: dict = {}):
    fps_counter.update()
    person_results = person_model(frame, classes=[0], conf=0.7, verbose=False)
    person_boxes   = person_results[0].boxes.xyxy.cpu().numpy().astype(int)

    frame_area = frame.shape[0] * frame.shape[1]
    person_status = []
    vest_count = helmet_count = 0

    for box in person_boxes:
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        
        # Filter out detections that are too small (likely false positives like hands)
        box_w = x2 - x1
        box_h = y2 - y1
        box_area = box_w * box_h
        
        # Must be at least 3% of frame area and taller than wide (person shape)
        if box_area < 0.03 * frame_area:
            continue
        if box_w > box_h * 1.5:  # too wide to be a person
            continue
        person_crop = frame[y1:y2, x1:x2]

        safety_results = vest_model(person_crop, conf=0.6, verbose=False)
        max_vest_conf = max_helmet_conf = 0.0
        vest_box = helmet_box = None

        for det in safety_results[0].boxes:
            cls  = int(det.cls)
            vx1, vy1, vx2, vy2 = map(int, det.xyxy[0])
            conf = float(det.conf.item())
            item_area   = (vx2 - vx1) * (vy2 - vy1)
            person_area = (x2 - x1)   * (y2 - y1)
            if item_area > 0.05 * person_area:
                if cls == 2 and conf > max_vest_conf:
                    max_vest_conf = conf
                    vest_box = (vx1, vy1, vx2, vy2)
                elif cls == 1 and conf > max_helmet_conf:
                    max_helmet_conf = conf
                    helmet_box = (vx1, vy1, vx2, vy2)

        has_vest   = max_vest_conf > 0
        has_helmet = max_helmet_conf > 0
        if has_vest:   vest_count   += 1
        if has_helmet: helmet_count += 1

        # OCR: try to read number from vest or helmet region
        worker_number = None
        id_method = None
        ocr_crop = None
        if vest_box:
            vx1, vy1, vx2, vy2 = vest_box
            ocr_crop = person_crop[vy1:vy2, vx1:vx2]
        elif helmet_box:
            hx1, hy1, hx2, hy2 = helmet_box
            ocr_crop = person_crop[hy1:hy2, hx1:hx2]
        if ocr_crop is not None and ocr_crop.size > 0:
            worker_number = extract_worker_number(ocr_crop)
            if worker_number:
                id_method = 'ocr'

        # Face matching fallback if OCR didn't find a number - only runs on violations to save performance
        if not worker_number and worker_map and (not has_vest or not has_helmet):
            face_key = f"{x1//50}_{y1//50}"  # coarse grid key - stable across frames
            worker_number = get_cached_face_match(face_key, person_crop, worker_map)
            if worker_number:
                id_method = 'face'

        person_status.append({
            'box':           (x1, y1, x2, y2),
            'vest':          bool(has_vest),
            'vest_conf':     float(max_vest_conf),
            'vest_box':      vest_box,
            'helmet':        bool(has_helmet),
            'helmet_conf':   float(max_helmet_conf),
            'helmet_box':    helmet_box,
            'worker_number': worker_number,
            'id_method':     id_method,
        })

    return person_status, int(len(person_status)), int(vest_count), int(helmet_count), float(fps_counter.fps)

# ── Draw results ──────────────────────────────────────────────────────────────
def draw_results(frame, results, total_persons, vest_count, helmet_count, fps, worker_map: dict):
    FONT = cv2.FONT_HERSHEY_SIMPLEX
    ts   = datetime.datetime.now().strftime("%H:%M:%S")

    cv2.rectangle(frame, (10, 10), (580, 80), (0, 0, 0), -1)
    cv2.rectangle(frame, (10, 10), (580, 80), (0, 255, 255), 2)
    cv2.putText(frame, f"FPS: {fps:.1f}  {ts}", (20, 35), FONT, 0.7, (0, 255, 255), 2)
    cv2.putText(frame, f"Persons: {total_persons}  Vests: {vest_count}  Helmets: {helmet_count}", (20, 65), FONT, 0.6, (255, 255, 255), 2)

    for p in results:
        x1, y1, x2, y2 = p['box']
        has_vest   = p['vest']
        has_helmet = p['helmet']
        num        = p.get('worker_number')
        worker_name = worker_map.get(num, {}).get('name', '') if num else ''

        if has_vest and has_helmet:
            color, label = (0, 200, 0), "Safe"
        elif has_vest or has_helmet:
            color, label = (0, 140, 255), "Partial"
        else:
            color, label = (0, 0, 220), "Unsafe"

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Build label
        parts = []
        if num:
            parts.append(f"#{num}")
        if worker_name:
            parts.append(worker_name)
        parts.append(label)
        if not has_vest:   parts.append("No Vest")
        if not has_helmet: parts.append("No Helmet")
        id_method = p.get('id_method')
        if id_method:
            parts.append(f"[{id_method.upper()}]")
        text = " | ".join(parts)

        tw, th = cv2.getTextSize(text, FONT, 0.5, 2)[0]
        cv2.rectangle(frame, (x1, y1 - th - 14), (x1 + tw + 10, y1), color, -1)
        cv2.putText(frame, text, (x1 + 5, y1 - 8), FONT, 0.5, (0, 0, 0), 2)

    return frame

# ═══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/auth/login")
async def login(body: LoginRequest, response: Response):
    user = await users_col.find_one({"username": body.username})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_session(str(user["_id"]), user["username"], user["role"])
    response.set_cookie(
        SESSION_COOKIE, token,
        httponly=True,
        samesite="lax",
        max_age=86400,
        path="/"
    )
    return {"username": user["username"], "role": user["role"]}

@app.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token and token in active_sessions:
        del active_sessions[token]
    response.delete_cookie(SESSION_COOKIE)
    return {"message": "Logged out"}

@app.get("/auth/me")
async def me(request: Request):
    session = get_session(request)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"username": session["username"], "role": session["role"]}

# ═══════════════════════════════════════════════════════════════════════════════
# WORKER ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/workers")
async def list_workers(request: Request):
    require_session(request)
    workers = []
    async for w in workers_col.find():
        w["_id"] = str(w["_id"])
        workers.append(w)
    return workers

@app.post("/workers")
async def create_worker(body: WorkerCreate, request: Request):
    require_admin(request)
    existing = await workers_col.find_one({"worker_number": body.worker_number})
    if existing:
        raise HTTPException(status_code=400, detail="Worker number already exists")
    doc = {"name": body.name, "worker_number": body.worker_number, "phone": body.phone, "created_at": datetime.datetime.utcnow()}
    result = await workers_col.insert_one(doc)
    return {"id": str(result.inserted_id), "name": body.name, "worker_number": body.worker_number, "phone": body.phone}

@app.put("/workers/{worker_id}")
async def update_worker(worker_id: str, body: WorkerUpdate, request: Request):
    require_admin(request)
    update = {k: v for k, v in body.dict().items() if v is not None}
    await workers_col.update_one({"_id": ObjectId(worker_id)}, {"$set": update})
    return {"message": "Updated"}

@app.post("/workers/{worker_id}/photo")
async def upload_worker_photo(worker_id: str, request: Request, file: UploadFile = File(...)):
    require_admin(request)
    data = await file.read()
    b64 = base64.b64encode(data).decode()
    mime = file.content_type or "image/jpeg"
    photo_data = f"data:{mime};base64,{b64}"
    await workers_col.update_one({"_id": ObjectId(worker_id)}, {"$set": {"photo": photo_data}})
    return {"message": "Photo uploaded"}

@app.delete("/workers/{worker_id}/photo")
async def delete_worker_photo(worker_id: str, request: Request):
    require_admin(request)
    await workers_col.update_one({"_id": ObjectId(worker_id)}, {"$unset": {"photo": ""}})
    return {"message": "Photo deleted"}

@app.delete("/workers/{worker_id}")
async def delete_worker(worker_id: str, request: Request):
    require_admin(request)
    await workers_col.delete_one({"_id": ObjectId(worker_id)})
    return {"message": "Deleted"}

# ═══════════════════════════════════════════════════════════════════════════════
# VIOLATIONS ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/violations")
async def list_violations(request: Request, limit: int = 50):
    require_session(request)
    violations = []
    async for v in violations_col.find({}, {"snapshot": 0}).sort("timestamp", -1).limit(limit):
        v["_id"] = str(v["_id"])
        violations.append(v)
    return violations

@app.get("/violations/{violation_id}/snapshot")
async def get_snapshot(violation_id: str, request: Request):
    require_session(request)
    v = await violations_col.find_one({"_id": ObjectId(violation_id)}, {"snapshot": 1})
    if not v or not v.get("snapshot"):
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"snapshot": v["snapshot"]}

@app.delete("/violations/{violation_id}")
async def delete_violation(violation_id: str, request: Request):
    require_admin(request)
    await violations_col.delete_one({"_id": ObjectId(violation_id)})
    return {"message": "Deleted"}

@app.delete("/violations")
async def delete_all_violations(request: Request):
    require_admin(request)
    result = await violations_col.delete_many({})
    return {"message": f"Deleted {result.deleted_count} violations"}

# ═══════════════════════════════════════════════════════════════════════════════
# DETECTION ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/process_frame/")
async def process_image(request: Request, file: UploadFile = File(...), camera_id: str = "cam1"):
    require_session(request)

    image_bytes = await file.read()
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame  = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Failed to decode image")

    # Build worker lookup map from DB first
    worker_map = {}
    async for w in workers_col.find():
        worker_map[w["worker_number"]] = {"name": w["name"], "phone": w.get("phone", ""), "photo": w.get("photo")}

    results, total_persons, vest_count, helmet_count, fps = process_frame(frame, get_fps_counter(camera_id), worker_map)

    # Process violations
    now = datetime.datetime.utcnow()
    violations_found = []

    for p in results:
        num = p.get('worker_number')
        has_vest   = p['vest']
        has_helmet = p['helmet']

        if has_vest and has_helmet:
            continue  # fully compliant

        worker_info = worker_map.get(num, {}) if num else {}
        worker_name = worker_info.get('name', f"Unknown (#{num})" if num else "Unknown")

        missing = []
        if not has_vest:   missing.append("vest")
        if not has_helmet: missing.append("helmet")
        missing_str = " and ".join(missing)

        # Cooldown key: worker number if known, otherwise a single "unknown" key
        cooldown_key = num if num else "unknown"

        if _should_log(cooldown_key):
            violation = {
                "worker_number": num,
                "worker_name":   worker_name,
                "missing":       missing,
                "timestamp":     now,
                "has_vest":      has_vest,
                "has_helmet":    has_helmet,
                "camera_id":     camera_id,
                "snapshot":      f"data:image/jpeg;base64,{base64.b64encode(cv2.imencode('.jpg', frame)[1]).decode()}",
            }
            result = await violations_col.insert_one(violation)
            violations_found.append({
                "_id":           str(result.inserted_id),
                "worker_number": num,
                "worker_name":   worker_name,
                "missing":       missing,
                "timestamp":     now.isoformat(),
                "has_vest":      has_vest,
                "has_helmet":    has_helmet,
                "camera_id":     camera_id,
            })

        # WhatsApp only if missing BOTH, with its own longer cooldown
        if not has_vest and not has_helmet and _should_whatsapp(cooldown_key):
            msg = (
                f"⚠️ Safety Alert!\n"
                f"Worker: {worker_name}\n"
                f"Missing: {missing_str}\n"
                f"Time: {now.strftime('%Y-%m-%d %H:%M:%S')}"
            )
            send_whatsapp(msg)

    annotated = draw_results(frame.copy(), results, total_persons, vest_count, helmet_count, fps, worker_map)
    _, buffer  = cv2.imencode('.jpg', annotated)
    img_b64    = base64.b64encode(buffer).decode('utf-8')

    return {
        "total_persons":   total_persons,
        "vest_count":      vest_count,
        "helmet_count":    helmet_count,
        "no_vest_count":   total_persons - vest_count,
        "no_helmet_count": total_persons - helmet_count,
        "fps":             fps,
        "results":         results,
        "violations":      violations_found,
        "annotated_image": f"data:image/jpeg;base64,{img_b64}",
    }

@app.get("/")
async def root():
    return {"message": "Safety Detection API running"}

@app.get("/cameras")
async def list_cameras(request: Request):
    require_session(request)
    return [
        {"id": "cam1", "label": "Camera 1 (FaceTime)"},
        {"id": "cam2", "label": "Camera 2 (iPhone)"},
    ]

# ═══════════════════════════════════════════════════════════════════════════════
# STARTUP: seed default admin if none exists
# ═══════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def seed_admin():
    existing = await users_col.find_one({"username": "admin"})
    if not existing:
        hashed = bcrypt.hashpw(b"admin123", bcrypt.gensalt())
        await users_col.insert_one({"username": "admin", "password": hashed, "role": "admin"})
        print("✅ Default admin created: username=admin password=admin123")
    else:
        print("✅ Admin user exists")


@app.get("/analytics")
async def get_analytics(request: Request):
    require_session(request)

    pipeline = [
        {"$group": {
            "_id": None,
            "total_violations": {"$sum": 1},
            "vest_missing": {
                "$sum": {"$cond": [{"$in": ["vest", "$missing"]}, 1, 0]}
            },
            "helmet_missing": {
                "$sum": {"$cond": [{"$in": ["helmet", "$missing"]}, 1, 0]}
            }
        }}
    ]

    overall = await violations_col.aggregate(pipeline).to_list(length=1)
    overall = overall[0] if overall else {}

    # Most frequent violators (worker-wise)
    top_workers = await violations_col.aggregate([
        {"$group": {
            "_id": "$worker_name",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]).to_list(length=5)

    # Camera wise violations
    camera_stats = await violations_col.aggregate([
        {"$group": {
            "_id": "$camera_id",
            "count": {"$sum": 1}
        }}
    ]).to_list(length=10)

    # Daily trend
    daily = await violations_col.aggregate([
        {
            "$group": {
                "_id": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$timestamp"
                    }
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id": 1}}
    ]).to_list(length=100)

    return {
        "total_violations": overall.get("total_violations", 0),
        "vest_missing": overall.get("vest_missing", 0),
        "helmet_missing": overall.get("helmet_missing", 0),
        "top_workers": top_workers,
        "camera_stats": camera_stats,
        "daily_trend": daily
    }
