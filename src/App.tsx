/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Download, CheckCircle2, FileArchive, Terminal } from 'lucide-react';

export default function App() {
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const downloadUrl = '/reactron-extension.zip';
  const fileName = 'reactron-extension.zip';

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
      setTimeout(() => setDownloadSuccess(false), 5000);
    } catch (err) {
      console.error('Download error:', err);
      window.location.href = downloadUrl;
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#171B24] text-[#F4F6FA] flex flex-col items-center justify-center p-4 selection:bg-[#607DFA] selection:text-white">
      <div className="w-full max-w-md bg-[#222936] border border-[#374152] rounded-2xl p-6 sm:p-8 flex flex-col gap-6 shadow-xl text-center items-center">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 rounded-xl bg-[#171B24] border border-[#374152] flex items-center justify-center text-2xl shadow-inner">
            ⚡
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#F4F6FA]">
            Reactron Extension
          </h1>
          <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#171B24] text-[#607DFA] border border-[#374152]">
            Stage 5 Automatic Detection & Triggering Pack
          </span>
        </div>

        {/* Download Box */}
        <div className="w-full bg-[#171B24] border border-[#374152] rounded-xl p-5 flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[#222936] border border-[#374152] flex items-center justify-center text-[#607DFA]">
            <FileArchive className="w-5 h-5" />
          </div>

          <p className="text-xs text-[#A9B3C4] max-w-xs leading-relaxed">
            Download the unpacked Chrome extension to test Stage 5 visual change detection, strictness mapping, trigger debouncing, tab lifecycle integration, and automatic reaction overlays.
          </p>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full py-3 px-4 rounded-lg bg-[#607DFA] hover:bg-[#4F6CE0] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Preparing Download...' : 'Download reactron-extension.zip'}
          </button>

          <div className="flex flex-col items-center gap-1 text-xs">
            <span className="text-[#748094]">Direct link:</span>
            <a
              href={downloadUrl}
              download={fileName}
              className="font-mono text-[#607DFA] hover:text-[#4F6CE0] underline underline-offset-4 text-xs break-all"
            >
              {downloadUrl}
            </a>
          </div>

          {downloadSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-[#55C5A0] bg-[#1C222E] border border-[#55C5A0]/30 px-3 py-1.5 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Download started successfully!</span>
            </div>
          )}
        </div>

        {/* Step-by-step instructions */}
        <div className="w-full text-left flex flex-col gap-2.5 border-t border-[#374152] pt-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#A9B3C4]">
            <Terminal className="w-3.5 h-3.5 text-[#607DFA]" />
            <span>How to unpack & test:</span>
          </div>
          <ol className="text-xs text-[#A9B3C4] space-y-1.5 list-decimal list-inside bg-[#171B24] p-3 rounded-lg border border-[#374152]">
            <li>Unzip <code className="text-[#F4F6FA] font-mono">reactron-extension.zip</code>.</li>
            <li>Go to <code className="text-[#F4F6FA] font-mono">chrome://extensions/</code> in Chrome.</li>
            <li>Enable <strong className="text-[#F4F6FA]">"Developer mode"</strong>.</li>
            <li>Click <strong className="text-[#F4F6FA]">"Load unpacked"</strong> and select the unzipped directory.</li>
            <li>Click the Reactron icon in your Chrome toolbar to open the <strong className="text-[#607DFA]">Side Panel</strong> (it remains open continuously beside your games while you select Watch Regions).</li>
          </ol>
        </div>

      </div>
    </div>
  );
}
