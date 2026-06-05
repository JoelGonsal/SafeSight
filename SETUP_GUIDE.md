# Safety Equipment Detection - Setup Guide

## Requirements
- Python 3.11+
- Node.js 18+
- MongoDB running locally on port 27017

## 1. Start MongoDB
```bash
brew services start mongodb-community
```

## 2. Backend
```bash
cd Safety-Vest-and-Helmet-Detection-main
pip3 install -r requirements.txt
uvicorn api:app --reload
```

Default admin is auto-created on first run:
- Username: `admin`
- Password: `admin123`

## 3. Frontend
```bash
cd reactapp/react
npm install
npm run dev
```

Open: http://localhost:5173

## 4. WhatsApp Alerts (optional)
Set these environment variables before starting the backend:
```bash
export TWILIO_SID="your_account_sid"
export TWILIO_TOKEN="your_auth_token"
export TWILIO_FROM="whatsapp:+14155238886"
export ADMIN_WHATSAPP="whatsapp:+91XXXXXXXXXX"
```
Sign up at https://www.twilio.com and join the WhatsApp sandbox.

## Features
- Session-based login (cookie)
- Worker profiles with vest/helmet numbers
- Live detection with OCR number reading
- Violation log with timestamps
- WhatsApp alert when worker missing both vest AND helmet
- Admin flag when worker missing only helmet
