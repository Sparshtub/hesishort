'use client';

import React, { useState, useEffect } from 'react';
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

// Figma Design System Pastel Tokens
const FIGMA_COLORS = ['#C5B0F4', '#DCEEB1', '#F3C9B6', '#EFD4D4', '#C8E6CD'];

export default function HesiShortDashboard() {
  const [urlInput, setUrlInput] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [shortenedResult, setShortenedResult] = useState<{
    shortUrl: string;
    shortCode: string;
    originalUrl: string;
    expiresAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Analytics query state
  const [searchCode, setSearchCode] = useState('repo');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [copied, setCopied] = useState(false);

  // Dynamic API Base URL (Relative for same-host, fallback to env or localhost)
  const [apiBase, setApiBase] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiBase(process.env.NEXT_PUBLIC_API_URL || window.location.origin);
    }
  }, []);

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShortenedResult(null);

    try {
      const payload: { url: string; customAlias?: string; expiresAt?: string } = {
        url: urlInput.trim(),
      };
      if (customAlias.trim()) payload.customAlias = customAlias.trim();
      if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();

      const res = await fetch(`${apiBase}/api/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to shorten URL');
      }

      setShortenedResult(data);
      setUrlInput('');
      setCustomAlias('');
      setExpiresAt('');
      // Preload analytics for newly created short code
      fetchAnalytics(data.shortCode);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      const res = await fetch(`${apiBase}/api/analytics/${cleanCode}`);
      const data = await res.json();
      if (res.ok) {
        setAnalytics(data);
        setSearchCode(cleanCode);
      } else {
        setAnalyticsError(data.error || `No analytics found for code "${cleanCode}"`);
      }
    } catch (err: any) {
      setAnalyticsError(err.message || 'Failed to fetch analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore copy errors
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-black font-sans flex flex-col antialiased">
      {/* Figma Header */}
      <header className="border-b border-black bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Figma-Style Dots */}
            <div className="flex items-center -space-x-1">
              <span className="w-3.5 h-3.5 rounded-full bg-[#F3C9B6] border border-black inline-block" />
              <span className="w-3.5 h-3.5 rounded-full bg-[#EFD4D4] border border-black inline-block" />
              <span className="w-3.5 h-3.5 rounded-full bg-[#C5B0F4] border border-black inline-block" />
              <span className="w-3.5 h-3.5 rounded-full bg-[#C8E6CD] border border-black inline-block" />
              <span className="w-3.5 h-3.5 rounded-full bg-[#DCEEB1] border border-black inline-block" />
            </div>
            <span className="font-extrabold text-xl tracking-tight">HesiShort</span>
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#DCEEB1] border border-black">
              v1.0 Live
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs font-semibold">
            <a
              href="https://github.com/Sparshtub/hesishort"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 rounded-full bg-white border border-black hover:bg-neutral-100 transition"
            >
              GitHub ↗
            </a>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#C8E6CD] border border-black">
              <span className="w-2 h-2 rounded-full bg-emerald-600 mr-1.5 animate-pulse" />
              Redis + MySQL
            </span>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12 space-y-12">
        {/* Hero Title */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#C5B0F4] border border-black text-xs font-bold tracking-tight">
            <span>⚡ Design-grade speed &bull; Sub-10ms Redis Cache-Aside</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-black leading-[1.08]">
            Every link,{' '}
            <span className="bg-[#DCEEB1] px-2 py-0.5 rounded-lg border border-black inline-block">
              shortened
            </span>{' '}
            with precision.
          </h1>
          <p className="text-neutral-600 text-sm sm:text-base max-w-xl mx-auto font-medium">
            Deterministic Base62 collision-free keys, sliding-window rate limiting, and durable batch click telemetry.
          </p>
        </div>

        {/* Shortener Card (Figma Canvas Frame) */}
        <div className="bg-white border-[1.5px] border-black rounded-2xl p-6 sm:p-9 shadow-[4px_4px_0px_#000000] relative">
          <div className="absolute -top-3.5 right-6 bg-[#F4ECD6] border border-black text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
            URL Compressor
          </div>

          <form onSubmit={handleShorten} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-black mb-2">
                Destination URL
              </label>
              <input
                type="url"
                required
                placeholder="https://example.com/your-long-article-or-portfolio-link..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full bg-[#FBFBFA] border border-black rounded-xl px-4 py-3.5 text-sm text-black placeholder-neutral-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-black font-medium transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-black mb-2">
                  Custom Alias (Optional)
                </label>
                <div className="flex rounded-xl bg-[#FBFBFA] border border-black overflow-hidden focus-within:ring-2 focus-within:ring-black">
                  <span className="px-3.5 py-3 text-xs font-bold bg-[#F4ECD6] border-r border-black select-none">
                    /
                  </span>
                  <input
                    type="text"
                    placeholder="my-link"
                    value={customAlias}
                    onChange={(e) => setCustomAlias(e.target.value)}
                    className="w-full bg-transparent px-3 py-3 text-sm text-black placeholder-neutral-400 focus:outline-none font-medium"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-black mb-2">
                  Expiration Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full bg-[#FBFBFA] border border-black rounded-xl px-4 py-3 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white font-bold py-3.5 px-6 rounded-full text-sm border-[1.5px] border-black shadow-[3px_3px_0px_#000000] hover:bg-neutral-800 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#000000] transition disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Shortening Link...' : 'Shorten URL'}</span>
              <span className="text-xs">→</span>
            </button>

            {error && (
              <div className="p-3 rounded-xl bg-[#EFD4D4] border border-black text-black text-xs font-bold">
                {error}
              </div>
            )}
          </form>

          {/* Success Banner */}
          {shortenedResult && (
            <div className="mt-6 p-5 rounded-xl bg-[#DCEEB1] border border-black space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-black">
                  ✓ Short Link Ready
                </span>
                <span className="text-xs font-bold text-neutral-800">
                  {shortenedResult.expiresAt
                    ? `Expires: ${new Date(shortenedResult.expiresAt).toLocaleDateString()}`
                    : 'Permanent'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-black">
                <a
                  href={shortenedResult.shortUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-black font-bold font-mono text-sm truncate hover:underline"
                >
                  {shortenedResult.shortUrl}
                </a>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => copyToClipboard(shortenedResult.shortUrl)}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-full bg-black text-white hover:bg-neutral-800 transition"
                  >
                    {copied ? 'Copied! ✓' : 'Copy'}
                  </button>
                  <button
                    onClick={() => fetchAnalytics(shortenedResult.shortCode)}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-full bg-[#C5B0F4] border border-black hover:bg-[#B79FF0] transition"
                  >
                    View Stats
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Analytics Section (Figma Pastel Dashboard) */}
        <div className="bg-white border-[1.5px] border-black rounded-2xl p-6 sm:p-9 shadow-[4px_4px_0px_#000000] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-black">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-[#C5B0F4] border border-black" />
                <h2 className="text-xl font-extrabold text-black tracking-tight">
                  Real-Time Telemetry & Analytics
                </h2>
              </div>
              <p className="text-xs text-neutral-600 mt-1 font-medium">
                Durable at-least-once batch telemetry processed via background Redis queues.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Code (e.g. repo)"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                className="bg-[#FBFBFA] border border-black rounded-full px-3.5 py-2 text-xs text-black placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-black font-medium"
              />
              <button
                onClick={() => fetchAnalytics(searchCode)}
                disabled={analyticsLoading || !searchCode.trim()}
                className="px-4 py-2 text-xs font-bold bg-black text-white rounded-full hover:bg-neutral-800 border border-black transition disabled:opacity-50 cursor-pointer"
              >
                {analyticsLoading ? 'Loading...' : 'Lookup'}
              </button>
            </div>
          </div>

          {analyticsError && (
            <div className="p-3 rounded-xl bg-[#EFD4D4] border border-black text-black text-xs font-bold">
              {analyticsError}
            </div>
          )}

          {/* Stats Grid */}
          {analytics ? (
            <div className="space-y-6">
              {/* 3 Key Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[#DCEEB1] p-4 rounded-xl border border-black">
                  <span className="text-[11px] text-neutral-800 uppercase font-bold tracking-wider">
                    Total Clicks
                  </span>
                  <p className="text-3xl font-extrabold text-black mt-1">
                    {analytics.totalClicks.toLocaleString()}
                  </p>
                </div>
                <div className="bg-[#C5B0F4] p-4 rounded-xl border border-black">
                  <span className="text-[11px] text-neutral-800 uppercase font-bold tracking-wider">
                    Short Code
                  </span>
                  <p className="text-2xl font-extrabold text-black font-mono mt-1 truncate">
                    {analytics.url.shortCode}
                  </p>
                </div>
                <div className="bg-[#F4ECD6] p-4 rounded-xl border border-black col-span-2">
                  <span className="text-[11px] text-neutral-800 uppercase font-bold tracking-wider">
                    Destination URL
                  </span>
                  <p className="text-xs text-black font-mono mt-2 truncate font-medium">
                    {analytics.url.originalUrl}
                  </p>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Timeline Bar Chart */}
                <div className="bg-white border-[1.5px] border-black rounded-xl p-5 shadow-[2.5px_2.5px_0px_#000000] space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-black block">
                    Clicks Over Time
                  </span>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={
                          analytics.clicksPerDay.length
                            ? analytics.clicksPerDay
                            : [{ date: 'Today', clicks: analytics.totalClicks }]
                        }
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E6E6E6" vertical={false} />
                        <XAxis dataKey="date" stroke="#000000" fontSize={11} fontWeight={600} />
                        <YAxis stroke="#000000" fontSize={11} fontWeight={600} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#000000',
                            borderRadius: 8,
                            fontWeight: 600,
                          }}
                        />
                        <Bar dataKey="clicks" fill="#000000" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Browser Share Doughnut */}
                <div className="bg-white border-[1.5px] border-black rounded-xl p-5 shadow-[2.5px_2.5px_0px_#000000] space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-black block">
                    Browser Breakdown
                  </span>
                  <div className="h-56 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={
                            analytics.browserBreakdown.length
                              ? analytics.browserBreakdown
                              : [{ browser: 'Direct', count: 1 }]
                          }
                          dataKey="count"
                          nameKey="browser"
                          cx="50%"
                          cy="50%"
                          outerRadius={75}
                          stroke="#000000"
                          strokeWidth={1.5}
                        >
                          {analytics.browserBreakdown.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={FIGMA_COLORS[index % FIGMA_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#000000',
                            borderRadius: 8,
                            fontWeight: 600,
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={32}
                          wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Top Referrers */}
              <div className="bg-white border-[1.5px] border-black rounded-xl p-5 shadow-[2.5px_2.5px_0px_#000000] space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-black block">
                  Top Referrers
                </span>
                <div className="space-y-2 text-xs font-medium">
                  {analytics.topReferrers && analytics.topReferrers.length > 0 ? (
                    analytics.topReferrers.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-1.5 border-b border-neutral-200"
                      >
                        <span className="text-neutral-800 font-semibold">{r.referrer}</span>
                        <span className="font-mono text-black font-bold">
                          {r.count} click(s)
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-neutral-500 italic">No referrer data yet.</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-neutral-300 rounded-2xl text-neutral-500 text-sm font-medium">
              Shorten a link above or enter a code (e.g. <span className="font-mono font-bold text-black">repo</span>) to inspect live click analytics.
            </div>
          )}
        </div>
      </main>

      {/* Editorial Footer */}
      <footer className="border-t border-black bg-white py-6 text-center text-xs font-medium text-neutral-600">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-bold text-black">HesiShort &bull; Production Engine</span>
          <span>Designed with Figma design system specs &bull; Powered by Upstash Redis & TiDB Cloud</span>
          <a
            href="https://github.com/Sparshtub/hesishort"
            target="_blank"
            rel="noreferrer"
            className="text-black font-bold hover:underline"
          >
            GitHub Repository ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
