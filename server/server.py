#!/usr/bin/env python

import threading
import time
import webbrowser
import BaseHTTPServer
import SimpleHTTPServer

from arduino import Arduino

FILE = 'index.html'
PORT = 8080

global ard
ard = Arduino()
ard.configure_serial('/dev/tty.usbserial-A4001Lf4')
#ard.configure_serial()
ard.start()

class TestHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
    """The test example handler."""

    def do_POST(self):
        """Handle a post request by returning the square of the number."""
        # poll arduino here
        #length = int(self.headers.getheader('content-length'))        
        #data_string = self.rfile.read(length)
        
        try:
            #result = int(data_string) ** 2
            packet = ard.get_packet()
        except:
            packet = (512,512,0,0)
        result = "%i,%i,%i,%i" % (packet)
        # result = "0,0"
        self.wfile.write(result)


def open_browser():
    """Start a browser after waiting for half a second."""
    def _open_browser():
        webbrowser.open('http://localhost:%s/%s' % (PORT, FILE))
    thread = threading.Timer(0.5, _open_browser)
    thread.start()

def start_server():
    """Start the server."""
    server_address = ("", PORT)
    server = BaseHTTPServer.HTTPServer(server_address, TestHandler)
    server.serve_forever()

if __name__ == "__main__":
    try:
        open_browser()
        start_server()
    except:
        ard.keepAlive = False
        ard.join()