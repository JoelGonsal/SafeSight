"""
Quick OCR test - hold a number in front of your webcam and run this.
It captures one frame and tries to read all text from it.
"""
import easyocr
import cv2

print("Initializing OCR...")
reader = easyocr.Reader(['en'], gpu=False, verbose=False)

print("Capturing from webcam...")
cap = cv2.VideoCapture(0)
import time; time.sleep(1)  # let camera warm up
ret, frame = cap.read()
cap.release()

if not ret:
    print("Failed to capture from webcam")
    exit()

cv2.imwrite("/tmp/ocr_test_frame.jpg", frame)
print("Frame saved to /tmp/ocr_test_frame.jpg")

print("\n--- All text detected in frame ---")
results = reader.readtext(frame, detail=1)
if not results:
    print("No text detected at all")
else:
    for (bbox, text, conf) in results:
        print(f"  Text: '{text}'  Confidence: {conf:.2f}")

print("\n--- Numbers only ---")
numbers = reader.readtext(frame, detail=1, allowlist='0123456789')
if not numbers:
    print("No numbers detected")
else:
    for (bbox, text, conf) in numbers:
        print(f"  Number: '{text}'  Confidence: {conf:.2f}")
