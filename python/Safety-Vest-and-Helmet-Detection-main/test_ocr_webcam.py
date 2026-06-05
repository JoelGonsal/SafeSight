"""
OCR test - saves a test image with numbers and reads it back.
Also tests on any image you provide as argument.
Usage:
  python3 test_ocr_webcam.py              # tests with synthetic image
  python3 test_ocr_webcam.py image.jpg    # tests on your image
"""
import easyocr
import cv2
import numpy as np
import sys

print("Initializing OCR...")
reader = easyocr.Reader(['en'], gpu=False, verbose=False)

if len(sys.argv) > 1:
    # Test on provided image
    frame = cv2.imread(sys.argv[1])
    if frame is None:
        print(f"Could not read image: {sys.argv[1]}")
        sys.exit(1)
    print(f"Testing on: {sys.argv[1]}")
else:
    # Create synthetic test image with numbers
    frame = np.ones((200, 400, 3), dtype=np.uint8) * 255
    cv2.putText(frame, '10', (100, 130), cv2.FONT_HERSHEY_SIMPLEX, 4, (0, 0, 0), 8)
    cv2.imwrite('/tmp/ocr_test.jpg', frame)
    print("Testing with synthetic image (number '10')")
    print("Saved to /tmp/ocr_test.jpg")

print("\n--- All text detected ---")
results = reader.readtext(frame, detail=1)
if not results:
    print("No text detected at all - image may be too blurry or number too small")
else:
    for (bbox, text, conf) in results:
        print(f"  Text: '{text}'  Confidence: {conf:.2f}")

print("\n--- Numbers only (no confidence filter) ---")
numbers = reader.readtext(frame, detail=1, allowlist='0123456789')
if not numbers:
    print("No numbers detected - try a clearer/closer photo of just the number")
else:
    for (bbox, text, conf) in numbers:
        print(f"  Number: '{text}'  Confidence: {conf:.2f}")

print("\n--- Tip: crop the image to just the number for better results ---")
