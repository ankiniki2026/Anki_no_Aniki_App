// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAWJeS4wpsVEZp9OS5yxb7tf_BpURNKhRw",
  authDomain: "wordapp-1.firebaseapp.com",
  projectId: "wordapp-1",
  storageBucket: "wordapp-1.firebasestorage.app",
  messagingSenderId: "147501756963",
  appId: "1:147501756963:web:f6200254351144b7bf7796"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// initializeFirestore with persistent local cache for automatic offline queue & sync
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, 'default');