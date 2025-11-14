#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11
#define LED1_PIN 15 
#define LED2_PIN 22 
#define LED3_PIN 23 
#define LDR_PIN 34 

const int ADC_MAX_VALUE = 4095;
const int MAX_ESTIMATED_LUX = 2000;

const char* ssid = "iPhone (52)";
const char* password = "12345678";
const char* mqtt_server = "172.20.10.3";
const int mqtt_port = 1883;
const char* mqtt_user = "esp32";
const char* mqtt_pass = "1234567";

const char* TOPIC_SENSOR = "datasensor/all";
const char* TOPIC_CONTROL_LED1 = "esp32/led1/control";
const char* TOPIC_CONTROL_LED2 = "esp32/led2/control";
const char* TOPIC_CONTROL_LED3 = "esp32/led3/control";


const char* TOPIC_STATUS_LED1 = "esp32/led1/status";
const char* TOPIC_STATUS_LED2 = "esp32/led2/status";
const char* TOPIC_STATUS_LED3 = "esp32/led3/status";



WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(DHTPIN, DHTTYPE);

int currentLed1State = 0;
int currentLed2State = 0;
int currentLed3State = 0;


void publishLEDStatus(const char* statusTopic, int state) {
  char statusMsg[2];
  snprintf(statusMsg, sizeof(statusMsg), "%d", state);
  client.publish(statusTopic, statusMsg);
}

void controlLED(int pin, int* currentState, int newState, const char* deviceName, const char* statusTopic) {
  digitalWrite(pin, newState);
  *currentState = newState;
  publishLEDStatus(statusTopic, newState);
}

void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.trim();

  int state;
  if (msg == "1") state = 1;
  else if (msg == "0") state = 0;
  else return;

  if (String(topic) == TOPIC_CONTROL_LED1) {
    controlLED(LED1_PIN, &currentLed1State, state, "Light", TOPIC_STATUS_LED1);
  } else if (String(topic) == TOPIC_CONTROL_LED2) {
    controlLED(LED2_PIN, &currentLed2State, state, "AC", TOPIC_STATUS_LED2);
  } else if (String(topic) == TOPIC_CONTROL_LED3) {
    controlLED(LED3_PIN, &currentLed3State, state, "Fan", TOPIC_STATUS_LED3);
  }
}

void setup_wifi() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void reconnect() {
  while (!client.connected()) {
    if (client.connect("ESP32Client", mqtt_user, mqtt_pass)) {
      client.subscribe(TOPIC_CONTROL_LED1);
      client.subscribe(TOPIC_CONTROL_LED2);
      client.subscribe(TOPIC_CONTROL_LED3);


      publishLEDStatus(TOPIC_STATUS_LED1, currentLed1State);
      publishLEDStatus(TOPIC_STATUS_LED2, currentLed2State);
      publishLEDStatus(TOPIC_STATUS_LED3, currentLed3State);

      break;
    } else {
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(9600);
  
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);

  
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);


  dht.begin();
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

unsigned long lastMsg = 0;

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > 5000) {
    lastMsg = now;
    
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    int ldr_raw = analogRead(LDR_PIN);
    int ldr_inverted = ADC_MAX_VALUE - ldr_raw;
    int light = map(ldr_inverted, 0, ADC_MAX_VALUE, 0, MAX_ESTIMATED_LUX);
    if (light < 0) light = 0;

    if (!isnan(t) && !isnan(h)) {
      char payload[128];
      snprintf(payload, sizeof(payload), 
               "{\"temperature\":%.2f,\"humidity\":%.2f,\"light\":%d}",
               t, h, light);
      client.publish(TOPIC_SENSOR, payload);
    }
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }
}