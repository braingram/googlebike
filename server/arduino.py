#!/usr/bin/env python

import copy
import logging
import serial # require pySerial
import struct
import time # TIMING
import threading

testPort = '/dev/tty.usbserial-A700fjde'
logging.basicConfig(level=logging.WARNING)
#logging.basicConfig(level=logging.DEBUG)

class Arduino(threading.Thread):
    def __init__(self, hz=100):
        threading.Thread.__init__(self)
        self.cond = threading.Condition() # store condition for accessing shared data
        self.packet = (512,512,1,0)
        self.readBuffer = ""
        self.ser = None
        self.keepAlive = True
        self.iui = 1./float(hz) # inter-update-interval
    
    def configure_serial(self, port):
        if self.ser != None:
            self.ser.close()
            self.ser = None
        self.ser = serial.Serial(port, 14400, timeout=1)
        return self.ser.isOpen()
    
    def parse_packet(self, packet):
        t = packet.strip().split(',')
        h = int(t[0])
        v = int(t[1])
        c = int(t[2])
        r = int(t[3])
        print (h,v,c,r)
        return (h, v, c, r)
    
    def read_packet(self):
        self.readBuffer = self.ser.readline()
        
        if not ',' in self.readBuffer:
            logging.debug('packet missing comma')
            return False, None
        
        ci = self.readBuffer.index(',')
        if ci == 0:
            logging.debug('comma at 0?')
            return False, None
        
        try:
            packet = self.parse_packet(self.readBuffer)
        except Exception as e:
            logging.debug('exception while parsing: %r' % e)
            return False, None
        return True, packet
    
    # def parse_packet(self, packet):
    #     x, y, c, r = struct.unpack('HH?B',packet[:6])
    #     x &= 0x03ff # truncate x to use only 10 bits
    #     y &= 0x03ff # truncate to 10 bits
    #     return x,y,c,r
    # 
    # def read_packet(self):
    #     while not '\r\n' in self.readBuffer:
    #         self.readBuffer += self.ser.read(8)
    #     
    #     cr = self.readBuffer.index('\r\n')
    #     if cr < 6:
    #         logging.debug('malformed packet cr(%i) %i' % (cr, len(self.readBuffer)))
    #         self.readBuffer = self.readBuffer[cr+2:]
    #         logging.debug('shorted packet to %i' % len(self.readBuffer))
    #         return False, None
    #     
    #     packet = self.parse_packet(self.readBuffer[cr-6:cr])
    #     self.readBuffer = self.readBuffer[cr+2:]
    #     return True, packet
    
    # def read_packet(self):
    #     packet = None
    #     if len(self.readBuffer) < 8:
    #         self.readBuffer += self.ser.read(8-len(self.readBuffer))
    #     
    #     if len(self.readBuffer) < 8:
    #         # not enough data in serial buffer
    #         logging.debug('short packet %i' % len(self.readBuffer))
    #         return False, packet
    #     
    #     if not '\r\n' in self.readBuffer:
    #         # bad read
    #         logging.debug('no carriage return, clearing buffer %i' % len(self.readBuffer))
    #         if self.readBuffer[-1] == '\r':
    #             # give it one more chance to get the '\n'
    #             self.readBuffer = self.readBuffer[1:]
    #         else:
    #             # this is all junk I think
    #             self.readBuffer = ""
    #         return False, packet
    #     
    #     cr = self.readBuffer.index('\r\n')
    #     if cr != 6:
    #         # packet is malformed, chop off leading chars
    #         logging.debug('malformed packet cr(%i) %i' % (cr, len(self.readBuffer)))
    #         self.readBuffer = self.readBuffer[cr+2:] # don't include \r or \n that should follow
    #         logging.debug('shorted packet to %i' % len(self.readBuffer))
    #         return False, packet
    #     
    #     # the packet is good!
    #     packet = self.parse_packet(self.readBuffer[:cr])
    #     self.readBuffer = self.readBuffer[cr+2:]
    #     return True, packet
    
    def run(self):
        if self.ser == None:
            raise IOError, "Serial port not configured"
        
        # continually poll arduino
        while self.keepAlive:
            success, packet = self.read_packet()
            if not success:
                logging.debug('Bad packet, sleeping...')
                time.sleep(self.iui/2.)
                continue
            
            logging.debug('Found good packet: %4i %4i %1i %3i' % packet)
            
            # get condition
            self.cond.acquire()
            self.packet = packet
            self.cond.release()
            
            time.sleep(self.iui)
    
    def get_packet(self):
        # check condition
        self.cond.acquire()
        
        # save packet
        p = copy.deepcopy(self.packet)
        
        # release condition
        self.cond.release()
        
        return p
    
    def __del__(self):
        if self.ser != None:
            self.ser.close()
            self.ser = None

if __name__ == "__main__":
    a = Arduino()
    print "Configuring serial port"
    a.configure_serial(testPort)
    
    print "Starting thread..."
    a.start()
    
    
    time.sleep(1.)
    
    prevTime = time.time()
    
    print "Poll loop..."
    try:
        while 1:
            print "poll",
            p = a.get_packet()
            dt = int((time.time() - prevTime) * 1000.)
            print "%4i %4i %1i %3i : %i" % (p[0], p[1], p[2], p[3], dt)
            prevTime = time.time()
        
            time.sleep(0.1)
    except:
        a.keepAlive = False
        a.join()

# ser = serial.Serial('/dev/tty.usbserial-A4001Lf4', 9600, timeout=1)
# 
# prevTime = time.time() # TIMING
# currentPacket = ""
# 
# while 1:
#     try:
#         while len(currentPacket) < 8:
#             currentPacket += ser.readline()
#         
#         # ------ deal with bad packets ------
#         if currentPacket[-2:] != '\r\n' or len(currentPacket) != 8:
#             print "Bad packet! Length =", len(currentPacket),
#             for c in currentPacket:
#                 print hex(ord(c)),
#             print
#             if '\r\n' in currentPacket: # try to find the end of the offending packet
#                 i = currentPacket.index('\r\n')
#                 if i + 2 < len(currentPacket):
#                     currentPacket = currentPacket[i+2:]
#                 else:
#                     currentPacket = ""
#             else:
#                 currentPacket = ""
#             continue
#         
#         # ------ parse good packet ------
#         x, y, c, r = parse_packet(currentPacket)
#         dt = int((time.time() - prevTime) * 1000.) # TIMING
#         print "%4i %4i %r %3i : %i" % (x, y, c, r, dt)
#         prevTime = time.time() # TIMING
#         #print len(currentPacket),x,y,c,r
#         
#         # ------ reset packet ------
#         currentPacket = ""
#     except:
#         ser.close()
#         raise Exception