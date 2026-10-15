import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { health } from './callable/health.js';
