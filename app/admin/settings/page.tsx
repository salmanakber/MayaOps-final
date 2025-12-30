'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CreditCard, 
  Receipt, 
  Mail, 
  Map as MapIcon, 
  Smartphone, 
  Settings as SettingsIcon, 
  Plus, 
  Save, 
  X, 
  Edit2, 
  Trash2, 
  Lock, 
  Eye, 
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';

// --- Types ---
interface Setting {
  id: number;
  key: string;
  value: string;
  category: string;
  description?: string;
  isEncrypted: boolean;
  updatedBy?: {
    id: number;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  updatedAt: string;
}

// --- Constants ---
const CATEGORIES = [
  { value: 'stripe', label: 'Stripe Integration', icon: CreditCard, description: 'Manage payments and webhook keys' },
  { value: 'billing', label: 'Billing Configuration', icon: Receipt, description: 'Pricing models and trial periods' },
  { value: 'email', label: 'Email Services', icon: Mail, description: 'SMTP, SendGrid, and SES settings' },
  { value: 'google_maps', label: 'Google Maps', icon: MapIcon, description: 'API keys for map rendering' },
  { value: 'app', label: 'Application', icon: Smartphone, description: 'Version control and maintenance' },
  { value: 'general', label: 'General', icon: SettingsIcon, description: 'Global system preferences' },
];

const DEFAULT_SETTINGS = {
  stripe: [
    { key: 'stripe_publishable_key', description: 'Stripe Publishable Key', isEncrypted: true },
    { key: 'stripe_secret_key', description: 'Stripe Secret Key', isEncrypted: true },
    { key: 'stripe_webhook_secret', description: 'Stripe Webhook Secret', isEncrypted: true },
    { key: 'stripe_base_price_id', description: 'Base Subscription Price ID', isEncrypted: false },
    { key: 'stripe_property_price_id', description: 'Per-Property Price ID', isEncrypted: false },
  ],
  billing: [
    { key: 'base_monthly_price', description: 'Base Monthly Price (GBP)', isEncrypted: false },
    { key: 'price_per_property', description: 'Price Per Property (GBP)', isEncrypted: false },
    { key: 'trial_days', description: 'Trial Period (Days)', isEncrypted: false },
  ],
  email: [
    { key: 'email_provider', description: 'Email Provider (sendgrid|ses)', isEncrypted: false },
    { key: 'sendgrid_api_key', description: 'SendGrid API Key', isEncrypted: true },
    { key: 'ses_access_key', description: 'AWS SES Access Key', isEncrypted: true },
    { key: 'ses_secret_key', description: 'AWS SES Secret Key', isEncrypted: true },
    { key: 'ses_region', description: 'AWS SES Region', isEncrypted: false },
    { key: 'from_email', description: 'System From Email', isEncrypted: false },
  ],
  google_maps: [
    { key: 'google_maps_api_key', description: 'Google Maps API Key', isEncrypted: true },
  ],
  app: [
    { key: 'app_version', description: 'Current App Version', isEncrypted: false },
    { key: 'min_app_version', description: 'Minimum Supported Version', isEncrypted: false },
    { key: 'maintenance_mode', description: 'Maintenance Mode', isEncrypted: false },
  ],
};

export default function AdminSettingsPage() {
  const router = useRouter();
  
  // State
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('stripe');
  
  // Edit State
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSetting, setNewSetting] = useState({
    key: '',
    value: '',
    category: 'general',
    description: '',
    isEncrypted: false,
  });

  useEffect(() => {
    loadSettings();
  }, [selectedCategory]);

  const getAuthToken = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`/api/admin/settings?category=${selectedCategory}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (data.success) {
        setSettings(data.data.settings);
      } else {
        if (data.message === 'Unauthorized' || data.message === 'Forbidden') {
          alert('Access Denied');
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key: string, value: string) => {
    try {
      setSaving(key);
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`/api/admin/settings/${key}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ value }),
      });

      const data = await response.json();
      
      if (data.success) {
        setEditingKey(null);
        loadSettings();
      } else {
        alert(data.message || 'Failed to save setting');
      }
    } catch (error) {
      alert('Failed to save setting');
    } finally {
      setSaving(null);
    }
  };

  const handleAddSetting = async () => {
    try {
      setSaving('new');
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newSetting),
      });

      const data = await response.json();
      
      if (data.success) {
        setShowAddModal(false);
        setNewSetting({
          key: '',
          value: '',
          category: selectedCategory, // Reset to current category
          description: '',
          isEncrypted: false,
        });
        loadSettings();
      } else {
        alert(data.message || 'Failed to create setting');
      }
    } catch (error) {
      alert('Failed to create setting');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Are you sure you want to delete setting "${key}"?`)) return;

    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`/api/admin/settings?key=${key}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await response.json();
      if (data.success) loadSettings();
    } catch (error) {
      alert('Failed to delete setting');
    }
  };

  const filteredSettings = settings.filter(s => s.category === selectedCategory);
  const activeCategoryInfo = CATEGORIES.find(c => c.value === selectedCategory);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-72 bg-white border-r border-gray-200 flex-shrink-0 md:h-screen md:sticky md:top-0 overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <SettingsIcon className="text-indigo-600" size={24} />
            System Settings
          </h1>
          <p className="mt-1 text-xs text-gray-500">Global configuration</p>
        </div>
        <nav className="p-4 space-y-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                selectedCategory === cat.value
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <cat.icon size={18} className={selectedCategory === cat.value ? 'text-indigo-600' : 'text-gray-400'} />
              <div className="flex flex-col items-start">
                <span>{cat.label}</span>
              </div>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-8 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{activeCategoryInfo?.label}</h2>
              <p className="text-sm text-gray-500 mt-1">{activeCategoryInfo?.description}</p>
            </div>
            <button
              onClick={() => {
                setNewSetting(prev => ({...prev, category: selectedCategory}));
                setShowAddModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Plus size={16} />
              Add Parameter
            </button>
          </div>

          {/* Settings List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="p-8 space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredSettings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <SettingsIcon className="text-gray-400" size={24} />
                </div>
                <h3 className="text-sm font-medium text-gray-900">No settings found</h3>
                <p className="text-sm text-gray-500 mt-1">Start by adding a new parameter or selecting a quick add option.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredSettings.map((setting) => (
                  <div key={setting.id} className="group p-6 hover:bg-gray-50/50 transition-colors">
                    {editingKey === setting.key ? (
                      // Edit Mode
                      <div className="bg-indigo-50/50 -m-2 p-4 rounded-lg border border-indigo-100">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                                Editing: {setting.key}
                            </span>
                          </div>
                          <div className="relative">
                            <input
                              type={setting.isEncrypted ? 'text' : 'text'} // Show text when editing even if encrypted, usually
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="block w-full px-4 py-3 bg-white border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-mono"
                              placeholder="Enter new value..."
                              autoFocus
                            />
                            {setting.isEncrypted && (
                                <Lock size={14} className="absolute right-3 top-3.5 text-gray-400" />
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <button
                              onClick={() => handleSave(setting.key, editValue)}
                              disabled={saving === setting.key}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {saving === setting.key ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                              Save Changes
                            </button>
                            <button
                              onClick={() => {
                                setEditingKey(null);
                                setEditValue('');
                              }}
                              className="text-xs text-gray-600 hover:text-gray-900 font-medium px-2"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-mono font-medium text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded text-xs truncate">
                              {setting.key}
                            </h3>
                            {setting.isEncrypted && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                <Lock size={10} /> Encrypted
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-900 font-medium mb-1">
                             {setting.description || "No description provided"}
                          </p>

                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 max-w-md truncate text-gray-600">
                                {setting.isEncrypted ? '••••••••••••••••' : setting.value}
                            </code>
                          </div>
                          
                          {setting.updatedBy && (
                            <p className="mt-2 text-[10px] text-gray-400">
                              Updated by {setting.updatedBy.firstName} • {new Date(setting.updatedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-end sm:self-center">
                          <button
                            onClick={() => {
                              setEditingKey(setting.key);
                              setEditValue(setting.value); // Usually empty for encrypted, but valid for logic
                            }}
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Value"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(setting.key)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Parameter"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Add Suggestions */}
          <div className="pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600" />
              Recommended Configurations
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DEFAULT_SETTINGS[selectedCategory as keyof typeof DEFAULT_SETTINGS]?.map((defaultSetting) => {
                const exists = settings.some(s => s.key === defaultSetting.key);
                return (
                  <button
                    key={defaultSetting.key}
                    onClick={() => {
                      if (!exists) {
                        setNewSetting({
                          key: defaultSetting.key,
                          value: '',
                          category: selectedCategory,
                          description: defaultSetting.description,
                          isEncrypted: defaultSetting.isEncrypted,
                        });
                        setShowAddModal(true);
                      }
                    }}
                    disabled={exists}
                    className={`
                      relative flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200
                      ${exists
                        ? 'border-gray-100 bg-gray-50 opacity-60 cursor-default'
                        : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md cursor-pointer group'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                       <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${exists ? 'bg-gray-200 text-gray-600' : 'bg-blue-50 text-blue-700'}`}>
                         {defaultSetting.key.split('_').slice(0, 2).join('_').substring(0, 15)}...
                       </span>
                       {exists && <CheckCircle2 size={14} className="text-green-500" />}
                       {!exists && <Plus size={14} className="text-indigo-400 group-hover:text-indigo-600" />}
                    </div>
                    <p className={`text-sm font-medium ${exists ? 'text-gray-500' : 'text-gray-900'}`}>
                      {defaultSetting.description}
                    </p>
                    {defaultSetting.isEncrypted && (
                       <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400">
                          <Lock size={10} /> Secure Field
                       </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Modern Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setShowAddModal(false)}
          />
          
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Add Parameter</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
                <input
                  type="text"
                  value={newSetting.key}
                  onChange={(e) => setNewSetting({ ...newSetting, key: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-mono placeholder:text-gray-400"
                  placeholder="e.g., stripe_public_key"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                <input
                  type={newSetting.isEncrypted ? 'password' : 'text'}
                  value={newSetting.value}
                  onChange={(e) => setNewSetting({ ...newSetting, value: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter configuration value"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                        value={newSetting.category}
                        onChange={(e) => setNewSetting({ ...newSetting, category: e.target.value })}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                        {CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                            {cat.label}
                        </option>
                        ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center pt-6">
                      <label className="flex items-center cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={newSetting.isEncrypted}
                            onChange={(e) => setNewSetting({ ...newSetting, isEncrypted: e.target.checked })}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded transition-colors"
                        />
                        <span className="ml-2 text-sm text-gray-600 group-hover:text-gray-900">Encrypt Value</span>
                      </label>
                  </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newSetting.description}
                  onChange={(e) => setNewSetting({ ...newSetting, description: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-none"
                  rows={2}
                  placeholder="What is this setting used for?"
                />
              </div>
            </div>
            
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSetting}
                disabled={!newSetting.key || !newSetting.value || saving === 'new'}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving === 'new' ? 'Creating...' : 'Create Setting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}