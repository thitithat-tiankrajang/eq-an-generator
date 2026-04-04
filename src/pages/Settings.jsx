import { useState, useEffect } from 'react';
import { api } from '@/api/apiClient';
import { POOL_DEF } from '@/lib/bingoGenerator';
import { Settings2, Plus, Pencil, Trash2, X, Check, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

// ── Tile token groups for display ─────────────────────────────────────────────
const TILE_GROUPS = [
  { label: 'Digits', tokens: ['0','1','2','3','4','5','6','7','8','9'] },
  { label: 'Tens',   tokens: ['10','11','12','13','14','15','16','17','18','19','20'] },
  { label: 'Operators', tokens: ['+','-','×','÷','+/-','×/÷'] },
  { label: 'Special',   tokens: ['=','?'] },
];

const ALL_TOKENS = TILE_GROUPS.flatMap(g => g.tokens);

function emptyTiles() {
  return Object.fromEntries(ALL_TOKENS.map(t => [t, 0]));
}

function tilesFromPool(pool) {
  const out = emptyTiles();
  for (const t of ALL_TOKENS) out[t] = pool[t] ?? 0;
  return out;
}

// ── Tile count editor ─────────────────────────────────────────────────────────
function TileEditor({ tiles, onChange, readOnly = false }) {
  return (
    <div className="space-y-3">
      {TILE_GROUPS.map(group => (
        <div key={group.label}>
          <div className="text-[9px] tracking-[0.25em] uppercase font-mono text-stone-400 mb-2">
            {group.label}
          </div>
          <div className="flex flex-wrap gap-2">
            {group.tokens.map(tok => (
              <div key={tok} className="flex flex-col items-center gap-1">
                <div className="w-9 h-9 bg-amber-50 border-2 border-amber-200 rounded-lg flex items-center justify-center font-mono font-bold text-[11px] text-amber-800">
                  {tok}
                </div>
                {readOnly ? (
                  <span className="font-mono text-[11px] font-bold text-stone-600 w-9 text-center">
                    {tiles[tok] ?? 0}
                  </span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={tiles[tok] ?? 0}
                    onChange={e => onChange({ ...tiles, [tok]: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-9 text-center font-mono text-[11px] font-bold border border-stone-200 rounded bg-white focus:border-amber-400 outline-none py-0.5"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Create / Edit modal ───────────────────────────────────────────────────────
function TileSetModal({ initial, onSave, onClose }) {
  const isEdit = !!initial?.id && initial.id !== 'default';
  const [name, setName] = useState(initial?.name ?? '');
  const [tiles, setTiles] = useState(initial ? tilesFromPool(initial.tiles) : tilesFromPool(POOL_DEF));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      if (isEdit) {
        const res = await api.tileSets.update(initial.id, { name: name.trim(), tiles });
        onSave(res.tileSet);
      } else {
        const res = await api.tileSets.create({ name: name.trim(), tiles });
        onSave(res.tileSet);
      }
      toast.success(isEdit ? 'Tile set updated' : 'Tile set created');
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const copyFromDefault = () => setTiles(tilesFromPool(POOL_DEF));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-stone-900">{isEdit ? 'Edit Tile Set' : 'New Tile Set'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600">Set Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Custom Set" />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-600">Tile Counts</span>
            <button
              type="button"
              onClick={copyFromDefault}
              className="flex items-center gap-1 text-xs text-amber-600 hover:underline"
            >
              <Copy className="w-3 h-3" /> Copy from Standard
            </button>
          </div>

          <TileEditor tiles={tiles} onChange={setTiles} />
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-green-700 hover:bg-green-600">
            {saving ? 'Saving…' : <><Check className="w-4 h-4 mr-1" />{isEdit ? 'Save Changes' : 'Create'}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────
export default function Settings() {
  const [tileSets, setTileSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { mode: 'create' | 'edit', initial? }
  const [expanding, setExpanding] = useState(null); // id of set being previewed

  useEffect(() => {
    api.tileSets.list()
      .then(res => setTileSets(res.tileSets || []))
      .catch(() => {
        // Fallback: just show default
        setTileSets([{ id: 'default', name: 'A-Math Standard', tiles: POOL_DEF, isDefault: true }]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = (saved) => {
    setTileSets(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
    setModal(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this tile set?')) return;
    try {
      await api.tileSets.delete(id);
      setTileSets(prev => prev.filter(s => s.id !== id));
      toast.success('Tile set deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 to-amber-50/30 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Settings</h1>
            <p className="text-stone-500 text-sm">Manage tile bag presets and game defaults</p>
          </div>
        </div>

        {/* Tile Sets section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-stone-800 text-sm">Tile Bag Presets</h2>
            <Button
              size="sm"
              onClick={() => setModal({ mode: 'create' })}
              className="bg-green-700 hover:bg-green-600 text-white text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> New Set
            </Button>
          </div>

          <div className="space-y-3">
            {loading && [1, 2].map(i => (
              <div key={i} className="h-16 bg-amber-50 rounded-xl animate-pulse" />
            ))}

            {!loading && tileSets.map(set => (
              <Card key={set.id} className="border border-stone-200 shadow-none overflow-hidden">
                <CardContent className="p-0">
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-800 text-sm">{set.name}</span>
                        {set.isDefault && (
                          <span className="text-[9px] font-bold tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 font-mono mt-0.5">
                        Total tiles: {Object.values(set.tiles).reduce((a, b) => a + b, 0)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setExpanding(expanding === set.id ? null : set.id)}
                        className="text-xs text-stone-400 hover:text-stone-600 px-2 py-1 rounded hover:bg-stone-50"
                      >
                        {expanding === set.id ? '▲ Hide' : '▼ View'}
                      </button>
                      {!set.isDefault && (
                        <>
                          <button
                            onClick={() => setModal({ mode: 'edit', initial: set })}
                            className="p-1.5 rounded hover:bg-stone-50 text-stone-400 hover:text-stone-700"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(set.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded tile view */}
                  {expanding === set.id && (
                    <div className="border-t border-stone-100 px-4 py-4 bg-stone-50/50">
                      <TileEditor tiles={tilesFromPool(set.tiles)} onChange={() => {}} readOnly />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>

      {modal && (
        <TileSetModal
          initial={modal.initial}
          onSave={handleSaved}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
