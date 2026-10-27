import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function packExtension() {
  const extensionDir = path.resolve('extension');
  const publicDir = path.resolve('public');
  
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const zip = new JSZip();

  function addDirectoryToZip(dirPath, zipFolder) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      if (item === '.DS_Store' || item === 'Thumbs.db') continue;
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const subFolder = zipFolder.folder(item);
        addDirectoryToZip(fullPath, subFolder);
      } else {
        const fileContent = fs.readFileSync(fullPath);
        zipFolder.file(item, fileContent);
      }
    }
  }

  console.log('Adding extension v1.0.0 production files to ZIP...');
  addDirectoryToZip(extensionDir, zip);

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  const zipPathPrimary = path.join(publicDir, 'reactron-extension.zip');
  fs.writeFileSync(zipPathPrimary, zipBuffer);

  // Also copy icon128.png to public/ so it can be downloaded directly from the Store Assets portal
  const icon128Src = path.join(extensionDir, 'icons', 'icon128.png');
  const icon128Dest = path.join(publicDir, 'icon128.png');
  if (fs.existsSync(icon128Src)) {
    fs.copyFileSync(icon128Src, icon128Dest);
  }

  console.log(`Successfully created: ${zipPathPrimary} (${(zipBuffer.length / 1024).toFixed(2)} KB)`);
}

packExtension().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
