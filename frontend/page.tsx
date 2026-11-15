'use client';

import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface AnalyticsData {
  url: {
    shortCode: string;
    originalUrl: string;
    createdAt: string;
    expiresAt: string | null;
  };
  totalClicks: number;
  clicksPerDay: Array<{ date: string; clicks: number }>;
  browserBreakdown: Array<{ browser: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function SnapLinkDashboard() {
  const [urlInput, setUrlInput] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [shortenedResult, setShortenedResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Analytics query state
  const [searchCode, setSearchCode] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShortenedResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlInput,
          customAlias: customAlias || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to shorten URL');
      }

      setShortenedResult(data);
      setUrlInput('');
      setCustomAlias('');
      // Preload analytics for the newly created link
      fetchAnalytics(data.shortCode);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async (code: string) => {
    if (!code) return;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/${code}`);
      const data = await res.json();
      if (res.ok) {
        setAnalytics(data);
        setSearchCode(code);
      } else {
        alert(data.error || 'Link not found');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Header */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider">
            High-Throughput Distributed Engine
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
            SnapLink Analytics
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">
            Sub-10ms redirects via Redis cache-aside, sliding-window rate limiting, and batch-ingested telemetry.
          </p>
        </header>

        {/* Shortener Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur">
          <form onSubmit={handleShorten} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="url"
                required
                placeholder="Paste your long URL (e.g. https://github.com/company/repo)..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <input
                type="text"
                placeholder="Custom alias (optional)"
                value={customAlias}
                onChange={(e) => setCustomAlias(e.target.value)}
                className="w-full md:w-56 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 font-medium rounded-xl text-white transition disabled:opacity-50 text-sm shadow-lg shadow-blue-600/30 whitespace-nowrap"
              >
                {loading ? 'Shortening...' : 'Shorten Link'}
              </button>
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}
          </form>

          {/* Success Box */}
          {shortenedResult && (
            <div className="mt-6 p-4 rounded-xl bg-blue-950/40 border border-blue-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-blue-300 font-medium">Link Created Successfully:</p>
                <a
                  href={shortenedResult.shortUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lg font-bold text-white hover:underline break-all"
                >
                  {shortenedResult.shortUrl}
                </a>
                <p className="text-xs text-slate-400 mt-1 truncate max-w-lg">
                  Points to: {shortenedResult.originalUrl}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(shortenedResult.shortUrl)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg border border-slate-700 transition"
                >
                  {copied ? 'Copied! ✓' : 'Copy URL'}
                </button>
                <button
                  onClick={() => fetchAnalytics(shortenedResult.shortCode)}
                  className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold rounded-lg border border-blue-500/30 transition"
                >
                  View Stats
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Analytics Section */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">Real-Time Telemetry Dashboard</h2>
            <div className="flex w-full sm:w-auto gap-2">
              <input
                type="text"
                placeholder="Enter Short Code (e.g. q9x7)"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => fetchAnalytics(searchCode)}
                disabled={analyticsLoading || !searchCode}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold transition"
              >
                {analyticsLoading ? 'Loading...' : 'Inspect'}
              </button>
            </div>
          </div>

          {analytics ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Stat 1: Total Clicks */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
                <p className="text-xs uppercase font-semibold text-slate-400">Total Redirects</p>
                <p className="text-4xl font-extrabold text-blue-400 mt-2">{analytics.totalClicks}</p>
                <p className="text-xs text-slate-500 mt-1">Ingested via Redis Batch Queue</p>
              </div>

              {/* Stat 2: Code Info */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl md:col-span-2">
                <p className="text-xs uppercase font-semibold text-slate-400">Target Destination</p>
                <p className="text-sm font-mono text-slate-200 mt-1 break-all truncate">
                  {analytics.url.originalUrl}
                </p>
                <div className="flex gap-4 mt-3 text-xs text-slate-400">
                  <span>Created: {new Date(analytics.url.createdAt).toLocaleDateString()}</span>
                  <span>Expires: {analytics.url.expiresAt ? new Date(analytics.url.expiresAt).toLocaleDateString() : 'Never'}</span>
                </div>
              </div>

              {/* Chart 1: Clicks Over Time */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl md:col-span-2">
                <h3 className="text-sm font-semibold mb-4 text-slate-300">Click Volume per Day</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.clicksPerDay.length ? analytics.clicksPerDay : [{ date: 'Today', clicks: analytics.totalClicks }]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="date" stroke="#94A3B8" fontSize={12} />
                      <YAxis stroke="#94A3B8" fontSize={12} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: 8 }} />
                      <Bar dataKey="clicks" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Browser Share */}
              <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
                <h3 className="text-sm font-semibold mb-4 text-slate-300">Browser Distribution</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.browserBreakdown.length ? analytics.browserBreakdown : [{ browser: 'Chrome', count: 1 }]}
                        dataKey="count"
                        nameKey="browser"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {analytics.browserBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B' }} />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-sm">
              Shorten a link above or enter a short code to view real-time click analytics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
