
// ---- cadence sensor ----
int reedPin = 3; // Reed switch connected to digital pin
volatile byte rotationCount = 0; // will be used in interrrupt

void rotation() {
  byte buff = 0x00;
  for (byte i = 0; i < 8; i++) {
    buff |= !digitalRead(reedPin) << i;
  } 
  if (buff == 0xff) {
    rotationCount += 1;
  }
//  if (!digitalRead(reedPin)) {
//    if (!digitalRead(reedPin)) { // crappy debouncing
//      rotationCount += 1;
//    }
//  }
}

// ---- joystick ----
int vPin = 0; // analog input for vertical-axis of joystick
int v = 0; // variable to store vertical-axis position
int hPin = 1; // analog input for horizontal-axis of joystick
int h = 0; // variable to store horizontal-axis position
int clickPin = 2; // digital input for push-down button on joystick
int click = 0;


// ---- protocol ----
// 001123\0 : 00 = X, 11 = Y, 2 = click, 3 = rotationCount, \0 = null termination
//                 1   2   3   4   5   6   7   8   9  10
//char packet[11] = {'0','0','0','0','0','0','0','0','0','0','\0'};

// --------------------------------

void setup() {
  // start serial connection to relay data to python
  Serial.begin(14400); // Is this a good baud rate?
  
  // set pin connected to reed switch to input
  pinMode(reedPin, INPUT);
  // set reed pin pull up resistor
  digitalWrite(reedPin, HIGH);
  // attach interrupt to reed pin
  attachInterrupt(1, rotation, FALLING);
  
  // configure joystick
  // set press clickPin as input
  pinMode(clickPin, INPUT);
  // enable pull-up resistor on clickPin
  digitalWrite(clickPin, HIGH);
  
}

void loop() {
  // read analog values
  v = analogRead(vPin);
  h = analogRead(hPin);
  click = digitalRead(clickPin);
  
  // build packet
//  packet[0] = highByte(x);
//  packet[1] = lowByte(x);
//  packet[2] = highByte(y);
//  packet[3] = lowByte(y);
//  packet[4] = byte(click);
//  packet[5] = rotationCount;
  
  // sent packet
  //Serial.println(rotationCount);
  Serial.print(h);
  Serial.print(',');
  Serial.print(v);
  Serial.print(',');
  Serial.print(click);
  Serial.print(',');
  Serial.println(rotationCount,DEC);
//  Serial.println(packet);
  delay(10);
}
