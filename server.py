import os
import socket
import http.server
import socketserver
import errno

# Get the first IP from `hostname -I`
def get_local_ip():
    try:
        ip = os.popen("hostname -I").read().strip().split()[0]  # First IP
        return ip if ip else "127.0.0.1"  # Fallback
    except:
        return "127.0.0.1"

# Server settings
import argparse

parser = argparse.ArgumentParser(description='Serve YogaVasishtha locally with optional bind host')
parser.add_argument('--port', '-p', type=int, default=7000, help='Port to serve on')
parser.add_argument('--host', '-H', default='0.0.0.0', help='Host/IP to bind to (default all interfaces)')
parser.add_argument('--print-only', action='store_true', help='Print candidate URLs and exit (for testing)')
args = parser.parse_args()

PORT = args.port
HOST = args.host  # Bind address (e.g., 0.0.0.0 or 127.0.0.2)

# Custom handler to print the server link
class MyHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silence logs

# Dual-stack server (IPv4 + IPv6)
class DualStackServer(socketserver.TCPServer):
    def __init__(self, server_address, RequestHandlerClass, bind_and_activate=True):
        # Disable IPv6-only mode to support both IPv4 and IPv6
        self.address_family = socket.AF_INET6
        socketserver.TCPServer.__init__(self, server_address, RequestHandlerClass, bind_and_activate=False)
        # Allow both IPv4 and IPv6
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        if bind_and_activate:
            try:
                self.server_bind()
                self.server_activate()
            except:
                self.server_close()
                raise

# Try to find a free port starting from PORT
MAX_PORT = 8100  # Try up to this port
selected_port = None

# Try dual-stack first
for port in range(PORT, MAX_PORT + 1):
    try:
        with DualStackServer(('::', port), MyHandler) as test_server:
            selected_port = port
            test_server.server_close()  # Release immediately
            use_dual_stack = True
            break
    except OSError as e:
        if e.errno == errno.EADDRINUSE:
            continue
        # IPv6 not available, fall back to IPv4
        if selected_port is None and port == PORT:
            use_dual_stack = False
            # Try IPv4 only
            for port in range(PORT, MAX_PORT + 1):
                try:
                    with socketserver.TCPServer((HOST, port), MyHandler) as test_server:
                        selected_port = port
                        test_server.server_close()
                        break
                except OSError as e:
                    if e.errno == errno.EADDRINUSE:
                        continue
                    else:
                        raise
            break

if selected_port is None:
    print(f"❌ No available ports between {PORT} and {MAX_PORT}.")
    exit(1)

if __name__ == "__main__":
    # If user just wanted to print candidate URLs and exit, do so
    local_ip = get_local_ip()
    print(f"Candidate URLs for this host (bind host: {HOST}):")
    print(f"   • http://localhost:{PORT}/index.html  (localhost)")
    print(f"   • http://127.0.0.1:{PORT}/index.html  (fast localhost)")
    if HOST and HOST != '0.0.0.0' and HOST != '::':
        print(f"   • http://{HOST}:{PORT}/index.html  (bound host)")
    print(f"   • http://{local_ip}:{PORT}/index.html  (for network access)")
    print("📂 Make sure your files are in the same directory as this script.")
    print("🔗 Open the link in your browser.")
    if HOST == '0.0.0.0':
        print(f"💡 Tip: To serve on a specific loopback (distinct origin), run: python server.py --host 127.0.0.2 --port {PORT}")
    else:
        print(f"💡 Serving bound to {HOST}. You can install by opening http://{HOST}:{PORT}/index.html on device.")

    if args.print_only:
        exit(0)

    try:
        if use_dual_stack:
            httpd = DualStackServer(('::', selected_port), MyHandler)
            print(f"🚀 Serving at (IPv4 + IPv6) on port {selected_port}:")
        else:
            httpd = socketserver.TCPServer((HOST, selected_port), MyHandler)
            print(f"🚀 Serving at (IPv4 only) on host {HOST} port {selected_port}:")
    except Exception as e:
        # Fallback to IPv4 only binding to HOST
        httpd = socketserver.TCPServer((HOST, selected_port), MyHandler)
        print(f"🚀 Serving at (IPv4 only) on host {HOST} port {selected_port}:")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped.")


