// Starts the website on 127.0.0.1 (this machine only). Use a tunnel to expose it.
import { existsSync } from 'node:fs';
import { createApp } from './src/app.js';

if (existsSync(new URL('./.env', import.meta.url))) process.loadEnvFile(new URL('./.env', import.meta.url));

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const { app, stripe } = createApp();

app.listen(PORT, HOST, () => {
  console.log(`travel-demo listening on http://${HOST}:${PORT}`);
  console.log(`Payments: ${stripe.enabled ? 'Stripe TEST mode' : 'simulated (Stripe off)'}`);
  console.log(`Email: ${process.env.BREVO_API_KEY && process.env.SENDER_EMAIL ? 'Brevo configured' : 'not configured (no BREVO_API_KEY/SENDER_EMAIL in .env)'}`);
});
