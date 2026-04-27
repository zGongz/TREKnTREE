import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCTSESMBKGLmTat5J9U6qVbRptBijFt1dU",
  authDomain: "trekntree.firebaseapp.com",
  projectId: "trekntree",
  storageBucket: "trekntree.firebasestorage.app",
  messagingSenderId: "420947329090",
  appId: "1:420947329090:web:f08217ebc77a7a0741eddb",
  measurementId: "G-L2S9HMHNP3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// THESE MUST HAVE "export" IN FRONT OF THEM!
export const auth = getAuth(app);
export const db = getFirestore(app);