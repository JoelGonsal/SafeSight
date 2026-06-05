# SafeSight — Detailed AI Report

## How Artificial Intelligence Works in This Project

---

## Overview

SafeSight uses a **4-layer AI pipeline** to monitor workers in real time:

```
Layer 1 → YOLOv8n          — Detects people in the frame
Layer 2 → Custom YOLOv8n   — Detects vest and helmet on each person
Layer 3 → EasyOCR          — Reads worker ID numbers from vest/helmet
Layer 4 → DeepFace/Facenet — Identifies workers by face (fallback)
```

Each layer feeds into the next. The output of all four layers combined is a complete picture of who is in the frame, what safety gear they are wearing, and whether a violation has occurred.

---

## The AI Models

### Model 1 — YOLOv8n (Person Detector)

- **What it is:** YOLOv8 Nano — the smallest and fastest variant of the YOLOv8 family by Ultralytics
- **Pretrained on:** COCO dataset (80 classes, 118,000 images)
- **Used for:** Detecting only class `0` (person) in the full camera frame
- **Confidence threshold:** 0.70 — only detections above 70% confidence are kept
- **Why nano:** Speed is critical. The nano model runs fast enough on CPU to process ~10 frames/second, which is acceptable for real-time monitoring

### Model 2 — Custom YOLOv8n (Safety Gear Detector)

- **What it is:** YOLOv8 Nano fine-tuned on a custom safety gear dataset
- **Trained on:** Roboflow dataset — "vest-and-helmet-detection" (CC BY 4.0)
- **3 classes:**
  - Class `0` = No Vest (person without vest)
  - Class `1` = person_with_helmet
  - Class `2` = person_with_vest
- **Confidence threshold:** 0.60
- **Input:** Not the full frame — only the cropped region of each detected person
- **Why crop-based:** Running the model on a tight person crop is more accurate than running it on the full frame. The model focuses only on the relevant area, reducing background noise and false positives

### Model 3 — EasyOCR (Text Recognition)

- **What it is:** Deep learning OCR engine based on CRAFT (text detection) + CRNN (text recognition)
- **Used for:** Reading worker ID numbers printed on vests or helmets
- **Language:** English digits only (`allowlist='0123456789'`)
- **Confidence threshold:** 0.30

### Model 4 — DeepFace / Facenet (Face Recognition)

- **What it is:** DeepFace is a Python wrapper around multiple face recognition models. This project uses the **Facenet** model
- **Facenet architecture:** Deep CNN trained by Google to produce 128-dimensional face embeddings
- **Used for:** Identifying which worker is in frame when OCR fails
- **Distance threshold:** 0.60 — faces with embedding distance below 0.60 are considered a match
- **Detector backend:** OpenCV (fast, CPU-friendly)

---

## Training the Custom YOLO Model

### `train.py`

```python
model = YOLO("yolov8n.pt")
results = model.train(
    data="Q1/data.yaml",
    epochs=100,
    imgsz=640,
    batch=8,
    device="cpu",
    project="Q1/runs/detect",
    name="vest_helmet_final",
    augment=True
)
```

This script fine-tunes the pretrained YOLOv8n model on the safety gear dataset. Here is what each parameter means:

| Parameter | Value | Meaning |
|---|---|---|
| `data` | Q1/data.yaml | Points to dataset config (train/val/test paths + class names) |
| `epochs` | 100 | Train for 100 full passes over the dataset |
| `imgsz` | 640 | Resize all images to 640×640 pixels before training |
| `batch` | 8 | Process 8 images at a time per gradient update |
| `device` | cpu | Run on CPU (no GPU available) |
| `augment` | True | Apply random augmentations to training images |
| `exist_ok` | True | Overwrite previous training run if it exists |

### `data.yaml` — Dataset Configuration

```yaml
train: ../train/images
val:   ../valid/images
test:  ../test/images
nc: 3
names: ['No Vest', 'person_with_helmet', 'person_with_vest']
```

Defines where the training images are, how many classes exist (3), and what they are called. YOLOv8 reads this file to know what it is learning to detect.

### Training Hyperparameters (from `args.yaml`)

| Hyperparameter | Value | Purpose |
|---|---|---|
| `lr0` | 0.01 | Initial learning rate — how big each weight update step is |
| `lrf` | 0.01 | Final learning rate (cosine decay target) |
| `momentum` | 0.937 | SGD momentum — smooths gradient updates |
| `weight_decay` | 0.0005 | L2 regularization — prevents overfitting |
| `warmup_epochs` | 3.0 | Gradually ramp up LR for first 3 epochs |
| `warmup_bias_lr` | 0.1 | Higher LR for bias params during warmup |
| `box` | 7.5 | Loss weight for bounding box regression |
| `cls` | 0.5 | Loss weight for class prediction |
| `dfl` | 1.5 | Loss weight for distribution focal loss |
| `iou` | 0.7 | IoU threshold for NMS (non-max suppression) |
| `patience` | 10 | Stop early if no improvement for 10 epochs |
| `close_mosaic` | 10 | Disable mosaic augmentation in last 10 epochs |
| `amp` | true | Automatic mixed precision (faster training) |

### Data Augmentations Applied During Training

| Augmentation | Value | What it does |
|---|---|---|
| `fliplr` | 0.5 | 50% chance of horizontal flip |
| `hsv_h` | 0.015 | Random hue shift ±1.5% |
| `hsv_s` | 0.7 | Random saturation shift ±70% |
| `hsv_v` | 0.4 | Random brightness shift ±40% |
| `translate` | 0.1 | Random translation ±10% |
| `scale` | 0.5 | Random scale ±50% |
| `mosaic` | 1.0 | Mosaic augmentation (4 images combined) — always on |
| `erasing` | 0.4 | Random erasing of 40% of image patches |
| `auto_augment` | randaugment | Applies random policy of augmentations |

These augmentations make the model robust to different lighting conditions, camera angles, distances, and partial occlusions.

### Training Performance (from `results.csv`)

The model trained for 43 epochs before early stopping (patience=10 with no improvement):

| Metric | Epoch 1 | Epoch 20 | Epoch 43 (Final) |
|---|---|---|---|
| Train Box Loss | 2.002 | 1.720 | 1.449 |
| Train Class Loss | 3.356 | 1.525 | 1.053 |
| Train DFL Loss | 1.864 | 1.560 | 1.357 |
| Precision | 0.013 | 0.561 | 0.522 |
| Recall | 0.637 | 0.591 | 0.593 |
| mAP@50 | 0.131 | 0.540 | 0.540 |
| mAP@50-95 | 0.047 | 0.207 | 0.218 |

- All three loss values steadily decreased — the model was learning
- mAP@50 (mean Average Precision at IoU=0.5) reached ~0.54 — reasonable for a 3-class detector on CPU
- Training stopped at epoch 43 because validation metrics plateaued (early stopping triggered)
- The `best.pt` file saved is the checkpoint with the highest mAP@50 across all epochs

---

## AI Pipeline — Step by Step

### Step 1 — Frame Arrives

The browser captures a JPEG frame from the webcam every 100ms and POSTs it to `/process_frame/`. The backend decodes it:

```python
np_arr = np.frombuffer(image_bytes, np.uint8)
frame  = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
```

`cv2.imdecode` converts the raw JPEG bytes into a NumPy array of shape `(height, width, 3)` in BGR color format. This is the raw pixel data that all AI models will work on.

---

### Step 2 — `get_ocr()` — Lazy OCR Loader

```python
def get_ocr():
    global _ocr_reader
    if _ocr_reader is None:
        _ocr_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _ocr_reader
```

**What it does:** EasyOCR takes 3–5 seconds to initialize its neural network models (CRAFT + CRNN). Loading it at server startup would slow down the boot. This function uses the lazy initialization pattern — the OCR engine is only loaded the first time it is actually needed. After that, `_ocr_reader` is already set so every subsequent call returns instantly.

**Parameters:**
- `['en']` — load English language model only
- `gpu=False` — run on CPU (no GPU available)
- `verbose=False` — suppress initialization logs

---

### Step 3 — `process_frame(frame, fps_counter, worker_map)` — The Core AI Function

This is the central function that orchestrates all AI models. It is called once per frame.

```python
def process_frame(frame, fps_counter, worker_map: dict = {}):
```

**What it receives:**
- `frame` — NumPy BGR image array from the camera
- `fps_counter` — FPS_counter instance for this camera
- `worker_map` — dict of all workers from MongoDB, keyed by worker number

#### 3a — FPS Update

```python
fps_counter.update()
```

Ticks the FPS counter. Records the current timestamp and computes `1 / elapsed_seconds` since the last frame. This gives a real-time measurement of how fast the AI pipeline is processing frames.

#### 3b — Person Detection (YOLOv8n)

```python
person_results = person_model(frame, classes=[0], conf=0.7, verbose=False)
person_boxes   = person_results[0].boxes.xyxy.cpu().numpy().astype(int)
```

**What happens inside YOLOv8:**
1. The full frame is resized to 640×640 (model's expected input size)
2. The image passes through the YOLOv8n backbone (CSPDarknet) — a series of convolutional layers that extract features at multiple scales
3. The neck (PANet) combines features from different scales to detect objects at different sizes
4. The detection head outputs bounding boxes, class probabilities, and confidence scores for every grid cell
5. Non-Maximum Suppression (NMS) removes overlapping boxes, keeping only the best one per object

`classes=[0]` tells the model to only return detections for class 0 (person). All other 79 COCO classes are ignored.

The result is a list of bounding boxes in `[x1, y1, x2, y2]` format (top-left and bottom-right pixel coordinates).

#### 3c — Size Filtering (False Positive Removal)

```python
box_area = box_w * box_h
if box_area < 0.03 * frame_area:
    continue
if box_w > box_h * 1.5:
    continue
```

YOLOv8n sometimes detects hands, faces, or background objects as "person". Two geometric rules filter these out:

- **Area rule:** The bounding box must cover at least 3% of the total frame area. A person standing in a typical workplace scene will always be larger than this. Hands, faces, and small background figures are smaller.
- **Aspect ratio rule:** A standing person is always taller than they are wide. If the box width is more than 1.5× the height, it cannot be a standing person — it is likely a horizontal object or a false positive.

#### 3d — Safety Gear Detection (Custom YOLO)

```python
person_crop = frame[y1:y2, x1:x2]
safety_results = vest_model(person_crop, conf=0.6, verbose=False)
```

For each valid person, the exact pixel region of that person is cropped out of the frame using NumPy array slicing. The custom YOLO model then runs on this crop — not the full frame.

**Why crop-based detection is better:**
- The model sees only the person, not background clutter
- The person fills more of the 640×640 input, giving the model more detail to work with
- Reduces false positives from other people's gear appearing in the detection zone

The model returns detections for 3 classes:
- Class `0` = No Vest
- Class `1` = person_with_helmet
- Class `2` = person_with_vest

#### 3e — Gear Area Validation

```python
item_area   = (vx2 - vx1) * (vy2 - vy1)
person_area = (x2 - x1)   * (y2 - y1)
if item_area > 0.05 * person_area:
```

Even within the person crop, the model can produce tiny spurious detections. This rule requires the detected vest or helmet to cover at least 5% of the person's bounding box area. A real vest covers the torso — it will always be a significant fraction of the person's area. A 2-pixel noise detection will not pass this check.

#### 3f — Best Detection Selection

```python
if cls == 2 and conf > max_vest_conf:
    max_vest_conf = conf
    vest_box = (vx1, vy1, vx2, vy2)
elif cls == 1 and conf > max_helmet_conf:
    max_helmet_conf = conf
    helmet_box = (vx1, vy1, vx2, vy2)
```

If the model detects multiple vest regions (possible when a person is partially occluded), only the highest-confidence detection is kept. Same for helmets. This ensures one vest box and one helmet box per person at most.

---

### Step 4 — `extract_worker_number(crop)` — OCR Worker Identification

```python
def extract_worker_number(crop: np.ndarray) -> Optional[str]:
    if crop.size == 0:
        return None
    results = get_ocr().readtext(crop, detail=1, allowlist='0123456789')
    for (bbox, text, conf) in results:
        text = text.strip()
        if re.match(r'^\d+$', text) and conf > 0.3:
            return text
    return None
```

**What it does:** Takes the vest or helmet bounding box crop and tries to read a worker ID number from it.

**How EasyOCR works internally:**
1. **CRAFT (Character Region Awareness for Text Detection):** A CNN that produces a heatmap showing where characters are likely located in the image. It detects individual character regions and groups them into word-level bounding boxes.
2. **CRNN (Convolutional Recurrent Neural Network):** Takes each detected text region and reads the characters using a combination of CNN (feature extraction) + BiLSTM (sequence modeling) + CTC decoder (converts sequence probabilities to text).

**Parameters used:**
- `detail=1` — return bounding box, text, and confidence for each detection
- `allowlist='0123456789'` — restrict the character set to digits only. This dramatically improves accuracy for worker numbers because the model doesn't waste probability mass on letters

**Validation rules:**
- `re.match(r'^\d+$', text)` — the entire string must be digits, no letters or symbols
- `conf > 0.3` — at least 30% confidence. Low threshold because vest numbers can be partially obscured or at an angle

**Where the crop comes from:**
```python
if vest_box:
    ocr_crop = person_crop[vy1:vy2, vx1:vx2]   # vest region
elif helmet_box:
    ocr_crop = person_crop[hy1:hy2, hx1:hx2]   # helmet region
```

Vest is preferred over helmet because vest numbers are typically larger and more readable.

---

### Step 5 — `match_face_to_worker(person_crop, worker_map)` — Face Recognition

```python
def match_face_to_worker(person_crop: np.ndarray, worker_map: dict) -> Optional[str]:
```

Called only when OCR fails AND the person has a violation (missing vest or helmet). Running face recognition on every person every frame would be too slow.

**Step-by-step process:**

**1. Filter workers with photos:**
```python
workers_with_photos = {num: info for num, info in worker_map.items() if info.get('photo')}
if not workers_with_photos:
    return None
```
If no workers have photos uploaded, skip immediately.

**2. Save person crop to temp file:**
```python
with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
    cv2.imwrite(f.name, person_crop)
    crop_path = f.name
```
DeepFace requires file paths, not NumPy arrays. The person crop is written to a temporary JPEG file on disk.

**3. For each worker with a photo:**
```python
photo_str = info['photo']
if ',' in photo_str:
    photo_str = photo_str.split(',')[1]   # strip "data:image/jpeg;base64," prefix
photo_bytes = base64.b64decode(photo_str)
worker_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
cv2.imwrite(worker_path, worker_img)
```
The worker photo is stored in MongoDB as a base64 data URL. This code strips the prefix, decodes the base64 back to bytes, decodes the JPEG to a NumPy array, and saves it as a temp file.

**4. DeepFace verification:**
```python
result = DeepFace.verify(
    crop_path, worker_path,
    model_name='Facenet',
    detector_backend='opencv',
    enforce_detection=False,
    silent=True
)
```

**What Facenet does internally:**
- Facenet is a deep CNN (Inception-ResNet architecture) trained by Google on millions of face images
- It maps any face image to a 128-dimensional embedding vector in "face space"
- Faces of the same person cluster close together in this space; different people are far apart
- `DeepFace.verify` computes the Euclidean distance between the two embedding vectors
- If the distance is below the threshold, the faces are considered the same person

**Parameters:**
- `model_name='Facenet'` — use Google's Facenet model
- `detector_backend='opencv'` — use OpenCV's Haar cascade for face detection (fast, CPU-friendly)
- `enforce_detection=False` — don't crash if no face is detected in the crop (person may be turned away)
- `silent=True` — suppress verbose output

**5. Best match selection:**
```python
if result['verified'] and result['distance'] < best_distance:
    best_distance = result['distance']
    best_match    = worker_num
```
Keeps track of the closest matching worker. The threshold starts at 0.6 — only workers with distance below 0.6 are considered. If multiple workers match, the one with the smallest distance wins.

**6. Cleanup:**
```python
os.unlink(worker_path)   # delete worker temp file
os.unlink(crop_path)     # delete person crop temp file
```
Temp files are always deleted in the `finally` block to prevent disk accumulation.

---

### Step 6 — `get_cached_face_match(key, person_crop, worker_map)` — Face Match Cache

```python
def get_cached_face_match(key: str, person_crop: np.ndarray, worker_map: dict) -> Optional[str]:
```

Face recognition takes 1–3 seconds per person (comparing against all worker photos). At 10 FPS, calling it every frame would make the system completely unresponsive. This function solves that with a two-layer caching + background threading strategy.

**Cache key:**
```python
face_key = f"{x1//50}_{y1//50}"
```
The key is the person's screen position divided by 50 pixels. This creates a coarse grid — a person can move up to 50 pixels and still hit the same cache entry. This makes the key stable across frames even when the person moves slightly.

**Cache check:**
```python
cached = _face_cache.get(key)
if cached and (now - cached[1]) < FACE_CACHE_TTL:   # 10 seconds
    return cached[0]
```
If a result exists and is less than 10 seconds old, return it immediately. No AI computation needed.

**Background job submission:**
```python
if key not in _pending_face_match or _pending_face_match[key].done():
    def run_and_cache():
        result = match_face_to_worker(crop_copy, worker_map)
        _face_cache[key] = (result, time.time())
    _pending_face_match[key] = _face_executor.submit(run_and_cache)
```
If the cache is expired, submit `match_face_to_worker` to a `ThreadPoolExecutor` with 1 worker thread. This runs in the background without blocking the main API response. When it finishes, it writes the result to `_face_cache`. The next frame will pick it up from cache.

**Return while waiting:**
```python
return cached[0] if cached else None
```
While the background job is running, return the stale cached result (or None). The API response is never blocked waiting for face recognition.

---

### Step 7 — `draw_results(frame, results, ...)` — Visual Annotation

```python
def draw_results(frame, results, total_persons, vest_count, helmet_count, fps, worker_map):
```

After all AI processing is done, this function draws the results onto the frame using OpenCV drawing functions.

**Stats panel (top-left):**
```python
cv2.rectangle(frame, (10, 10), (580, 80), (0, 0, 0), -1)      # black fill
cv2.rectangle(frame, (10, 10), (580, 80), (0, 255, 255), 2)    # cyan border
cv2.putText(frame, f"FPS: {fps:.1f}  {ts}", ...)
cv2.putText(frame, f"Persons: {total_persons}  Vests: {vest_count}  Helmets: {helmet_count}", ...)
```
Draws a black rectangle with a cyan border, then writes FPS, timestamp, and detection counts inside it.

**Per-person bounding boxes:**
```python
if has_vest and has_helmet:
    color, label = (0, 200, 0), "Safe"       # Green
elif has_vest or has_helmet:
    color, label = (0, 140, 255), "Partial"  # Orange
else:
    color, label = (0, 0, 220), "Unsafe"     # Red
```

Color coding:
- Green = fully compliant (both vest and helmet)
- Orange = partial compliance (one item missing)
- Red = non-compliant (both missing)

**Label construction:**
```python
parts = []
if num:         parts.append(f"#{num}")          # worker number
if worker_name: parts.append(worker_name)         # worker name from DB
parts.append(label)                               # Safe/Partial/Unsafe
if not has_vest:   parts.append("No Vest")
if not has_helmet: parts.append("No Helmet")
if id_method:   parts.append(f"[{id_method.upper()}]")  # [OCR] or [FACE]
text = " | ".join(parts)
```

Example label: `#42 | John Smith | Unsafe | No Vest | No Helmet | [FACE]`

The label background is drawn first (filled rectangle in the detection color), then the text is drawn in black on top for readability.

---

## AI Decision Logic Summary

```
For each person detected in frame:

  ┌─ Has vest AND helmet?
  │     YES → color=Green, label="Safe", no violation
  │
  └─ Missing vest OR helmet (or both)?
        │
        ├─ Try OCR on vest/helmet region
        │     Found number? → id_method = 'OCR'
        │
        ├─ OCR failed? → Try face match (background thread, cached 10s)
        │     Found match? → id_method = 'FACE'
        │
        ├─ Cooldown check (10s per worker)
        │     Passed? → Save violation + snapshot to MongoDB
        │
        └─ Missing BOTH vest AND helmet?
              Cooldown check (300s per worker)
                Passed? → Send WhatsApp alert via Twilio
```

---

## AI Performance Characteristics

| Aspect | Detail |
|---|---|
| Frame rate | ~8–12 FPS on CPU (MacBook Air M-series) |
| Person detection latency | ~30–50ms per frame (YOLOv8n) |
| Gear detection latency | ~20–40ms per person crop |
| OCR latency | ~100–300ms per crop (first call loads model) |
| Face match latency | 1–3 seconds per person (runs in background) |
| Face cache TTL | 10 seconds (reuses result without re-running) |
| Violation cooldown | 10 seconds per worker (prevents DB spam) |
| WhatsApp cooldown | 300 seconds per worker (prevents alert spam) |
| Model size (best.pt) | ~6MB (YOLOv8n nano) |
| Training epochs | 43 (early stopped from 100) |
| Final mAP@50 | ~0.54 |

---

## AI Limitations

1. **CPU-only inference** — No GPU acceleration. On a GPU, frame rate would be 5–10× higher.
2. **OCR accuracy** — Worker numbers must be clearly printed and visible to the camera. Dirty, worn, or small-print vests will fail OCR.
3. **Face recognition accuracy** — Requires a clear frontal face photo uploaded for each worker. Workers wearing masks, hard hats covering the face, or turned away will not be identified.
4. **Single-angle detection** — The model was trained on standard workplace images. Extreme angles (overhead cameras, very close range) may reduce accuracy.
5. **Lighting sensitivity** — Despite augmentation during training, very dark environments or strong backlighting can reduce detection confidence.
6. **3-class limitation** — The model only knows vest, helmet, and no-vest. It cannot detect other PPE like gloves, goggles, or safety boots.
