"""
Simple test script to verify the API is working
Run this after starting the API server
"""
import requests
import os

API_URL = "http://127.0.0.1:8000"

def test_health_check():
    """Test the root endpoint"""
    try:
        response = requests.get(API_URL)
        if response.status_code == 200:
            print("✅ Health check passed:", response.json())
            return True
        else:
            print("❌ Health check failed:", response.status_code)
            return False
    except Exception as e:
        print("❌ Could not connect to API:", str(e))
        print("Make sure the API is running: uvicorn api:app --reload")
        return False

def test_image_upload():
    """Test image upload endpoint"""
    # Find a test image
    test_image_dir = "Q1/test/images"
    if os.path.exists(test_image_dir):
        images = [f for f in os.listdir(test_image_dir) if f.endswith('.jpg')]
        if images:
            test_image = os.path.join(test_image_dir, images[0])
            print(f"\n📸 Testing with image: {test_image}")
            
            try:
                with open(test_image, 'rb') as f:
                    files = {'file': f}
                    response = requests.post(f"{API_URL}/process_frame/", files=files)
                
                if response.status_code == 200:
                    result = response.json()
                    print("✅ Image processing successful!")
                    print(f"   Total Persons: {result['total_persons']}")
                    print(f"   With Vest: {result['vest_count']}")
                    print(f"   Without Vest: {result['no_vest_count']}")
                    print(f"   FPS: {result['fps']:.2f}")
                    return True
                else:
                    print("❌ Image processing failed:", response.status_code)
                    return False
            except Exception as e:
                print("❌ Error during image upload:", str(e))
                return False
        else:
            print("⚠️  No test images found in", test_image_dir)
            return None
    else:
        print("⚠️  Test image directory not found:", test_image_dir)
        return None

if __name__ == "__main__":
    print("🧪 Testing Safety Vest Detection API\n")
    print("=" * 50)
    
    # Test 1: Health check
    print("\n1. Testing API health check...")
    health_ok = test_health_check()
    
    if health_ok:
        # Test 2: Image upload
        print("\n2. Testing image processing...")
        test_image_upload()
    
    print("\n" + "=" * 50)
    print("\n✨ Testing complete!")
    print("\nIf all tests passed, your API is ready to use with the React dashboard.")
