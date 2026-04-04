import { Request, Response } from 'express';
import TileSet, { DEFAULT_POOL, TILE_TOKENS } from './tileset-model';

function sanitizeTiles(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tok of TILE_TOKENS) {
    const v = raw[tok];
    out[tok] = (typeof v === 'number' && v >= 0) ? Math.floor(v) : 0;
  }
  return out;
}

/** GET /tile-sets — list user's sets (+ default system set) */
export async function listTileSets(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    const sets = await TileSet.find({ userId }).sort({ createdAt: 1 }).lean();

    // Prepend the built-in default set (not stored in DB)
    const defaultSet = {
      id: 'default',
      name: 'A-Math Standard',
      tiles: DEFAULT_POOL,
      isDefault: true,
    };

    const result = [
      defaultSet,
      ...sets.map(s => ({
        id: s._id.toString(),
        name: s.name,
        tiles: Object.fromEntries((s.tiles as any).entries ? (s.tiles as any).entries() : Object.entries(s.tiles)),
        isDefault: false,
      })),
    ];

    res.json({ tileSets: result });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
}

/** POST /tile-sets — create a new set */
export async function createTileSet(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    const { name, tiles } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });
    if (!tiles || typeof tiles !== 'object') return res.status(400).json({ message: 'tiles object is required' });

    const sanitized = sanitizeTiles(tiles as Record<string, unknown>);

    const set = await TileSet.create({ userId, name: name.trim(), tiles: sanitized });

    res.status(201).json({
      tileSet: { id: set._id.toString(), name: set.name, tiles: sanitized, isDefault: false },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
}

/** PATCH /tile-sets/:id — update name and/or tiles */
export async function updateTileSet(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    const set = await TileSet.findOne({ _id: id, userId });
    if (!set) return res.status(404).json({ message: 'Tile set not found' });

    const { name, tiles } = req.body;
    if (name?.trim()) set.name = name.trim();
    if (tiles && typeof tiles === 'object') set.tiles = sanitizeTiles(tiles as Record<string, unknown>);

    await set.save();
    res.json({
      tileSet: {
        id: set._id.toString(),
        name: set.name,
        tiles: Object.fromEntries((set.tiles as any).entries ? (set.tiles as any).entries() : Object.entries(set.tiles)),
        isDefault: false,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
}

/** DELETE /tile-sets/:id */
export async function deleteTileSet(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    const result = await TileSet.deleteOne({ _id: id, userId });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Tile set not found' });

    res.json({ message: 'Deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
}
