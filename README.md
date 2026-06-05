# SafeSight - AI Powered PPE Compliance Monitoring System

## Overview

SafeSight is an AI-powered workplace safety monitoring system designed to detect Personal Protective Equipment (PPE) compliance in real time. The system uses computer vision, OCR, and facial recognition technologies to identify workers, detect safety violations, and generate alerts automatically.

It helps construction sites, factories, warehouses, and industrial environments improve worker safety by ensuring that helmets and safety vests are worn correctly at all times.

## Features

* Real-time person detection using YOLOv8
* Helmet detection using a custom-trained YOLOv8 model
* Safety vest detection using a custom-trained YOLOv8 model
* Worker identification through OCR-based worker number recognition
* DeepFace-powered facial recognition fallback
* Automatic safety violation detection
* Violation evidence snapshot storage
* MongoDB database integration
* WhatsApp alert notifications using Twilio
* Multi-camera monitoring support
* Analytics dashboard for safety insights
* Role-based authentication system
* Worker management with photo uploads

## Technology Stack

### Frontend

* React.js
* Axios
* Lucide React
* CSS

### Backend

* FastAPI
* Python
* OpenCV
* EasyOCR
* DeepFace
* Twilio API

### AI Models

* YOLOv8 Person Detection
* Custom YOLOv8 Helmet Detection
* Custom YOLOv8 Safety Vest Detection
* EasyOCR Text Recognition
* FaceNet (via DeepFace)

### Database

* MongoDB

## System Workflow

1. CCTV cameras capture live video frames.
2. YOLOv8 detects workers in the frame.
3. Custom YOLOv8 models detect helmets and safety vests.
4. OCR extracts worker numbers from helmets or vests.
5. If OCR fails, DeepFace performs facial recognition.
6. Safety violations are identified automatically.
7. Violation data and snapshots are stored in MongoDB.
8. WhatsApp alerts are sent to supervisors.
9. Analytics dashboard displays safety statistics.

## Project Structure

```text
SafeSight/
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── main.py
│   ├── models/
│   ├── uploads/
│   └── requirements.txt
│
├── screenshots/
├── README.md
└── .gitignore
```

## Installation

### Clone Repository

```bash
git clone git@github.com:JoelGonsal/SafeSight.git
cd SafeSight
```

### Backend Setup

```bash
pip install -r requirements.txt
```

Create a `.env` file:

```env
MONGO_URL=mongodb://localhost:27017

TWILIO_SID=YOUR_TWILIO_SID
TWILIO_TOKEN=YOUR_TWILIO_TOKEN
TWILIO_FROM=YOUR_TWILIO_NUMBER
ADMIN_WHATSAPP=whatsapp:+91XXXXXXXXXX
```

Run the FastAPI server:

```bash
uvicorn main:app --reload
```

### Frontend Setup

```bash
npm install
npm run dev
```

## Analytics Provided

* Total violations
* Helmet violations
* Vest violations
* Worker-wise violation frequency
* Camera-wise violation statistics
* Daily safety trends

## Applications

* Construction Sites
* Manufacturing Plants
* Warehouses
* Mining Operations
* Industrial Facilities
* Smart Factory Safety Monitoring

## Advantages

* Automated PPE compliance monitoring
* Reduces manual supervision
* Real-time safety alerts
* Accurate worker identification
* Centralized violation tracking

## Limitations

* Performance depends on camera quality
* OCR accuracy may decrease with blurry images
* Facial recognition requires clear face visibility
* Large worker databases can increase processing time
* Requires stable network connectivity

## Future Scope

* Cloud deployment support
* Mobile application integration
* Attendance tracking system
* Worker behavior analysis
* Safety score prediction using AI
* Edge AI deployment on CCTV devices
* Email and SMS notifications
* Multi-site monitoring dashboard

## Authors

Developed by Joel Gonsalves , Parag Sarkhot , Aksh Soni

## License

This project is developed for educational and research purposes.
