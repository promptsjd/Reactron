import { useState } from 'react';
import { Download, Archive, Check } from 'lucide-react';
import JSZip from 'jszip';

export interface StoreAssetSpec {
  id: string;
  title: string;
  fileName: string;
  srcUrl: string;
  width: number;
  height: number;
  requirementLabel: string;
  caption: string;
}

export const STORE_ASSETS: StoreAssetSpec[] = [
  {
    id: 'screenshot1',
    title: '01. Hero Banner — Let Your Game React for You',
    fileName: '01-hero-banner-1280x800.png',
    srcUrl: '/assets/aistudio/01-hero_Banner_-01_7ec510d6.png',
    width: 1280,
    height: 800,
    requirementLabel: '1280 × 800 px · 24-bit RGB PNG (Store Screenshot 1)',
    caption: 'Primary Chrome Web Store hero screenshot showcasing instant GIF and text reactions on game events.'
  },
  {
    id: 'screenshot2',
    title: '02. Step 1 — Pick the Moment',
    fileName: '02-pick-the-moment-1280x800.png',
    srcUrl: '/assets/aistudio/02-pick-the-moment-01_905e9307.png',
    width: 1280,
    height: 800,
    requirementLabel: '1280 × 800 px · 24-bit RGB PNG (Store Screenshot 2)',
    caption: 'Demonstrates selecting up to 2 Watch Regions per game and configuring detection strictness.'
  },
  {
    id: 'screenshot3',
    title: '03. Step 2 — Choose the Reaction',
    fileName: '03-choose-the-reaction-1280x800.png',
    srcUrl: '/assets/aistudio/03-choose-the-reaction-01_144026f0.png',
    width: 1280,
    height: 800,
    requirementLabel: '1280 × 800 px · 24-bit RGB PNG (Store Screenshot 3)',
    caption: 'Highlights uploading custom GIFs/images and styling animated text overlays.'
  },
  {
    id: 'screenshot4',
    title: '04. Step 3 — Place and Tune It',
    fileName: '04-place-and-tune-1280x800.png',
    srcUrl: '/assets/aistudio/04-place-and-tune-01_4b07fa1c.png',
    width: 1280,
    height: 800,
    requirementLabel: '1280 × 800 px · 24-bit RGB PNG (Store Screenshot 4)',
    caption: 'Shows live drag-and-drop overlay repositioning and click-through gameplay protection.'
  },
  {
    id: 'screenshot5',
    title: '05. Step 4 — Library & Privacy',
    fileName: '05-library-and-privacy-1280x800.png',
    srcUrl: '/assets/aistudio/05-library-and-privacy-01_1b199e29.png',
    width: 1280,
    height: 800,
    requirementLabel: '1280 × 800 px · 24-bit RGB PNG (Store Screenshot 5)',
    caption: 'Illustrates the reusable Reaction Library and 100% local, account-free privacy model.'
  },
  {
    id: 'smallPromo',
    title: '06. Small Promo Tile',
    fileName: '06-small-promo-tile-440x280.png',
    srcUrl: '/assets/aistudio/06-small-promo-tile-01_80b91493.png',
    width: 440,
    height: 280,
    requirementLabel: '440 × 280 px · 24-bit RGB PNG (Chrome Store Small Promo Tile)',
    caption: 'Official compact promotional tile for Chrome Web Store category and search listings.'
  },
  {
    id: 'marqueePromo',
    title: '07. Marquee Promo Tile',
    fileName: '07-marquee-promo-tile-1400x560.png',
    srcUrl: '/assets/aistudio/07-marquee-promo-tile-01_cc37cf03.png',
    width: 1400,
    height: 560,
    requirementLabel: '1400 × 560 px · 24-bit RGB PNG (Chrome Store Marquee Banner)',
    caption: 'Wide promotional banner for Chrome Web Store featured placements.'
  }
];

export const LOGO_ASSETS = [
  { label: '16 × 16 Icon', fileName: 'icon16.png', srcUrl: '/assets/aistudio/16x16_3ac1a452.png', size: '16×16' },
  { label: '32 × 32 Icon', fileName: 'icon32.png', srcUrl: '/assets/aistudio/32x32_f7025603.png', size: '32×32' },
  { label: '48 × 48 Icon', fileName: 'icon48.png', srcUrl: '/assets/aistudio/48x48_5b9dac5e.png', size: '48×48' },
  { label: '128 × 128 Store Icon', fileName: 'icon128.png', srcUrl: '/assets/aistudio/128x128_46fd78d6.png', size: '128×128' },
  { label: 'Transparent UI Logo', fileName: 'logo.png', srcUrl: '/assets/aistudio/Logo-03_8ab3f1ff.png', size: '48×48 RGBA' }
];

export function StoreGraphicsGenerator() {
  const [bundlingZip, setBundlingZip] = useState(false);
  const [downloadedId, setDownloadedId] = useState<string | null>(null);

  const handleDownloadSingle = async (asset: StoreAssetSpec) => {
    try {
      const resp = await fetch(asset.srcUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = asset.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadedId(asset.id);
      setTimeout(() => setDownloadedId(null), 2500);
    } catch {
      window.location.href = asset.srcUrl;
    }
  };

  const handleDownloadAllStoreAssetsZip = async () => {
    try {
      setBundlingZip(true);
      const zip = new JSZip();
      const bannersFolder = zip.folder('store-banners');
      const iconsFolder = zip.folder('icons');

      for (const asset of STORE_ASSETS) {
        const resp = await fetch(asset.srcUrl);
        if (resp.ok && bannersFolder) {
          const blob = await resp.blob();
          bannersFolder.file(asset.fileName, blob);
        }
      }

      for (const logo of LOGO_ASSETS) {
        const resp = await fetch(logo.srcUrl);
        if (resp.ok && iconsFolder) {
          const blob = await resp.blob();
          iconsFolder.file(logo.fileName, blob);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'reactron-chrome-store-assets.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setBundlingZip(false);
    }
  };

  return (
    <section id="store-graphics" className="py-12 border-t border-[#374152]/70 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-mono text-[#F05A5A] tracking-wide mb-2">
            02. OFFICIAL CHROME WEB STORE BANNERS & BRAND ICONS
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#F4F6FA] tracking-tight">
            Uploaded Store Screenshots, Promo Tiles & Logo Set
          </h2>
          <p className="text-sm text-[#A9B3C4] mt-2 max-w-2xl">
            All 5 screenshots (<code className="font-mono text-[#F4F6FA]">1280×800</code>), Small Promo Tile (<code className="font-mono text-[#F4F6FA]">440×280</code>), and Marquee Promo Tile (<code className="font-mono text-[#F4F6FA]">1400×560</code>) are verified as strict 24-bit RGB PNGs (no alpha channel) ready for Chrome Web Store upload.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <a
            href="/assets/aistudio/128x128_46fd78d6.png"
            download="icon128.png"
            className="px-4 py-2.5 rounded-lg bg-[#222936] hover:bg-[#2C3545] border border-[#374152] text-xs font-semibold text-[#F4F6FA] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 text-[#F05A5A]" />
            Download 128×128 Store Icon
          </a>
          <button
            onClick={handleDownloadAllStoreAssetsZip}
            disabled={bundlingZip}
            className="px-4 py-2.5 rounded-lg bg-[#F05A5A] hover:bg-[#D94747] text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Archive className="w-4 h-4" />
            {bundlingZip ? 'Bundling Assets...' : 'Download All Store Assets (.zip)'}
          </button>
        </div>
      </div>

      {/* Uploaded Icon Set Row */}
      <div className="bg-[#222936] border border-[#374152] rounded-xl p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-bold text-[#F4F6FA]">
            Bundled Extension Icons & Transparent UI Logo (Included in reactron-extension.zip)
          </h3>
          <span className="text-xs font-mono text-[#55C5A0]">
            extension/icons/icon16 · icon32 · icon48 · icon128 · logo.png
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {LOGO_ASSETS.map((logo) => (
            <a
              key={logo.fileName}
              href={logo.srcUrl}
              download={logo.fileName}
              className="bg-[#171B24] hover:bg-[#1E2430] border border-[#374152] rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-colors"
            >
              <div className="w-12 h-12 flex items-center justify-center">
                <img
                  src={logo.srcUrl}
                  alt={logo.label}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="text-center">
                <div className="text-xs font-semibold text-[#F4F6FA]">{logo.label}</div>
                <div className="text-[11px] font-mono text-[#A9B3C4]">{logo.fileName} · {logo.size}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Uploaded Store Banners Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {STORE_ASSETS.map((asset) => (
          <div
            key={asset.id}
            className="bg-[#222936] border border-[#374152] rounded-xl p-5 flex flex-col justify-between gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-base font-bold text-[#F4F6FA]">{asset.title}</h3>
                <button
                  onClick={() => handleDownloadSingle(asset)}
                  className="px-3 py-1.5 rounded-md bg-[#171B24] hover:bg-[#F05A5A] text-[#F4F6FA] hover:text-white border border-[#374152] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {downloadedId === asset.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#55C5A0]" />
                      <span>Downloaded</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PNG</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs font-mono text-[#A9B3C4]">{asset.requirementLabel}</p>
              <p className="text-xs text-[#A9B3C4] leading-relaxed">{asset.caption}</p>
            </div>

            <div className="w-full overflow-hidden rounded-lg border border-[#374152] bg-[#18191B] flex items-center justify-center">
              <img
                src={asset.srcUrl}
                alt={asset.title}
                referrerPolicy="no-referrer"
                className="w-full h-auto block"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
