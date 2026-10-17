import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { askGemini } from './callable/askGemini.js';
export { getProfile } from './callable/getProfile.js';
export { health } from './callable/health.js';
