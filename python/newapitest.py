# backend.py
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import os
import time
import base64

# Fix for PyTorch 2.6+ weights loading
import torch
if hasattr(torch.serialization, 'add_safe_globals'):
    from ultralytics.nn.tasks import DetectionModel
    torch.serialization.add_safe_globals([DetectionModel])

from ultralytics import YOLO

# -----------------------------
# Load Models
# -----------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VEST_MODEL_PATH = os.path.join(
    SCRIPT_DIR,
    "Q1",
    "runs",
    "detect",
    "vest_helmet_final",
    "weights",
    "best.pt"
)

if not os.path.exists(VEST_MODEL_PATH):
    print(f"Error: Model not found at {VEST_MODEL_PATH}")
    exit()

vest_model = YOLO(VEST_MODEL_PATH)
person_model = YOLO("yolov8n.pt")

# -----------------------------
# FastAPI App
# -----------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# FPS Counter
# -----------------------------
class FPSCounter:
    def __init__(self):
        self.prev_time = 0
        self.curr_time = 0
        self.fps = 0

    def update(self):
        self.curr_time = time.time()
        if self.prev_time > 0:
            self.fps = 1 / (self.curr_time - self.prev_time)
        self.prev_time = self.curr_time
        return self.fps


global_fps_counter = FPSCounter()

# -----------------------------
# Frame Skip Settings
# -----------------------------
FRAME_SKIP = 3
frame_count = 0
last_results = None
last_counts = (0, 0, 0, 0)


# -----------------------------
# Frame Processing
# -----------------------------
def process_frame(frame, fps_counter):

    # Resize frame to 480p
    h, w = frame.shape[:2]
    new_height = 480
    new_width = int((new_height / h) * w)
    frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_LINEAR)

    fps_counter.update()

    # Person detection
    person_results = person_model(frame, classes=[0], conf=0.6, imgsz=480, verbose=False)
    person_boxes = person_results[0].boxes.xyxy.cpu().numpy().astype(int)

    person_status = []
    vest_count = 0
    helmet_count = 0

    for box in person_boxes:

        x1, y1, x2, y2 = map(int, box)

        person_crop = frame[y1:y2, x1:x2]

        if person_crop.size == 0:
            continue

        safety_results = vest_model(person_crop, conf=0.6, imgsz=320, verbose=False)

        max_vest_conf = 0.0
        max_helmet_conf = 0.0
        vest_box = None
        helmet_box = None

        for sbox in safety_results[0].boxes:

            cls = int(sbox.cls)
            vx1, vy1, vx2, vy2 = map(int, sbox.xyxy[0])
            conf = float(sbox.conf.item())

            item_area = (vx2 - vx1) * (vy2 - vy1)
            person_area = (x2 - x1) * (y2 - y1)

            if item_area > 0.05 * person_area:

                if cls == 2 and conf > max_vest_conf:
                    max_vest_conf = conf
                    vest_box = (vx1, vy1, vx2, vy2)

                elif cls == 1 and conf > max_helmet_conf:
                    max_helmet_conf = conf
                    helmet_box = (vx1, vy1, vx2, vy2)

        has_vest = max_vest_conf > 0
        has_helmet = max_helmet_conf > 0

        if has_vest:
            vest_count += 1
        if has_helmet:
            helmet_count += 1

        person_status.append({
            "box": (x1, y1, x2, y2),
            "vest": bool(has_vest),
            "vest_conf": float(max_vest_conf),
            "vest_box": vest_box,
            "helmet": bool(has_helmet),
            "helmet_conf": float(max_helmet_conf),
            "helmet_box": helmet_box
        })

    return person_status, len(person_status), vest_count, helmet_count, fps_counter.fps


# -----------------------------
# Draw Results
# -----------------------------
def draw_results(frame, results, total_persons, vest_count, helmet_count, fps):

    COLOR_NO_SAFETY = (0, 0, 255)
    COLOR_INFO = (0, 255, 255)
    DISPLAY_FONT = cv2.FONT_HERSHEY_SIMPLEX

    import datetime
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")

    fps_text = f"FPS: {fps:.1f} | {timestamp}"
    status_text = f"Persons: {total_persons} | Vests: {vest_count} | Helmets: {helmet_count}"

    cv2.rectangle(frame, (10, 10), (550, 80), (0, 0, 0), -1)
    cv2.rectangle(frame, (10, 10), (550, 80), COLOR_INFO, 2)

    cv2.putText(frame, fps_text, (20, 35), DISPLAY_FONT, 0.7, COLOR_INFO, 2)
    cv2.putText(frame, status_text, (20, 65), DISPLAY_FONT, 0.6, (255, 255, 255), 2)

    for person in results:

        x1, y1, x2, y2 = person["box"]

        has_vest = person["vest"]
        has_helmet = person["helmet"]

        if has_vest and has_helmet:
            color = (0, 255, 0)
            status = "Safe"

        elif has_vest or has_helmet:
            color = (0, 165, 255)
            status = "Partial"

        else:
            color = COLOR_NO_SAFETY
            status = "Unsafe"

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        details = []

        if has_vest:
            details.append(f"Vest {person['vest_conf']:.2f}")
        else:
            details.append("No Vest")

        if has_helmet:
            details.append(f"Helmet {person['helmet_conf']:.2f}")
        else:
            details.append("No Helmet")

        label = f"{status} - {', '.join(details)}"

        text_size = cv2.getTextSize(label, DISPLAY_FONT, 0.5, 2)[0]

        cv2.rectangle(frame, (x1, y1-30), (x1 + text_size[0] + 10, y1), color, -1)

        cv2.putText(frame, label, (x1+5, y1-10), DISPLAY_FONT, 0.5, (0,0,0), 2)

    return frame


# -----------------------------
# API Endpoint
# -----------------------------
@app.post("/process_frame/")
async def process_image(file: UploadFile = File(...)):

    global frame_count, last_results, last_counts

    image_bytes = await file.read()
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if frame is None:
        return {"error": "Invalid frame"}

    frame_count += 1

    if frame_count % FRAME_SKIP == 0 or last_results is None:

        results, total_persons, vest_count, helmet_count, fps = process_frame(
            frame,
            global_fps_counter
        )

        last_results = results
        last_counts = (total_persons, vest_count, helmet_count, fps)

    else:

        results = last_results
        total_persons, vest_count, helmet_count, fps = last_counts

    annotated_frame = draw_results(
        frame.copy(),
        results,
        total_persons,
        vest_count,
        helmet_count,
        fps
    )

    _, buffer = cv2.imencode(".jpg", annotated_frame)
    img_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "total_persons": total_persons,
        "vest_count": vest_count,
        "helmet_count": helmet_count,
        "no_vest_count": total_persons - vest_count,
        "no_helmet_count": total_persons - helmet_count,
        "fps": fps,
        "results": results,
        "annotated_image": f"data:image/jpeg;base64,{img_base64}"
    }


@app.get("/")
async def root():
    return {"message": "Safety Vest Detection API Running"}