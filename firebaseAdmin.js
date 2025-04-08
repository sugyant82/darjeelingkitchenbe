// firebaseAdmin.js
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

const serviceAccountPath = path.resolve('darjeelingmomonz-67dce-firebase-adminsdk-fbsvc-ff7648782c.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
