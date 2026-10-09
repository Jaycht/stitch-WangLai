"""带 SPA fallback 的静态服务器 —— 给 Playwright 验证用。

为什么不用 `python -m http.server`：
  本应用是 history 路由（点「我的」后地址栏变成 /me），
  直接 reload 会请求 /me，普通静态服务器返回 404，页面白屏。
  vite preview 自带 fallback，但在本沙箱里后台起不稳，
  所以自己写一个最小的 fallback 服务器（多线程，避免串行卡顿）。
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist'))
os.chdir(ROOT)


class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split('?')[0].lstrip('/')
        fp = os.path.join(ROOT, p)
        if not os.path.isfile(fp):
            self.path = '/index.html'
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    with Server(("127.0.0.1", port), H) as httpd:
        print(f'serving {ROOT} on http://127.0.0.1:{port}', flush=True)
        httpd.serve_forever()
