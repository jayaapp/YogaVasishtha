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
PORT = 8000
HOST = get_local_ip()

# Custom handler to print the server link
class MyHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silence logs

# Try to find a free port starting from PORT
MAX_PORT = 8100  # Try up to this port
selected_port = None
for port in range(PORT, MAX_PORT + 1):
    try:
        with socketserver.TCPServer((HOST, port), MyHandler) as test_server:
            selected_port = port
            test_server.server_close()  # Release immediately
            break
    except OSError as e:
        if e.errno == errno.EADDRINUSE:
            continue
        else:
            raise
if selected_port is None:
    print(f"❌ No available ports between {PORT} and {MAX_PORT}.")
    exit(1)

if __name__ == "__main__":
    with socketserver.TCPServer((HOST, selected_port), MyHandler) as httpd:
        print(f"🚀 Serving at: http://{HOST}:{selected_port}/index.html")
        print("📂 Make sure your files are in the same directory as this script.")
        print("🔗 Open the link in your browser.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped.")

