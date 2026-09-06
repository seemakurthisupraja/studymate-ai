# StudyMate AI 🎓

> An AI-powered study companion that transforms PDF study material into structured notes, exam questions, quizzes, and an interactive AI tutor.

## 🌐 Live Application

**StudyMate AI** is deployed as a full-stack web application using **Render**.

The application allows students to:

- Upload PDF study material
- Extract text directly in the browser
- Generate AI-powered study notes
- Generate exam-oriented questions
- Take interactive quizzes
- Ask questions about uploaded study material
- Sign in securely using Firebase Authentication

---

## 📖 Project Overview

**StudyMate AI** is a beginner-friendly full-stack Generative AI application designed to help students study more efficiently.

Students can upload textbooks, lecture notes, research papers, syllabus material, or other educational PDFs. The application extracts the text using **PDF.js** and sends the extracted content to a Node.js/Express backend.

The backend securely communicates with the **Google Gemini API** and generates structured educational content.

The application combines:

- Generative AI
- PDF text extraction
- Firebase Authentication
- Node.js
- Express.js
- Vanilla JavaScript
- HTML5
- CSS3

---

## ❓ Problem Statement

Students often have to study large amounts of unstructured material before examinations.

Common problems include:

1. Reading hundreds of pages takes considerable time.
2. Creating concise study notes manually is difficult.
3. Students may not know which topics are important for examinations.
4. Creating practice questions manually is time-consuming.
5. Students may need quick explanations of difficult concepts.

**StudyMate AI** addresses these problems by converting study material into structured and interactive learning resources.

---

## 🎯 Objectives

The main objectives of StudyMate AI are:

- Convert PDF study material into concise study notes.
- Generate important examination questions.
- Provide quick revision material.
- Generate interactive multiple-choice quizzes.
- Provide an AI tutor for questions related to uploaded material.
- Provide secure user authentication.
- Keep the Gemini API key on the backend rather than exposing it in frontend code.
- Provide a simple and beginner-friendly user interface.

---

# ✨ Key Features

## 1. 📄 PDF Upload and Text Extraction

Users can upload PDF documents through the application.

The application uses **PDF.js** to:

- Read PDF files in the browser.
- Extract text page by page.
- Process multi-page study material.
- Display document information such as page count and extracted text statistics.

PDF processing is performed on the client side, reducing unnecessary file transfers to the backend.

---

## 2. 📝 AI Study Notes

StudyMate AI generates structured study notes from uploaded material.

Generated content includes:

### Summary

A simple student-friendly explanation of the uploaded material.

### Key Points

Important concepts and takeaways extracted from the study material.

### Definitions

Important technical terms and concepts with easy-to-understand explanations.

### Exam Questions

The application generates:

- **5 Two-Mark Questions**
- **5 Five-Mark Questions**
- **3 Ten-Mark Questions**

These questions are designed to help students prepare for different examination patterns.

### Quick Revision

A short collection of high-yield points for last-minute revision.

---

## 3. 🧪 Interactive Practice Quiz

StudyMate AI can generate a practice quiz from uploaded study material.

Each quiz contains:

- 5 multiple-choice questions
- 4 options per question
- Correct answer identification
- Answer explanations
- Interactive answer selection
- Score tracking
- Quiz completion feedback
- Retake functionality

The quiz is designed to encourage **active recall** rather than passive reading.

---

## 4. 💬 Ask StudyMate – AI Tutor

The application includes an interactive AI tutor.

Students can ask questions about their uploaded study material.

The AI tutor:

- Uses the uploaded material as the primary context.
- Explains difficult concepts in simple language.
- Provides step-by-step explanations when appropriate.
- Uses bullet points and structured responses.
- Can provide examples and analogies.
- Indicates when a question is outside the uploaded material.

This makes StudyMate AI useful as a personal study assistant.

---

## 5. 🔐 Firebase Authentication

StudyMate AI uses **Firebase Authentication** for user authentication.

Supported authentication functionality includes:

- User registration
- Email/password sign-in
- Google sign-in
- Password reset
- Authentication state handling
- Protected AI operations

AI-related backend endpoints require authentication before processing requests.

---

## 6. 📥 Export and Copy Features

StudyMate AI provides convenient ways to use generated content outside the application.

Users can:

- Copy generated content.
- Copy individual sections.
- Download study material as Markdown.
- Print study material.
- Save the printed version as PDF using the browser's print functionality.

---

# 🏗️ System Architecture

The application follows a simple full-stack architecture.

```text
                    ┌──────────────────────┐
                    │       Student        │
                    │    Web / Mobile      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     StudyMate AI     │
                    │      Frontend        │
                    │ HTML / CSS / JS      │
                    └──────────┬───────────┘
                               │
                    PDF.js Text Extraction
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Firebase Auth     │
                    │   Authentication     │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Node.js + Express  │
                    │     Backend API      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Google Gemini    │
                    │     Generative AI    │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Generated Study    │
                    │ Notes / Quiz / Tutor │
                    └──────────────────────┘
---


🔄 Application Workflow
1. User opens StudyMate AI
              ↓
2. User signs in / creates an account
              ↓
3. User uploads a PDF
              ↓
4. PDF.js extracts text in the browser
              ↓
5. User selects an AI feature
              ↓
6. Frontend sends authenticated request
              ↓
7. Express backend verifies authentication
              ↓
8. Backend sends study material to Gemini
              ↓
9. Gemini generates educational content
              ↓
10. Backend returns the result
              ↓
11. Frontend displays the generated content
---

💻 Technologies Used
| Technology              | Purpose                               |
| ----------------------- | ------------------------------------- |
| HTML5                   | Application structure                 |
| CSS3                    | Styling and responsive interface      |
| Vanilla JavaScript      | Frontend application logic            |
| Node.js                 | Backend runtime                       |
| Express.js              | Backend REST API                      |
| Firebase Authentication | User authentication                   |
| Firebase Admin SDK      | Backend authentication verification   |
| Google Gemini API       | Generative AI                         |
| PDF.js                  | Client-side PDF text extraction       |
| Marked.js               | Markdown rendering                    |
| dotenv                  | Environment variable management       |
| CORS                    | Cross-origin request handling         |
| Render                  | Application deployment                |
| Git & GitHub            | Version control and source management |
 ---
📂 Project Structure

StudyMate-AI/
│
├── index.html
├── style.css
├── script.js
├── firebase-config.js
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── README.md
│
├── server/
│   └── server.js
│
└── sample-materials/
    └── sample-study-material.pdf
---
🚀 Getting Started

Prerequisites
Node.js v18 or higher
A Google Gemini API key
A Firebase project with Authentication enabled

1. Clone the Repository
git clone https://github.com/seemakurthisupraja/studymate-ai.git
Navigate into the project:
cd studymate-ai
2. Install Dependencies
npm install
---
🔑 Environment Configuration
Create a .env file in the project root.
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
Firebase server credentials should also be configured through environment variables when deploying the backend.
---
🏃 Running Locally
Start the application:
npm start
The application will run on:
http://localhost:3000
For development with automatic server restart:
npm run dev
---
🧪 Testing the Application

After signing in:

Upload a PDF study material.
Wait for PDF.js to extract the text.
Click Generate Study Notes.
Review the generated summary and key points.
Check the exam questions.
Open the Practice Quiz.
Take the five-question quiz.
Use Ask StudyMate to ask questions about the uploaded material.
Try the copy, download, and print features.
---
🧠 AI Prompt Engineering

StudyMate AI uses carefully structured prompts to generate consistent educational content.

Study Notes Generation

The backend asks Gemini to generate:

Summary
Key points
Definitions
Two-mark questions
Five-mark questions
Ten-mark questions
Quick revision points

The response is requested in structured JSON format so the frontend can reliably display the generated content.
---

Practice Quiz Generation

The application asks Gemini to generate exactly:

5 questions
4 options per question
Correct answer index
Correct answer text
Explanation

This allows the frontend quiz engine to provide immediate feedback.
---

Ask StudyMate

The AI tutor receives:

Uploaded study material
Student's question
Relevant conversation context

The prompt instructs Gemini to primarily use the uploaded material and clearly indicate when a question is outside the document.
---

🔒 Security

StudyMate AI follows several security practices:

Gemini API credentials are stored on the backend.
.env files are excluded from Git.
Firebase ID tokens are verified by the backend.
AI endpoints require authentication.
Extracted PDF text is limited before being sent to Gemini.
Firebase service account credentials are excluded from version control.
Sensitive credentials are stored as environment variables during deployment.
---

☁️ Deployment

StudyMate AI is deployed using Render.

The deployment uses:

GitHub
   ↓
Render
   ↓
Node.js / Express Server
   ↓
StudyMate AI Frontend
   ↓
Google Gemini API

Environment variables such as the Gemini API key and Firebase credentials are configured through the Render dashboard rather than committed to the repository.
---

📱 Responsive Design

StudyMate AI uses responsive CSS so the application can adapt to different screen sizes, including:

Desktop computers
Laptops
Tablets
Mobile phones

The interface is designed to maintain usability across different viewport sizes.
---

🔮 Future Enhancements

Possible future improvements include:

🎙️ Text-to-Speech Audio Notes
🗂️ Interactive Flashcards
🌐 Multi-Language Support
📊 Advanced Study Analytics
📝 More customizable quiz modes
📚 Study history and saved notes
🤖 Personalized learning recommendations
📤 Export to Notion and Anki
---

📄 License

This project is licensed under the MIT License.
---

👩‍💻 Author

Supraja Seemakurthi
---
StudyMate AI – Learn smarter with AI.
---