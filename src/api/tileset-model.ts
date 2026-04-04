import mongoose, { Document, Schema } from 'mongoose';

// Tile tokens supported by A-Math
export const TILE_TOKENS = [
  '0','1','2','3','4','5','6','7','8','9',
  '10','11','12','13','14','15','16','17','18','19','20',
  '+','-','×','÷','+/-','×/÷','=','?',
] as const;

export type TileToken = typeof TILE_TOKENS[number];

// Default A-Math tile pool (read-only reference)
export const DEFAULT_POOL: Record<TileToken, number> = {
  '0':0, '1':4, '2':4, '3':4, '4':4, '5':4, '6':4, '7':4, '8':4, '9':4,
  '10':1,'11':1,'12':1,'13':1,'14':1,'15':1,'16':1,'17':1,'18':1,'19':1,'20':1,
  '+':4, '-':4, '×':4, '÷':4, '+/-':4, '×/÷':4, '=':11, '?':2,
};

export interface ITileSet extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  tiles: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const TileSetSchema = new Schema<ITileSet>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  tiles: {
    type: Map,
    of: Number,
    required: true,
  },
}, {
  timestamps: true,
});

TileSetSchema.index({ userId: 1, name: 1 });

export default mongoose.model<ITileSet>('TileSet', TileSetSchema);
