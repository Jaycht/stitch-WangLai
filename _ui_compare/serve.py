import http.server, socketserver, os, sys
os.chdir(r"E:/Deployment/WorkBuddy/往来礼记/dist")
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split('?')[0].lstrip('/')
        fp = os.path.join(os.getcwd(), p)
        if not os.path.isfile(fp):
            self.path = '/index.html'
        return super().do_GET()
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8900), H) as httpd:
    httpd.serve_forever()
