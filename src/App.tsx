/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Download, Check, Copy, ShieldCheck, AlertTriangle, FileArchive } from 'lucide-react';
import { StoreGraphicsGenerator } from './components/StoreGraphicsGenerator';

interface PermissionItem {
  permission: string;
  justification: string;
}

const PERMISSION_JUSTIFICATIONS: PermissionItem[] = [
  {
    permission: 'Single Purpose Description',
    justification:
      'The single purpose of Reactron is to let users select visual Watch Regions on browser-based games and display user-configured GIF/image and text reaction overlays when those regions match the captured visual state.'
  },
  {
    permission: 'activeTab',
    justification:
      'Required to identify the user\'s currently open browser game tab when clicking "+ Add Game from Active Tab", to initiate interactive Watch Region selection, and to capture visible viewport pixels (via captureVisibleTab) strictly for local in-memory visual comparison against the user\'s saved Watch Regions.'
  },
  {
    permission: 'storage',
    justification:
      'Required to store user-configured game entries, normalized Watch Region coordinates, strictness slider settings, and reaction preset metadata locally on the user\'s device via chrome.storage.local.'
  },
  {
    permission: 'scripting',
    justification:
      'Required to ensure the Watch Region selector and Shadow DOM reaction overlay script (content-script.js) are injected and responsive on the active game tab immediately when the user triggers area selection or live overlay preview from the Side Panel, without forcing the user to reload their game mid-session.'
  },
  {
    permission: 'sidePanel',
    justification:
      'Required to host the Reactron configuration interface inside Chrome\'s native Side Panel so users can select Watch Regions, drag-and-drop overlay positions, and preview reactions side-by-side with their live game viewport.'
  },
  {
    permission: 'tabs',
    justification:
      'Required to match open tab URLs against the user\'s enabled games list, automatically start or pause visual monitoring when the user navigates away or switches tabs, and route overlay trigger messages to the active game tab.'
  },
  {
    permission: 'host_permissions (<all_urls>)',
    justification:
      'Browser-based web games are hosted across thousands of independent domains, game portals, and custom URLs. <all_urls> is required so users can select Watch Regions, sample viewport regions via captureVisibleTab, and render reaction overlays on whichever web game URL they add to their Reactron Dashboard. Monitoring only runs on tabs matching a user-enabled game URL.'
  }
];

const KNOWN_LIMITATIONS = [
  {
    title: '01. Dynamic or Busy 3D Backgrounds Behind HUD Elements',
    detail:
      'Reactron compares a 12×12 spatial RGB fingerprint of your selected Watch Region against its captured baseline. If a Watch Region covers a semi-transparent HUD area where moving 3D worlds, explosions, weather effects, or camera shake pass behind it, continuous pixel variation may lower similarity accuracy. Best practice: select opaque, high-contrast HUD banners, icons, or score boxes and tune Strictness between 75% and 90%.'
  },
  {
    title: '02. Micro or Sub-Pixel UI Changes (e.g., 1% Health Bar Tick)',
    detail:
      'Very small visual deltas—such as a 1–2 pixel change along a thin health bar or a single digit changing inside a wide selection box—may not shift the overall region fingerprint enough to trigger cleanly. Best practice: draw your Watch Region box tightly around the exact badge, word, or bar segment you want to watch (minimum 10×10 px).'
  },
  {
    title: '03. Active Foreground Tab & Non-Minimized Window Requirement',
    detail:
      'Chrome’s tabs.captureVisibleTab API only captures the currently active foreground tab in a visible browser window. When you switch to another tab or minimize the window, Reactron automatically pauses visual sampling and resumes when you return to the game tab.'
  },
  {
    title: '04. Radical Responsive Layout Reflows',
    detail:
      'ViewportLayoutService automatically projects Watch Region coordinates across window resizes and aspect-ratio letterboxing. However, if a game completely rearranges its HUD positions between desktop and narrow split-screen breakpoints, use "Reselect Area" to capture the new HUD layout.'
  },
  {
    title: '05. Restricted Browser Pages & DRM Surfaces',
    detail:
      'Per Chrome security policy, extensions cannot run or render overlays on internal browser URLs (chrome://, edge://, about:, or the Chrome Web Store) or inside hardware DRM-protected video surfaces.'
  }
];

export default function App() {
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const downloadUrl = '/reactron-extension.zip';
  const fileName = 'reactron-extension.zip';
  const privacyPolicyUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/#privacy` : 'https://reactron.app/#privacy';

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Failed to fetch package file');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch {
      window.location.href = downloadUrl;
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#171B24] text-[#F4F6FA] selection:bg-[#607DFA] selection:text-white">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#171B24]/95 backdrop-blur border-b border-[#374152]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#"
            className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-[#F4F6FA] whitespace-nowrap shrink-0"
          >
            <img
              src="/assets/aistudio/Logo-03_8ab3f1ff.png"
              alt="Reactron Logo"
              referrerPolicy="no-referrer"
              className="w-6 h-6 object-contain"
            />
            <span>Reactron</span>
          </a>

          {/* Zone 2: Concise Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#A9B3C4]">
            <a
              href="#release-package"
              className="hover:text-[#F4F6FA] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Release Package
            </a>
            <a
              href="#store-graphics"
              className="hover:text-[#F4F6FA] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Store Graphics
            </a>
            <a
              href="#submission-copy"
              className="hover:text-[#F4F6FA] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Store Justifications
            </a>
            <a
              href="#limitations"
              className="hover:text-[#F4F6FA] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Limitations
            </a>
            <a
              href="#privacy"
              className="hover:text-[#F4F6FA] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Privacy Policy
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-4 py-2 rounded-lg bg-[#607DFA] hover:bg-[#4F6CE0] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {downloading ? 'Preparing ZIP...' : 'Download v1.0.0 ZIP'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-16">
        {/* 01. HERO & PRODUCTION PACKAGE DOWNLOAD */}
        <section id="release-package" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between bg-[#222936] border border-[#374152] rounded-xl p-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-mono text-[#607DFA] tabular-nums">
                <span>MANIFEST V3</span>
                <span aria-hidden="true">·</span>
                <span>VERSION 1.0.0</span>
                <span aria-hidden="true">·</span>
                <span>CHROME 114+</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#F4F6FA] leading-[1.12] [text-wrap:balance]">
                Reactron — Custom Game Reactions (v1.0 Production Pack)
              </h1>

              <p className="text-base text-[#A9B3C4] leading-relaxed max-w-2xl">
                Chrome Web Store–ready release bundle featuring local-first HUD Watch Region visual fingerprinting, click-through Shadow DOM GIF/Text reaction overlays, and zero external network dependencies.
              </p>
            </div>

            <div className="pt-8 mt-8 border-t border-[#374152] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="px-6 py-3 rounded-lg bg-[#607DFA] hover:bg-[#4F6CE0] text-white font-semibold text-sm flex items-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {downloading ? 'Preparing Download...' : 'Download reactron-extension.zip (v1.0.0)'}
                </button>

                {downloadSuccess && (
                  <span className="text-xs font-medium text-[#55C5A0] flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    Package downloaded
                  </span>
                )}
              </div>

              <div className="text-xs font-mono text-[#A9B3C4] tabular-nums">
                <span>Single folder upload</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>Zero remote code</span>
              </div>
            </div>
          </div>

          {/* Right Column: Production Verification & Unpack Checklist */}
          <div className="lg:col-span-5 bg-[#222936] border border-[#374152] rounded-xl p-8 flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-[#55C5A0] mb-2">
                <FileArchive className="w-4 h-4" />
                <span>01. UPLOAD OR TEST UNPACKED</span>
              </div>
              <h2 className="text-xl font-bold text-[#F4F6FA]">
                How to Apply to Chrome Web Store or Test Locally
              </h2>
            </div>

            <ol className="text-xs text-[#A9B3C4] space-y-3 list-decimal list-inside bg-[#171B24] p-5 rounded-lg border border-[#374152] leading-relaxed">
              <li>
                <strong className="text-[#F4F6FA]">For Chrome Web Store Submission:</strong> Upload{' '}
                <code className="text-[#607DFA] font-mono">reactron-extension.zip</code> directly in the{' '}
                <span className="text-[#F4F6FA]">Chrome Developer Dashboard</span> without unzipping.
              </li>
              <li>
                <strong className="text-[#F4F6FA]">For Local Unpacked Testing:</strong> Unzip{' '}
                <code className="text-[#F4F6FA] font-mono">reactron-extension.zip</code> into a single folder.
              </li>
              <li>
                Open <code className="text-[#F4F6FA] font-mono">chrome://extensions/</code>, enable{' '}
                <strong className="text-[#F4F6FA]">Developer mode</strong>, and click{' '}
                <strong className="text-[#F4F6FA]">Load unpacked</strong>.
              </li>
              <li>
                Click the Reactron toolbar icon to open the <strong className="text-[#607DFA]">Side Panel</strong> beside any browser game tab.
              </li>
            </ol>

            <div className="text-xs text-[#A9B3C4] flex items-center justify-between pt-2 border-t border-[#374152] tabular-nums">
              <span>Included docs in repository:</span>
              <span className="font-mono text-[#F4F6FA]">README.md · CONTRIBUTING.md · PRIVACY_POLICY.md · LICENSE</span>
            </div>
          </div>
        </section>

        {/* 02. CHROME WEB STORE GRAPHICS GENERATOR */}
        <StoreGraphicsGenerator />

        {/* 03. CHROME WEB STORE SUBMISSION COPY & PERMISSION JUSTIFICATIONS */}
        <section id="submission-copy" className="py-12 border-t border-[#374152]/70 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-[#607DFA] tracking-wide mb-2">
                03. CHROME DEVELOPER DASHBOARD COPY-PASTE GUIDE
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#F4F6FA] tracking-tight">
                Store Permission Justifications & Single Purpose
              </h2>
              <p className="text-sm text-[#A9B3C4] mt-2 max-w-2xl">
                Copy and paste these exact responses into the <strong className="text-[#F4F6FA]">Privacy Practices</strong> tab of the Chrome Web Store Developer Console.
              </p>
            </div>

            <div className="bg-[#222936] border border-[#374152] rounded-lg px-4 py-3 text-xs flex flex-col gap-1">
              <span className="text-[#A9B3C4]">Remote Code Certification:</span>
              <strong className="text-[#55C5A0] font-mono">Select: &quot;No, I am not using remote code&quot;</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PERMISSION_JUSTIFICATIONS.map((item) => (
              <div
                key={item.permission}
                className="bg-[#222936] border border-[#374152] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold font-mono text-[#607DFA]">{item.permission}</span>
                    <button
                      onClick={() => handleCopy(item.permission, item.justification)}
                      className="px-2.5 py-1 rounded bg-[#171B24] hover:bg-[#607DFA] text-[#F4F6FA] hover:text-white border border-[#374152] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {copiedKey === item.permission ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#55C5A0]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-[#A9B3C4] leading-relaxed">{item.justification}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 04. KNOWN LIMITATIONS & OPERATIONAL BOUNDARIES */}
        <section id="limitations" className="py-12 border-t border-[#374152]/70 space-y-8">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#F59E0B] mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span>04. VERSION 1.0 KNOWN LIMITATIONS & BEST PRACTICES</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#F4F6FA] tracking-tight">
              Operational Boundaries of Visual Fingerprint Detection
            </h2>
            <p className="text-sm text-[#A9B3C4] mt-2 max-w-2xl">
              Documented in <code className="font-mono text-[#F4F6FA]">README.md</code> so users and reviewers understand how non-intrusive visual HUD matching operates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {KNOWN_LIMITATIONS.map((lim) => (
              <div
                key={lim.title}
                className="bg-[#222936] border border-[#374152] rounded-xl p-6 space-y-2.5"
              >
                <h3 className="text-base font-bold text-[#F4F6FA]">{lim.title}</h3>
                <p className="text-xs text-[#A9B3C4] leading-relaxed">{lim.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 05. OFFICIAL PRIVACY POLICY */}
        <section id="privacy" className="py-12 border-t border-[#374152]/70 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-[#55C5A0] mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>05. OFFICIAL PRIVACY POLICY (CHROME WEB STORE COMPLIANT)</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#F4F6FA] tracking-tight">
                Privacy Policy — Reactron - Custom Game Reactions
              </h2>
              <p className="text-xs font-mono text-[#A9B3C4] mt-1 tabular-nums">
                Effective Date: October 26, 2026 · Version 1.0.0 · Contact: promptsmithjd@gmail.com
              </p>
            </div>

            <button
              onClick={() => handleCopy('privacyUrl', privacyPolicyUrl)}
              className="px-4 py-2 rounded-lg bg-[#222936] hover:bg-[#2C3545] border border-[#374152] text-xs font-semibold text-[#F4F6FA] flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedKey === 'privacyUrl' ? (
                <>
                  <Check className="w-4 h-4 text-[#55C5A0]" />
                  <span>Privacy Policy Link Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#607DFA]" />
                  <span>Copy Privacy Policy URL</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-[#222936] border border-[#374152] rounded-xl p-8 space-y-6 text-sm text-[#A9B3C4] leading-relaxed">
            <div>
              <h3 className="text-base font-bold text-[#F4F6FA] mb-2">
                1. Zero Data Collection Commitment
              </h3>
              <p>
                <strong className="text-[#F4F6FA]">Reactron - Custom Game Reactions</strong> operates 100% locally on your device. We do <strong className="text-[#F4F6FA]">not</strong> collect, transmit, store on external servers, rent, or sell any personal information, browsing history, tab activity, screenshots, or user-uploaded media. Reactron uses zero backend servers, zero analytics scripts, and makes zero external network requests.
              </p>
            </div>

            <div>
              <h3 className="text-base font-bold text-[#F4F6FA] mb-2">
                2. In-Memory Visual Tab Sampling (captureVisibleTab)
              </h3>
              <p>
                When you enable monitoring for a saved browser game, Reactron periodically captures the visible viewport of that active game tab (<code className="font-mono text-[#F4F6FA]">chrome.tabs.captureVisibleTab</code>) solely to compare the pixels inside your selected Watch Region against the baseline thumbnail you captured during setup. Full-frame captures are processed strictly in volatile local memory (RAM) to compute a 12×12 RGB similarity score and are immediately discarded. No screenshots or visual data ever leave your browser.
              </p>
            </div>

            <div>
              <h3 className="text-base font-bold text-[#F4F6FA] mb-2">
                3. Local-Only Storage (chrome.storage.local & IndexedDB)
              </h3>
              <p>
                All game entries, Watch Region coordinates, strictness settings, text reaction configurations, and uploaded GIF/image files are stored exclusively on your computer inside <code className="font-mono text-[#F4F6FA]">chrome.storage.local</code> and local <code className="font-mono text-[#F4F6FA]">IndexedDB</code> (<code className="font-mono text-[#F4F6FA]">reactron_media_db</code>). Deleting a game, deleting a library preset, or uninstalling the extension permanently erases this data from your browser.
              </p>
            </div>

            <div>
              <h3 className="text-base font-bold text-[#F4F6FA] mb-2">
                4. Host Permissions (&lt;all_urls&gt;) & Content Scripts
              </h3>
              <p>
                Because browser-based games are hosted across thousands of independent domains, Reactron requests <code className="font-mono text-[#F4F6FA]">&lt;all_urls&gt;</code> and <code className="font-mono text-[#F4F6FA]">scripting</code> solely to let you draw Watch Regions and render click-through Shadow DOM reaction overlays on whichever game site you choose to play. Reactron remains completely idle on any tab that does not match an enabled game URL in your Reactron Dashboard and never reads passwords, form fields, cookies, or personal text.
              </p>
            </div>

            <div className="pt-4 border-t border-[#374152] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span>
                Questions or privacy inquiries? Contact the developer at{' '}
                <a
                  href="mailto:promptsmithjd@gmail.com"
                  className="text-[#607DFA] hover:underline font-mono"
                >
                  promptsmithjd@gmail.com
                </a>
              </span>
              <span className="font-mono text-[#F4F6FA]">License: MIT</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#374152] py-8 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#A9B3C4]">
          <span>Reactron - Custom Game Reactions · v1.0.0 Production Release</span>
          <div className="flex items-center gap-4">
            <a href="#privacy" className="hover:text-[#F4F6FA] transition-colors">
              Privacy Policy
            </a>
            <span aria-hidden="true">·</span>
            <a href="mailto:promptsmithjd@gmail.com" className="hover:text-[#F4F6FA] font-mono transition-colors">
              promptsmithjd@gmail.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
