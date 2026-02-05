# **Imprint**  | Human-in-the-Loop Crowdsourcing Platform

Imprint is a human-in-the-loop crowdsourcing application for data collection and continuous integration with machine learning model training.

### 💡 Current Use Case
> Crowd-powered labeling of sidewalk obstructions and walkability for sidewalk obstruction detection research.

### 🔧 Features
- Interactive image annotation interface
- Real-time data dashboard with annotation history

### 🔍 Project Goals
- Build a general-purpose platform for human-in-the-loop annotation tasks.
- Improve voluntary crowdsourcing by encouraging crowdworkers to contribute in the development of ML models.
- Support scalable data collection for training, validation, and testing of AI systems.

### 📦 Local Installation
1. Clone the repository
2. Pull Docker Image from _{insert link here}_
3. Run command on terminal ```docker run -p 3000:3000 -v ${PWD}:/app -v /app/node_modules --env-file .env imprint:1.0```

### 🚀 Roadmap
- [ ] Develop and deploy base and modified version of Imprint for mini-HCI study.
    - [x] ~~Create new database and upload sidewalk data~~
    - [x] ~~Modify registration to include frequently walked cities of users~~
    - [x] ~~Implement new city-based algorithm for modified version~~
    - [ ] Implement visualization after successful annotation for modified version
    - [ ] Add feedback/popups after successful annotation for modified version 
    - [ ] Reframe prompt on asking users to continue annotation session
    - [ ] Finalize overall look and feel of the platform  
- [ ] Implement video annotation through freezing the frame and stabilization.
- [ ] Implement an open-source form generator for generlizability of the crowdsourcing application.
- [ ] Develop tool to integrate annotated data for machine learning projects.

If you're interested in contributing, learning more about the current research, or have any questions, feel free to reach out at [francis_bawa@dlsu.edu.ph](mailto:francis_bawa@dlsu.edu.ph).