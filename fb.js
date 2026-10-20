// Shared Firebase handle for public pages
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
const firebaseConfig = {
  apiKey:            "AIzaSyCSG85Yy2QdOMNmrunf4xp-3WsTG_e7w2I",
  authDomain:        "swiftfreight-8c922.firebaseapp.com",
  projectId:         "swiftfreight-8c922",
  storageBucket:     "swiftfreight-8c922.firebasestorage.app",
  messagingSenderId: "606390365828",
  appId:             "1:606390365828:web:7419fc6378346137d7dcd1",
  measurementId:     "G-9W80DT31FF"
};
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db  = getFirestore(app);
export const DEFAULTS = {
  brand: "Swift Air Cargo",
  email: "swiftfreightlogistics2026@gmail.com",
  phone: "+31657446248",
  whatsapp: "+31657446248",
  hours: "24/7",
  offices: [{ name: "Head Office", address: "New York City, USA" }],
  waMessage: "Hello Swift Air Cargo 👋 I'd like to talk to a human about my order processes.",
  chatEnabled: true,
  chatGreeting: "Hi 👋 I'm the Swift Air Cargo assistant. How can I help you today?"
};
