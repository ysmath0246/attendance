import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyBbk4SiSqWANAiet8EVvTrIC21aAWBvg",
  authDomain: "myattendanceproject-45c1b.firebaseapp.com",
  projectId: "myattendanceproject-45c1b",
  storageBucket: "myattendanceproject-45c1b.appspot.com",
  messagingSenderId: "601661458034",
  appId: "1:601661458034:web:8134e270349f9a0b3a3c97"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)