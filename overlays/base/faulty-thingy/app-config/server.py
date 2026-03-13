#!/usr/bin/env python3
"""
Plain HTTP 200 server — always returns 200 OK.
TCP handshake delay and SYN-ACK drops are handled entirely by the network
configuration in server.sh. This code only runs after the connection is
finally established.
"""
import http.server, json

class OKHandler(http.server.BaseHTTPRequestHandler):

    def do_GET(self):
        body = json.dumps({
            "status":  "ok",
            "message": "everything is fine",
            "path":    self.path,
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        print(f"[200 OK] {self.client_address[0]} {self.path}", flush=True)

    def log_message(self, fmt, *args):
        pass

print("HTTP server on :8080 (handshake behavior configured by server.sh)", flush=True)
http.server.ThreadingHTTPServer(("0.0.0.0", 8080), OKHandler).serve_forever()
