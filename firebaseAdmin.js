// firebaseAdmin.js
import admin from 'firebase-admin';

const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FB_PROJECT_ID,
  private_key_id: process.env.FB_PRIVATE_KEY_ID,
  private_key: process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FB_CLIENT_EMAIL,
  client_id: process.env.FB_CLIENT_ID,
  FB_AUTH_URI: 'https://accounts.google.com/o/oauth2/auth',
  FB_TOKEN_URI: 'https://oauth2.googleapis.com/token',
  FB_AUTH_PROVIDER_X509_CERT_URL: 'https://www.googleapis.com/oauth2/v1/certs',
  FB_CLIENT_X509_CERT_URL: process.env.FIREBASE_CLIENT_CERT_URL,
  FB_UNIVERSE_DOMAIN: 'googleapis.com'
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
