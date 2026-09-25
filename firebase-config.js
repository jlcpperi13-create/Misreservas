// Configuración de Firebase para MisReservas
// Sustituye estos valores por los de TU proyecto Firebase
// (Firebase Console → Configuración del proyecto → Tus apps → Config)

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDLPq--g_lAwa-dUSbKR17P-z0h694kPsw",
  authDomain: "misreservas-2d3a7.firebaseapp.com",
  projectId: "misreservas-2d3a7",
  storageBucket: "misreservas-2d3a7.firebasestorage.app",
  messagingSenderId: "552584306003",
  appId: "1:552584306003:web:76656c84c173e86dcf55a6",
  measurementId: "G-9FMTGE3LYJ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
