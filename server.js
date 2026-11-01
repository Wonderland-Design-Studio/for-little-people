const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3005;
const PUBLIC_DIR = __dirname;

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

const COMPRESSIBLE_TYPES = [
  'text/html',
  'text/css',
  'application/javascript',
  'application/json',
  'image/svg+xml',
  'text/plain'
];

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let reqPath = decodeURIComponent(parsedUrl.pathname);

    if (reqPath === '/' || reqPath === '') {
      reqPath = '/index.html';
    }

    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(PUBLIC_DIR, safePath);

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        filePath = path.join(PUBLIC_DIR, 'index.html');
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
    });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`For Little People optimized server running at http://localhost:${PORT}`);
});
