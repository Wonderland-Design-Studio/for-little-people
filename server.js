const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3005;
const PUBLIC_DIR = __dirname;
const WP_UPLOADS_DIR = 'C:\\Users\\asus\\git\\for little people\\wordpress';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8'
};

const STATIC_ASSET_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.mp4', '.webm', '.css', '.js', '.json', '.woff', '.woff2', '.ttf'
]);

const COMPRESSIBLE_TYPES = [
  'text/html',
  'text/css',
  'application/javascript',
  'application/json',
  'image/svg+xml',
  'text/plain'
];

function resolveFilePath(reqPath) {
  // 1. Normalize sub-route relative asset requests (e.g. /shop/assets/foo.png or /product/slug/assets/foo.png)
  const assetsIdx = reqPath.indexOf('/assets/');
  if (assetsIdx > 0) {
    reqPath = reqPath.slice(assetsIdx);
  }

  // 2. Map e-commerce clean routes to /shop.html
  const cleanRoute = reqPath.replace(/\/+$/, '').toLowerCase();
  if (
    cleanRoute === '/shop' ||
    cleanRoute === '/store' ||
    cleanRoute === '/bookshop' ||
    cleanRoute === '/cart' ||
    cleanRoute === '/checkout' ||
    cleanRoute.startsWith('/product/')
  ) {
    reqPath = '/shop.html';
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let candidate = path.join(PUBLIC_DIR, safePath);

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }

  // 3. Support WordPress /wp-content/uploads/... URLs by mapping to local assets or WP uploads folder
  if (reqPath.startsWith('/wp-content/uploads/')) {
    const wpCandidate = path.join(WP_UPLOADS_DIR, safePath);
    if (fs.existsSync(wpCandidate) && fs.statSync(wpCandidate).isFile()) {
      return wpCandidate;
    }
    const baseName = path.basename(reqPath);
    const strippedBase = baseName.replace(/-\d+x\d+(?=\.[a-zA-Z]+$)/, '');
    for (const name of [baseName, strippedBase]) {
      const assetMatch = path.join(PUBLIC_DIR, 'assets', name);
      if (fs.existsSync(assetMatch) && fs.statSync(assetMatch).isFile()) {
        return assetMatch;
      }
      const newsMatch = path.join(PUBLIC_DIR, 'assets', 'news', name);
      if (fs.existsSync(newsMatch) && fs.statSync(newsMatch).isFile()) {
        return newsMatch;
      }
    }
  }

  // 4. Fallback lookup by basename inside /assets and /assets/news for any image/static file
  const ext = path.extname(reqPath).toLowerCase();
  if (STATIC_ASSET_EXTS.has(ext)) {
    const baseName = path.basename(reqPath);
    const strippedBase = baseName.replace(/-\d+x\d+(?=\.[a-zA-Z]+$)/, '');
    for (const name of [baseName, strippedBase]) {
      const assetMatch = path.join(PUBLIC_DIR, 'assets', name);
      if (fs.existsSync(assetMatch) && fs.statSync(assetMatch).isFile()) {
        return assetMatch;
      }
      const newsMatch = path.join(PUBLIC_DIR, 'assets', 'news', name);
      if (fs.existsSync(newsMatch) && fs.statSync(newsMatch).isFile()) {
        return newsMatch;
      }
    }
    // Never return index.html for a missing image/script/stylesheet
    return null;
  }

  // 5. HTML route fallback to index.html
  const indexFallback = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexFallback) && fs.statSync(indexFallback).isFile()) {
    return indexFallback;
  }
  return null;
}

const server = http.createServer((req, res) => {
  try {
    // PayFast ITN (Instant Transaction Notification) Listener
    if (req.method === 'POST' && req.url.startsWith('/api/payfast-notify')) {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        console.log('[PayFast ITN Received]:', body);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      });
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const reqPath = decodeURIComponent(parsedUrl.pathname);
    const filePath = resolveFilePath(reqPath);

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    fs.stat(filePath, (statErr, finalStats) => {
      if (statErr || !finalStats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const etag = `W/"${finalStats.size.toString(16)}-${finalStats.mtimeMs.toString(16)}"`;

      // Check ETag for 304 Not Modified
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, {
          'ETag': etag,
          'Cache-Control': ext === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=604800, stale-while-revalidate=86400'
        });
        res.end();
        return;
      }

      // Cache-Control headers
      const cacheControl = ext === '.html'
        ? 'public, max-age=0, must-revalidate'
        : 'public, max-age=604800, stale-while-revalidate=86400';

      // --- HTTP 206 Range Request Support for Video Streaming (.mp4, .webm) ---
      if (ext === '.mp4' || ext === '.webm') {
        const range = req.headers.range;
        const fileSize = finalStats.size;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          if (start >= fileSize || end >= fileSize) {
            res.writeHead(416, {
              'Content-Range': `bytes */${fileSize}`,
              'Content-Type': contentType
            });
            res.end();
            return;
          }

          const chunksize = (end - start) + 1;
          const file = fs.createReadStream(filePath, { start, end });

          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'ETag': etag,
            'Access-Control-Allow-Origin': '*'
          });

          file.pipe(res);
          return;
        } else {
          res.writeHead(200, {
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'ETag': etag,
            'Access-Control-Allow-Origin': '*'
          });

          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      // --- Compression (Gzip / Deflate) for compressible text assets ---
      const acceptEncoding = req.headers['accept-encoding'] || '';
      const isCompressible = COMPRESSIBLE_TYPES.some(type => contentType.includes(type));

      if (isCompressible && acceptEncoding.includes('gzip')) {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Encoding': 'gzip',
          'Vary': 'Accept-Encoding',
          'Cache-Control': cacheControl,
          'ETag': etag,
          'Access-Control-Allow-Origin': '*'
        });

        const raw = fs.createReadStream(filePath);
        raw.pipe(zlib.createGzip()).pipe(res);
        return;
      } else if (isCompressible && acceptEncoding.includes('deflate')) {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Encoding': 'deflate',
          'Vary': 'Accept-Encoding',
          'Cache-Control': cacheControl,
          'ETag': etag,
          'Access-Control-Allow-Origin': '*'
        });

        const raw = fs.createReadStream(filePath);
        raw.pipe(zlib.createDeflate()).pipe(res);
        return;
      }

      // Standard uncompressed response
      res.writeHead(200, {
        'Content-Length': finalStats.size,
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'ETag': etag,
        'Access-Control-Allow-Origin': '*'
      });

      fs.createReadStream(filePath).pipe(res);
    });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`For Little People optimized server running at http://localhost:${PORT}`);
});
