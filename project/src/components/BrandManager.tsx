import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Save,
  ImageIcon,
  Tag as TagIcon,
  Sparkles,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

type Brand = {
  id: string;
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  color: string;
  color2: string;
  text_on_color: 'white' | 'dark';
  offer_badge: string;
  discount_percent: number;
  denominations: number[];
  min_amount: number;
  max_amount: number;
  trending: boolean;
  popularity: number;
  is_active: boolean;
  logo_url: string;
  banner_url: string;
  occasions: string[];
  created_at: string;
};

const CATEGORIES = ['Shopping', 'Fashion', 'Beauty', 'Food & Dining', 'Travel', 'Entertainment'];

const OCCASIONS = [
  'Birthday',
  'Anniversary',
  'Wedding',
  'Festival',
  'Graduation',
  'Thank You',
  'Congratulations',
  'Just Because',
];

type Draft = {
  name: string;
  slug: string;
  category: string;
  tagline: string;
  description: string;
  color: string;
  color2: string;
  text_on_color: 'white' | 'dark';
  offer_badge: string;
  discount_percent: string;
  min_amount: string;
  max_amount: string;
  trending: boolean;
  popularity: string;
  is_active: boolean;
  logo_url: string;
  banner_url: string;
  occasions: string[];
  denominations: number[];
};

const emptyDraft: Draft = {
  name: '',
  slug: '',
  category: CATEGORIES[0],
  tagline: '',
  description: '',
  color: '#7C3AED',
  color2: '#4C1D95',
  text_on_color: 'white',
  offer_badge: '',
  discount_percent: '0',
  min_amount: '100',
  max_amount: '10000',
  trending: false,
  popularity: '0',
  is_active: true,
  logo_url: '',
  banner_url: '',
  occasions: [],
  denominations: [],
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function brandToDraft(b: Brand): Draft {
  return {
    name: b.name,
    slug: b.slug,
    category: b.category,
    tagline: b.tagline,
    description: b.description,
    color: b.color,
    color2: b.color2,
    text_on_color: b.text_on_color,
    offer_badge: b.offer_badge,
    discount_percent: String(b.discount_percent),
    min_amount: String(b.min_amount),
    max_amount: String(b.max_amount),
    trending: b.trending,
    popularity: String(b.popularity),
    is_active: b.is_active,
    logo_url: b.logo_url,
    banner_url: b.banner_url,
    occasions: b.occasions ?? [],
    denominations: b.denominations ?? [],
  };
}

export default function BrandManager() {
  const { push } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [slugTouched, setSlugTouched] = useState(false);
  const [denomInput, setDenomInput] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchBrands = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBrands((data ?? []) as Brand[]);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to load brands', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return brands;
    const q = search.trim().toLowerCase();
    return brands.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q)
    );
  }, [brands, search]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setSlugTouched(false);
    setDenomInput('');
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (b: Brand) => {
    setEditingId(b.id);
    setDraft(brandToDraft(b));
    setSlugTouched(true);
    setDenomInput('');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const handleNameChange = (value: string) => {
    setDraft((d) => ({
      ...d,
      name: value,
      slug: slugTouched ? d.slug : slugify(value),
    }));
  };

  const addDenomination = () => {
    const val = Number(denomInput);
    if (!val || val <= 0) return;
    if (draft.denominations.includes(val)) {
      setDenomInput('');
      return;
    }
    setDraft((d) => ({
      ...d,
      denominations: [...d.denominations, val].sort((a, b) => a - b),
    }));
    setDenomInput('');
  };

  const removeDenomination = (val: number) => {
    setDraft((d) => ({ ...d, denominations: d.denominations.filter((v) => v !== val) }));
  };

  const toggleOccasion = (occasion: string) => {
    setDraft((d) => ({
      ...d,
      occasions: d.occasions.includes(occasion)
        ? d.occasions.filter((o) => o !== occasion)
        : [...d.occasions, occasion],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedName = draft.name.trim();
    const trimmedSlug = slugify(draft.slug || draft.name);

    if (!trimmedName || !trimmedSlug) {
      setFormError('Brand name is required.');
      return;
    }
    if (draft.denominations.length === 0) {
      setFormError('Add at least one denomination amount.');
      return;
    }
    const minAmount = Number(draft.min_amount);
    const maxAmount = Number(draft.max_amount);
    if (!minAmount || !maxAmount || minAmount > maxAmount) {
      setFormError('Min amount must be a positive number and not greater than max amount.');
      return;
    }

    const payload = {
      name: trimmedName,
      slug: trimmedSlug,
      category: draft.category,
      tagline: draft.tagline.trim(),
      description: draft.description.trim(),
      color: draft.color,
      color2: draft.color2,
      text_on_color: draft.text_on_color,
      offer_badge: draft.offer_badge.trim(),
      discount_percent: Number(draft.discount_percent) || 0,
      denominations: draft.denominations,
      min_amount: minAmount,
      max_amount: maxAmount,
      trending: draft.trending,
      popularity: Number(draft.popularity) || 0,
      is_active: draft.is_active,
      logo_url: draft.logo_url.trim(),
      banner_url: draft.banner_url.trim(),
      occasions: draft.occasions,
    };

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('brands').update(payload).eq('id', editingId);
        if (error) throw error;
        push('Brand updated', 'success');
      } else {
        const { error } = await supabase.from('brands').insert(payload);
        if (error) throw error;
        push('Brand added', 'success');
      }
      setModalOpen(false);
      fetchBrands();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save brand.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b: Brand) => {
    if (!window.confirm(`Delete "${b.name}"? This can't be undone.`)) return;
    setDeletingId(b.id);
    try {
      const { error } = await supabase.from('brands').delete().eq('id', b.id);
      if (error) throw error;
      setBrands((prev) => prev.filter((x) => x.id !== b.id));
      push('Brand deleted', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to delete brand', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (b: Brand) => {
    setTogglingId(b.id);
    const nextActive = !b.is_active;
    try {
      const { error } = await supabase.from('brands').update({ is_active: nextActive }).eq('id', b.id);
      if (error) throw error;
      setBrands((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: nextActive } : x)));
      push(nextActive ? 'Brand is now visible on the site' : 'Brand hidden from the site', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Failed to update visibility', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="font-display text-lg font-bold text-slate-900">Manage Brands</h3>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands…"
              className="w-full rounded-full border border-slate-200 bg-white pl-9 pr-9 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-xs font-bold text-white hover:shadow-glow transition-shadow whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> Add Brand
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-400">
            {search ? 'No brands match your search.' : 'No brands yet. Add your first one.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <div
              key={b.id}
              className={`relative rounded-2xl border p-4 transition-colors ${
                b.is_active ? 'border-slate-100' : 'border-slate-100 bg-slate-50/60 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-xs shrink-0 overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${b.color}, ${b.color2})` }}
                  >
                    {b.logo_url ? (
                      <img src={b.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      b.name.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{b.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{b.category}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleActive(b)}
                  disabled={togglingId === b.id}
                  title={b.is_active ? 'Visible on site — click to hide' : 'Hidden — click to show'}
                  className={`shrink-0 grid place-items-center h-8 w-8 rounded-full transition-colors disabled:opacity-50 ${
                    b.is_active
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                  }`}
                >
                  {b.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>

              {b.denominations?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {b.denominations.slice(0, 4).map((d) => (
                    <span
                      key={d}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600"
                    >
                      ₹{d}
                    </span>
                  ))}
                  {b.denominations.length > 4 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      +{b.denominations.length - 4}
                    </span>
                  )}
                </div>
              )}

              {b.occasions?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {b.occasions.slice(0, 3).map((o) => (
                    <span
                      key={o}
                      className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700"
                    >
                      {o}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {b.is_active ? 'Active' : 'Hidden'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEdit(b)}
                    className="grid place-items-center h-8 w-8 rounded-full text-slate-500 hover:bg-slate-100 hover:text-brand-700 transition-colors"
                    aria-label="Edit brand"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(b)}
                    disabled={deletingId === b.id}
                    className="grid place-items-center h-8 w-8 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                    aria-label="Delete brand"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-glow">
            <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-slate-100 bg-white rounded-t-3xl">
              <h3 className="font-display text-lg font-bold text-slate-900">
                {editingId ? 'Edit brand' : 'Add a new brand'}
              </h3>
              <button
                onClick={closeModal}
                className="grid place-items-center h-9 w-9 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 grid gap-5">
              {formError && (
                <div className="flex items-start gap-2 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Brand name">
                  <input
                    value={draft.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Amazon"
                    className="input"
                  />
                </Field>
                <Field label="Slug">
                  <input
                    value={draft.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setDraft((d) => ({ ...d, slug: e.target.value }));
                    }}
                    placeholder="amazon"
                    className="input font-mono"
                  />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Category">
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                    className="input"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Offer badge">
                  <input
                    value={draft.offer_badge}
                    onChange={(e) => setDraft((d) => ({ ...d, offer_badge: e.target.value }))}
                    placeholder="Flat 5% off"
                    className="input"
                  />
                </Field>
              </div>

              <Field label="Tagline">
                <input
                  value={draft.tagline}
                  onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
                  placeholder="Shop millions of products"
                  className="input"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={2}
                  placeholder="Redeem on Amazon.in for electronics, fashion, and more."
                  className="input resize-none"
                />
              </Field>

              {/* Images */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Logo image URL" icon={ImageIcon}>
                  <input
                    value={draft.logo_url}
                    onChange={(e) => setDraft((d) => ({ ...d, logo_url: e.target.value }))}
                    placeholder="https://…/logo.png"
                    className="input"
                  />
                </Field>
                <Field label="Banner/cover image URL" icon={ImageIcon}>
                  <input
                    value={draft.banner_url}
                    onChange={(e) => setDraft((d) => ({ ...d, banner_url: e.target.value }))}
                    placeholder="https://…/banner.jpg"
                    className="input"
                  />
                </Field>
              </div>

              {/* Colors */}
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Color 1">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.color}
                      onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                      className="h-10 w-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <input
                      value={draft.color}
                      onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                      className="input font-mono"
                    />
                  </div>
                </Field>
                <Field label="Color 2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.color2}
                      onChange={(e) => setDraft((d) => ({ ...d, color2: e.target.value }))}
                      className="h-10 w-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <input
                      value={draft.color2}
                      onChange={(e) => setDraft((d) => ({ ...d, color2: e.target.value }))}
                      className="input font-mono"
                    />
                  </div>
                </Field>
                <Field label="Text on color">
                  <select
                    value={draft.text_on_color}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, text_on_color: e.target.value as 'white' | 'dark' }))
                    }
                    className="input"
                  >
                    <option value="white">White</option>
                    <option value="dark">Dark</option>
                  </select>
                </Field>
              </div>

              {/* Denominations */}
              <Field label="Denominations (₹)">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={denomInput}
                    onChange={(e) => setDenomInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDenomination();
                      }
                    }}
                    placeholder="e.g. 500"
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={addDenomination}
                    className="shrink-0 rounded-xl bg-brand-100 px-4 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {draft.denominations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {draft.denominations.map((val) => (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 pl-3 pr-1.5 py-1 text-xs font-bold text-slate-700"
                      >
                        ₹{val}
                        <button
                          type="button"
                          onClick={() => removeDenomination(val)}
                          className="grid place-items-center h-5 w-5 rounded-full hover:bg-slate-300/60"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Field>

              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="Min amount (₹)">
                  <input
                    type="number"
                    value={draft.min_amount}
                    onChange={(e) => setDraft((d) => ({ ...d, min_amount: e.target.value }))}
                    className="input"
                  />
                </Field>
                <Field label="Max amount (₹)">
                  <input
                    type="number"
                    value={draft.max_amount}
                    onChange={(e) => setDraft((d) => ({ ...d, max_amount: e.target.value }))}
                    className="input"
                  />
                </Field>
                <Field label="Discount %">
                  <input
                    type="number"
                    value={draft.discount_percent}
                    onChange={(e) => setDraft((d) => ({ ...d, discount_percent: e.target.value }))}
                    className="input"
                  />
                </Field>
              </div>

              {/* Occasions */}
              <Field label="Occasions" icon={Sparkles}>
                <div className="flex flex-wrap gap-2">
                  {OCCASIONS.map((o) => {
                    const active = draft.occasions.includes(o);
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => toggleOccasion(o)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-brand-600 border-brand-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                        }`}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.trending}
                    onChange={(e) => setDraft((d) => ({ ...d, trending: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                  />
                  <TagIcon className="h-4 w-4 text-slate-400" /> Mark as trending
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                  />
                  <Eye className="h-4 w-4 text-slate-400" /> Visible on site
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-2.5 text-sm font-bold text-white hover:shadow-glow transition-shadow disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: rgb(51 65 85);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          border-color: rgb(167 139 250);
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof ImageIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </label>
      {children}
    </div>
  );
}
