// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {getFirestore} from 'firebase/firestore'

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDWfh3HDO6n-6tnuhV20p_3ZZxYga5W9_w",
  authDomain: "geminiai-cb2ee.firebaseapp.com",
  projectId: "geminiai-cb2ee",
  storageBucket: "geminiai-cb2ee.appspot.com",  // fixed this line
  messagingSenderId: "795677813194",
  appId: "1:795677813194:web:2160e9033d3e105443c733",
  measurementId: "G-CL4Y789VHV"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const auth = getAuth(app);
const googleprovider = new GoogleAuthProvider();

const database = getFirestore(app)

export { auth, googleprovider, database };
