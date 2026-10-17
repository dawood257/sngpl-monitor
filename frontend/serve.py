#!/usr/bin/env python3
"""Serve the new UI on its own port, next to the production app.

    python3 serve.py --port 3001 --cert /path/fullchain.pem --key /path/privkey.pem
    python3 serve.py --port 3001            # plain HTTP, for a quick local test

The UI talks to the API on port 3000 automatically (see config.js). No build step is needed.
"""
import argparse, functools, http.server, os, ssl


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', type=int, default=3001)
    ap.add_argument('--bind', default='0.0.0.0')
    ap.add_argument('--dir', default=os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument('--cert'); ap.add_argument('--key')
    a = ap.parse_args()
    httpd = http.server.ThreadingHTTPServer((a.bind, a.port), functools.partial(Handler, directory=a.dir))
    if a.cert:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(a.cert, a.key); httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    print(f"Serving {a.dir} on {'https' if a.cert else 'http'}://{a.bind}:{a.port}  (Ctrl+C to stop)")
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass


if __name__ == '__main__':
    main()
