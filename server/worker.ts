import dotenv from 'dotenv';
dotenv.config();

import { runStandaloneWorker } from './queue/notificationWorker.ts';

runStandaloneWorker().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
