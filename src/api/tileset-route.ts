import { Router } from 'express';
import { listTileSets, createTileSet, updateTileSet, deleteTileSet } from './tileset-control';

// Middleware: attach from your auth middleware (e.g. requireAuth)
// Import and use your existing auth middleware here, e.g.:
// import { requireAuth } from './auth-control';

const router = Router();

// All routes require authentication (apply your auth middleware)
router.get('/',         listTileSets);
router.post('/',        createTileSet);
router.patch('/:id',    updateTileSet);
router.delete('/:id',   deleteTileSet);

export default router;
