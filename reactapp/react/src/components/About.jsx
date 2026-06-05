import React from 'react';
import './About.css';
import { ShieldCheck, ScanLine, Brain, FileSearch, Users } from 'lucide-react';

function About() {
  return (
    <div className="about-page">
      <div className="about-header">
        <h1>About SafeSight</h1>
        <p>
          SafeSight is an intelligent industrial safety monitoring system designed to detect
          whether workers are wearing proper Personal Protective Equipment (PPE) such as
          helmets and safety vests in real time.
        </p>
      </div>

      <div className="about-grid">
        <section className="about-card">
          <h2><ShieldCheck size={18} /> Project Overview</h2>
          <p>
            The system continuously monitors live CCTV or camera feeds from construction
            sites and industrial zones. It identifies workers, checks compliance with PPE
            safety rules, and automatically logs violations when helmets or safety vests
            are missing.
          </p>
        </section>

        <section className="about-card">
          <h2><ScanLine size={18} /> YOLOv8 Detection System</h2>
          <p>
            SafeSight uses YOLOv8 (You Only Look Once Version 8) for real-time object
            detection. The model detects workers, helmets, and safety vests directly from
            video frames with high speed and accuracy.
          </p>
          <p>
            YOLOv8 processes the image in a single pass, making it ideal for real-time
            surveillance systems where fast detection is critical.
          </p>
        </section>

        <section className="about-card">
          <h2><Brain size={18} /> Model Training</h2>
          <p>
            The model was trained using annotated PPE datasets containing images of workers
            with and without helmets and safety vests. Bounding boxes were created for
            each object class and the dataset was used to train YOLOv8 for multiple epochs
            to improve precision and recall.
          </p>
          <p>
            Training included data augmentation, validation testing, and performance
            optimization to improve real-world detection reliability.
          </p>
        </section>

        <section className="about-card">
          <h2><FileSearch size={18} /> OCR Integration</h2>
          <p>
            OCR (Optical Character Recognition) is used to identify worker IDs printed on
            helmets or safety vests. This helps the system associate violations with the
            correct worker profile.
          </p>
          <p>
            OCR improves accountability by automatically extracting identification numbers
            without requiring manual input.
          </p>
        </section>

        <section className="about-card full-width">
          <h2><Users size={18} /> Developed By</h2>
          <div className="team-list">
            <p>Joel Gonsalves — A023</p>
            <p>Parag Sarkhot — A034</p>
            <p>Aksh Soni — A006</p>
            <p>Annirudh Kejriwal — A007</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default About;
