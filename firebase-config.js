/**
 * StudyMate AI – Firebase Client Authentication Module
 * 
 * Manages:
 * 1. Firebase client initialization with environment or custom config
 * 2. Email/Password Authentication (Sign in, Sign up, Session persistence)
 * 3. Google Sign-In via Popup
 * 4. User profile state and ID token extraction for protected backend API calls
 * 5. Human-friendly authentication error parsing
 */

// Fallback configuration if not provided via server environment variables
window.__FIREBASE_CONFIG__ = window.__FIREBASE_CONFIG__ || {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const StudyMateAuth = {
  initialized: false,
  auth: null,
  currentUser: null,
  authStateCallbacks: [],

  /**
   * Initialize Firebase Client SDK
   */
  async init() {
    if (this.initialized) return;

    try {
      // 1. Fetch public client configuration from server
      let config = window.__FIREBASE_CONFIG__;
      try {
        const res = await fetch('/api/auth/config');
        if (res.ok) {
          const serverConfig = await res.json();
          if (serverConfig && serverConfig.apiKey) {
            config = { ...config, ...serverConfig };
          }
        }
      } catch (e) {
        console.log('Using local/stored Firebase client configuration.');
      }

      // 2. Check if config has required API key
      if (!config.apiKey || config.apiKey.trim() === '') {
        console.warn('⚠️ Firebase Client: No API key found. Authentication running in demo/mock mode.');
        this.initialized = true;
        this.notifyAuthState(null);
        return;
      }

      // 3. Initialize Firebase app if not already initialized
      if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
        this.auth = firebase.auth();

        // 4. Set persistence to LOCAL so users remain logged in across page refreshes
        await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        // 5. Listen for auth state changes
        this.auth.onAuthStateChanged((user) => {
          this.currentUser = user;
          this.notifyAuthState(user);
        });

        this.initialized = true;
        console.log('🎓 StudyMate Firebase Authentication ready.');
      } else {
        console.error('Firebase SDK scripts not loaded.');
      }
    } catch (err) {
      console.error('Firebase initialization error:', err);
    }
  },

  /**
   * Check if Firebase is genuinely configured with an active API Key
   */
  isConfigured() {
    return !!(this.auth && this.initialized);
  },

  /**
   * Subscribe to auth state updates
   */
  onAuthStateChanged(callback) {
    if (typeof callback === 'function') {
      this.authStateCallbacks.push(callback);
      if (this.initialized) {
        callback(this.currentUser);
      }
    }
  },

  /**
   * Notify all registered auth listeners
   */
  notifyAuthState(user) {
    this.authStateCallbacks.forEach(cb => {
      try {
        cb(user);
      } catch (err) {
        console.error('Auth state callback error:', err);
      }
    });
  },

  /**
   * Email/Password Login
   */
  async loginWithEmail(email, password) {
    if (!this.auth) {
      throw new Error('Firebase Authentication is not configured yet. Please add your Firebase configuration in .env or firebase-config.js.');
    }
    const userCredential = await this.auth.signInWithEmailAndPassword(email.trim(), password);
    return userCredential.user;
  },

  /**
   * Email/Password Registration
   */
  async registerWithEmail(name, email, password) {
    if (!this.auth) {
      throw new Error('Firebase Authentication is not configured yet. Please add your Firebase configuration in .env or firebase-config.js.');
    }
    const userCredential = await this.auth.createUserWithEmailAndPassword(email.trim(), password);
    const user = userCredential.user;

    // Update display name
    if (name && name.trim()) {
      await user.updateProfile({
        displayName: name.trim()
      });
    }

    return user;
  },

  /**
   * Google Sign-In
   */
  async loginWithGoogle() {
    if (!this.auth) {
      throw new Error('Firebase Authentication is not configured yet. Please add your Firebase configuration in .env or firebase-config.js.');
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    const result = await this.auth.signInWithPopup(provider);
    return result.user;
  },

  /**
   * Password Reset via Firebase Authentication
   */
  async resetPassword(email) {
    if (!this.auth) {
      throw new Error('Firebase Authentication is not configured.');
    }

    return await this.auth.sendPasswordResetEmail(email.trim());
  },

  /**
   * Logout
   */
  async logout() {
    if (this.auth) {
      await this.auth.signOut();
    }
    this.currentUser = null;
    this.notifyAuthState(null);
  },

  /**
   * Get Current User ID Token (for Authorization: Bearer <token>)
   */
  async getIdToken() {
    if (this.currentUser) {
      return await this.currentUser.getIdToken();
    }
    if (this.auth && this.auth.currentUser) {
      return await this.auth.currentUser.getIdToken();
    }
    return null;
  },

  /**
   * Format Firebase Authentication Errors into Clean, Friendly Academic Messages
   */
  formatAuthError(error) {
    if (!error) return 'An unknown error occurred during authentication.';
    const code = error.code || '';
    const msg = error.message || '';

    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password. Please check your credentials and try again.';
      case 'auth/email-already-in-use':
        return 'An account with this email address already exists. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters long.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address (e.g. name@university.edu).';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Google sign-in was cancelled before completion.';
      case 'auth/popup-blocked':
        return 'The Google sign-in window was blocked by your browser. Please allow popups for this site.';
      case 'auth/network-request-failed':
        return 'Network connection issue. Please check your internet connection and try again.';
      case 'auth/too-many-requests':
        return 'Access temporarily disabled due to multiple failed login attempts. Please reset your password or try again later.';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled in the Firebase Console. Please enable Email/Password or Google in Authentication -> Sign-in method.';
      default:
        return msg.replace(/^Firebase:\s*/i, '').trim() || 'Authentication failed. Please try again.';
    }
  }
};

// Initialize as soon as DOM and Firebase scripts are ready
if (typeof window !== 'undefined') {
  window.StudyMateAuth = StudyMateAuth;
  document.addEventListener('DOMContentLoaded', () => {
    StudyMateAuth.init();
  });
}
