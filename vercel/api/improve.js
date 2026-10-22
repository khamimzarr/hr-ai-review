// Vercel Function — POST /api/improve
// Backend Node murni (migrasi dari GAS). Lihat _backend.js.
export const maxDuration = 120; // Hobby max 300; 120 = headroom di atas budget improve 90s
export const dynamic = 'force-dynamic';

import handler from './_backend.js';

export default async (req, res) => {
  return handler.handleAction(req, res, 'improve');
};
