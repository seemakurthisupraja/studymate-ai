/**
 * StudyMate AI - Backend Server
 * 
 * 
 * A clean, secure Express.js backend that handles:
 * 1. Serving frontend static files (HTML, CSS, JS)
 * 2. Securely storing and accessing the Gemini API key from environment variables (.env)
 * 3. Calling Google Gemini Generative AI to generate structured Study Notes, Quizzes, and Q&A responses
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Firebase Admin SDK (if configured in environment or service account file)
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');

let firebaseAdmin = null;
let firebaseAdminInitialized = false;

try {
  const serviceAccountEnvPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  // Resolve service account key path from env or standard locations
  let resolvedServicePath = null;
  if (serviceAccountEnvPath) {
    const candidates = [
      path.resolve(process.cwd(), serviceAccountEnvPath),
      path.resolve(__dirname, serviceAccountEnvPath),
      path.resolve(__dirname, '..', serviceAccountEnvPath),
      path.resolve(__dirname, path.basename(serviceAccountEnvPath)),
      path.resolve(serviceAccountEnvPath)
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        resolvedServicePath = cand;
        break;
      }
    }
  }

  // Fallback to default ./server/serviceAccountKey.json if not resolved from env
  if (!resolvedServicePath) {
    const defaultCandidates = [
      path.resolve(__dirname, 'serviceAccountKey.json'),
      path.resolve(process.cwd(), 'server', 'serviceAccountKey.json'),
      path.resolve(process.cwd(), 'serviceAccountKey.json')
    ];
    for (const cand of defaultCandidates) {
      if (fs.existsSync(cand)) {
        resolvedServicePath = cand;
        break;
      }
    }
  }

  const certFn = (admin.credential && admin.credential.cert)
    ? admin.credential.cert.bind(admin.credential)
    : (admin.cert ? admin.cert.bind(admin) : null);

  if (resolvedServicePath && certFn) {
    const serviceAccount = require(resolvedServicePath);
    firebaseAdmin = admin.initializeApp({
      credential: certFn(serviceAccount)
    });
    firebaseAdminInitialized = true;
    console.log('🔥 Firebase Admin SDK initialized with Service Account Key file');
  } else if (clientEmail && privateKey && projectId && certFn) {
    firebaseAdmin = admin.initializeApp({
      credential: certFn({
        projectId,
        clientEmail,
        privateKey
      })
    });
    firebaseAdminInitialized = true;
    console.log('🔥 Firebase Admin SDK initialized with environment credentials');
  } else if (projectId) {
    firebaseAdmin = admin.initializeApp({ projectId });
    firebaseAdminInitialized = true;
    console.log(`🔥 Firebase Admin SDK initialized with Project ID: ${projectId}`);
  } else {
    console.log('ℹ️ Firebase Admin SDK: Credentials not yet set in .env. Running in development token verification mode.');
  }
} catch (err) {
  console.warn('⚠️ Firebase Admin initialization notice:', err.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON body parsing with up to 20MB limit for extracted PDF text
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve static frontend assets from the root directory
app.use(express.static(path.join(__dirname, '..')));

/**
 * Authentication Middleware: verifyFirebaseToken
 * Protects AI endpoints by verifying Firebase ID Token from Authorization header
 */
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      errorCode: 'UNAUTHORIZED',
      error: 'Authentication Required',
      message: 'You must be signed in to perform this AI operation. Please sign in or create an account.'
    });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();
  if (!idToken) {
    return res.status(401).json({
      success: false,
      errorCode: 'UNAUTHORIZED',
      error: 'Invalid Token',
      message: 'Authentication token is empty or invalid.'
    });
  }

  if (firebaseAdminInitialized) {
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      req.user = decodedToken;
      return next();
    } catch (err) {
      console.error('[Auth Error] Failed to verify Firebase token:', err.message);
      return res.status(401).json({
        success: false,
        errorCode: 'TOKEN_EXPIRED_OR_INVALID',
        error: 'Unauthorized',
        message: 'Your authentication session has expired or is invalid. Please sign in again.'
      });
    }
  } else {
    // Development fallback when Firebase Admin credentials are not yet placed in .env
    req.user = { uid: 'authenticated-user', email: 'student@studymate.ai' };
    return next();
  }
}

/**
 * Helper function: Retrieve Gemini API instance with API key
 * Checks for key in:
 * 1. Request header 'x-gemini-api-key' (if provided by user via frontend settings)
 * 2. Environment variable process.env.GEMINI_API_KEY (.env file)
 */
function getGeminiClient(req) {
  const customKey = req.headers['x-gemini-api-key'];
  const envKey = process.env.GEMINI_API_KEY;
  const apiKey = customKey || envKey;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
    return null;
  }

  return new GoogleGenerativeAI(apiKey.trim());
}

/**
 * Helper function: Clean and parse JSON from Gemini's response
 * Large language models sometimes wrap JSON in markdown code fences (```json ... ```)
 */
function safeJsonParse(rawText) {
  try {
    let clean = rawText.trim();
    // Strip markdown code block if present
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    }
    return JSON.parse(clean.trim());
  } catch (error) {
    console.error('Failed to parse JSON directly. Attempting regex extract...', error.message);
    const jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Gemini response could not be parsed as JSON: ' + rawText.slice(0, 200));
  }
}

/**
 * API Route: GET /api/status
 * Health check & verification if GEMINI_API_KEY is configured
 */
app.get('/api/status', (req, res) => {
  const hasEnvKey = !!(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY.trim() !== '' &&
    process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
  );

  res.json({
    status: 'online',
    appName: 'StudyMate AI',
    version: '1.0.0',
    hasApiKey: hasEnvKey,
    hasFirebaseAuth: firebaseAdminInitialized,
    recommendedModel: 'gemini-3.5-flash'
  });
});

/**
 * API Route: GET /api/auth/config
 * Exposes non-sensitive Firebase client configuration to the frontend
 */
app.get('/api/auth/config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  });
});

/**
 * Centralized Gemini Error Handler
 * Classifies GoogleGenerativeAI errors into clean, user-friendly responses.
 * Logs full technical details only in the server console for debugging.
 */
function handleGeminiError(error, res, actionDescription = 'AI operation') {
  console.error(`[Server Console Debug] Detailed error during ${actionDescription}:`, error);

  const errorMsg = [
    error?.message,
    error?.statusText,
    typeof error === 'string' ? error : '',
    error?.errorDetails ? JSON.stringify(error.errorDetails) : ''
  ].filter(Boolean).join(' ');

  const status = error?.status || error?.statusCode || error?.code || error?.response?.status;

  // 1. Quota / Rate Limit / High Demand (429, 503, RESOURCE_EXHAUSTED)
  if (
    status === 429 ||
    status === 503 ||
    errorMsg.includes('429') ||
    errorMsg.includes('RESOURCE_EXHAUSTED') ||
    errorMsg.toLowerCase().includes('quota') ||
    errorMsg.toLowerCase().includes('rate limit') ||
    errorMsg.toLowerCase().includes('rate_limit') ||
    errorMsg.toLowerCase().includes('too many requests') ||
    errorMsg.toLowerCase().includes('resource has been exhausted') ||
    errorMsg.includes('503') ||
    errorMsg.toLowerCase().includes('high demand') ||
    errorMsg.toLowerCase().includes('overloaded')
  ) {
    return res.status(429).json({
      success: false,
      errorCode: 'QUOTA_EXHAUSTED',
      error: '⏳ AI temporarily unavailable',
      message: 'StudyMate has reached its current Gemini API usage limit. Please try again later.'
    });
  }

  // 2. 404 Model Unavailable / Not Found
  if (
    status === 404 ||
    errorMsg.includes('404') ||
    errorMsg.includes('NOT_FOUND') ||
    errorMsg.toLowerCase().includes('model is currently unavailable') ||
    errorMsg.toLowerCase().includes('not found') ||
    errorMsg.toLowerCase().includes('is not supported') ||
    (errorMsg.toLowerCase().includes('model') && errorMsg.toLowerCase().includes('unsupported'))
  ) {
    return res.status(404).json({
      success: false,
      errorCode: 'MODEL_UNAVAILABLE',
      error: 'The configured Gemini model is currently unavailable.',
      message: 'The configured Gemini model is currently unavailable.'
    });
  }

  // 3. API Key Missing / Invalid
  if (
    status === 401 ||
    status === 403 ||
    errorMsg.includes('API_KEY_INVALID') ||
    errorMsg.toLowerCase().includes('api key not valid') ||
    errorMsg.includes('PERMISSION_DENIED') ||
    errorMsg.toLowerCase().includes('invalid api key') ||
    errorMsg.toLowerCase().includes('api_key') ||
    errorMsg.toLowerCase().includes('api key')
  ) {
    return res.status(401).json({
      success: false,
      errorCode: 'API_KEY_INVALID',
      error: 'Gemini API key is missing or invalid.',
      message: 'Gemini API key is missing or invalid.'
    });
  }

  // 4. General fallback (never leak raw stack traces to the client)
  return res.status(500).json({
    success: false,
    errorCode: 'AI_ERROR',
    error: 'AI Processing Error',
    message: 'An unexpected error occurred while communicating with Gemini AI. Please try again later.'
  });
}

/**
 * API Route: POST /api/generate-notes
 * Generates structured study notes from extracted PDF text
 */
app.post('/api/generate-notes', verifyFirebaseToken, async (req, res) => {
  try {
    const genAI = getGeminiClient(req);
    if (!genAI) {
      return res.status(401).json({
        success: false,
        errorCode: 'API_KEY_INVALID',
        error: 'Gemini API key is missing or invalid.',
        message: 'Gemini API key is missing or invalid.'
      });
    }

    const { text } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        errorCode: 'EMPTY_TEXT',
        error: 'No text provided.',
        message: 'The extracted text from the PDF is empty. Please upload a PDF with readable text.'
      });
    }

    // Limit text to ~120,000 characters to fit well within context limits
    const sanitizedText = text.slice(0, 120000);

    console.log('🚀 USING GEMINI MODEL: gemini-3.5-flash');
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3
      }
    });

    const prompt = `
You are StudyMate AI, an expert academic tutor and educator.
Analyze the following study material carefully and generate comprehensive, student-friendly study notes.

Study Material:
"""
${sanitizedText}
"""

You MUST generate your output in strictly valid JSON matching the following schema:
{
  "topic": "Concise title or main topic of this document",
  "summary": "A clear, engaging, 2-3 paragraph summary written in simple student-friendly language explaining the entire document.",
  "keyPoints": [
    "Most important concept or takeaway 1",
    "Most important concept or takeaway 2",
    "Most important concept or takeaway 3",
    "Most important concept or takeaway 4",
    "Most important concept or takeaway 5",
    "Most important concept or takeaway 6",
    "Most important concept or takeaway 7",
    "Most important concept or takeaway 8"
  ],
  "definitions": [
    {
      "term": "Term or Concept Name",
      "explanation": "Clear, intuitive explanation of the term without unnecessary jargon."
    }
  ],
  "examQuestions": {
    "twoMark": [
      {
        "question": "Clear 2-mark question focusing on a direct definition or basic concept?",
        "answer": "Concise model answer (1-2 sentences)."
      },
      {
        "question": "Question 2?",
        "answer": "Answer 2"
      },
      {
        "question": "Question 3?",
        "answer": "Answer 3"
      },
      {
        "question": "Question 4?",
        "answer": "Answer 4"
      },
      {
        "question": "Question 5?",
        "answer": "Answer 5"
      }
    ],
    "fiveMark": [
      {
        "question": "5-mark analytical question (e.g., Explain working, compare two concepts, or describe steps)?",
        "answer": "Detailed model answer covering key aspects in structured points."
      },
      {
        "question": "Question 2?",
        "answer": "Answer 2"
      },
      {
        "question": "Question 3?",
        "answer": "Answer 3"
      },
      {
        "question": "Question 4?",
        "answer": "Answer 4"
      },
      {
        "question": "Question 5?",
        "answer": "Answer 5"
      }
    ],
    "tenMark": [
      {
        "question": "Comprehensive 10-mark essay/long-answer question exploring the core architecture, complete workflow, or deep theoretical evaluation?",
        "answer": "In-depth model answer outline detailing introduction, core mechanism, components, advantages/trade-offs, and conclusion."
      },
      {
        "question": "Question 2?",
        "answer": "Answer 2"
      },
      {
        "question": "Question 3?",
        "answer": "Answer 3"
      }
    ]
  },
  "quickRevision": [
    "High-yield bullet point for 5-minute pre-exam revision 1",
    "High-yield bullet point 2",
    "High-yield bullet point 3",
    "High-yield bullet point 4",
    "High-yield bullet point 5",
    "High-yield bullet point 6"
  ]
}

Important Instructions:
- Provide exactly 5 two-mark questions, 5 five-mark questions, and 3 ten-mark questions.
- Provide at least 5-8 key points and 4-8 important definitions.
- Keep explanations clear, structured, and pedagogical.
- Return ONLY the JSON object.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsedData = safeJsonParse(responseText);

    res.json({
      success: true,
      data: parsedData
    });

  } catch (error) {
    handleGeminiError(error, res, 'generate-notes');
  }
});

/**
 * API Route: POST /api/generate-quiz
 * Generates 5 Multiple-Choice Questions (MCQs) from extracted PDF text
 */
app.post('/api/generate-quiz', verifyFirebaseToken, async (req, res) => {
  try {
    const genAI = getGeminiClient(req);
    if (!genAI) {
      return res.status(401).json({
        success: false,
        errorCode: 'API_KEY_INVALID',
        error: 'Gemini API key is missing or invalid.',
        message: 'Gemini API key is missing or invalid.'
      });
    }

    const { text } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        errorCode: 'EMPTY_TEXT',
        error: 'No text provided.',
        message: 'Please upload a PDF first to generate a quiz.'
      });
    }

    const sanitizedText = text.slice(0, 100000);
    console.log('🚀 USING GEMINI MODEL: gemini-3.5-flash');
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4
      }
    });

    const prompt = `
You are StudyMate AI Quiz Master.
Generate exactly 5 high-quality multiple-choice questions (MCQs) to test a student's comprehension of the following study material.

Study Material:
"""
${sanitizedText}
"""

You MUST return strictly valid JSON matching this schema:
{
  "quizTitle": "Subject/Topic Practice Quiz",
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": [
        "A) Option description",
        "B) Option description",
        "C) Option description",
        "D) Option description"
      ],
      "correctAnswerIndex": 0,
      "correctAnswerText": "A) Option description",
      "explanation": "Clear 1-2 sentence explanation why this option is correct and why other options are incorrect."
    }
  ]
}

Instructions:
- Provide exactly 5 questions.
- Each question must have exactly 4 options labeled A), B), C), and D).
- "correctAnswerIndex" must be the zero-based index (0 for A, 1 for B, 2 for C, 3 for D).
- Ensure questions test understanding rather than trivial trivia.
- Return ONLY the JSON object.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsedData = safeJsonParse(responseText);

    res.json({
      success: true,
      data: parsedData
    });

  } catch (error) {
    handleGeminiError(error, res, 'generate-quiz');
  }
});

/**
 * API Route: POST /api/ask-question
 * Answers student questions grounded primarily on the uploaded document
 */
app.post('/api/ask-question', verifyFirebaseToken, async (req, res) => {
  try {
    const genAI = getGeminiClient(req);
    if (!genAI) {
      return res.status(401).json({
        success: false,
        errorCode: 'API_KEY_INVALID',
        error: 'Gemini API key is missing or invalid.',
        message: 'Gemini API key is missing or invalid.'
      });
    }

    const { text, question, history } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        errorCode: 'EMPTY_QUESTION',
        error: 'Question is required.',
        message: 'Please type a question to ask StudyMate.'
      });
    }

    const sanitizedText = (text || '').slice(0, 100000);
    console.log('🚀 USING GEMINI MODEL: gemini-3.5-flash');
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        temperature: 0.4
      }
    });

    const prompt = `
You are StudyMate AI, a friendly, patient, and knowledgeable personal tutor.
A student is asking you a question about their study material.

Uploaded Study Material:
"""
${sanitizedText ? sanitizedText : '(No document provided. Answer from general academic knowledge, but note that no document was uploaded.)'}
"""

Student's Question:
"${question}"

Instructions:
1. Base your answer primarily on the uploaded study material provided above.
2. If the concept is in the document, explain it clearly with student-friendly analogies, bullet points, and step-by-step breakdowns.
3. If the answer is not directly mentioned in the document, mention that it's outside the uploaded material, but still provide an accurate, helpful educational explanation.
4. Format your response cleanly using Markdown (headers, bullet points, bold key terms, and code/quote blocks if applicable).
5. Keep the tone encouraging, structured, and easy to read.
`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    res.json({
      success: true,
      answer: answer
    });

  } catch (error) {
    handleGeminiError(error, res, 'ask-question');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🎓 StudyMate AI Server running at http://localhost:${PORT}`);
  console.log(`🔑 Gemini API Key Status: ${process.env.GEMINI_API_KEY ? 'Configured in .env' : '⚠️ Missing (Add to .env or in UI Settings)'}`);
  console.log('====================================================');
});
