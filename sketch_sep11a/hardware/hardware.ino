#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// --- KHAI BÁO CẢM BIẾN & CHÂN KẾT NỐI ---
#define DHTPIN 4
#define DHTTYPE DHT11

#define LED1_PIN 15 
#define LED2_PIN 22 
#define LED3_PIN 23 

#define LDR_PIN 34 

const int ADC_MAX_VALUE = 4095;
const int MAX_ESTIMATED_LUX = 2000;

// --- CẤU HÌNH WIFI & MQTT ---
const char* ssid = "iPhone (52)";
const char* password = "12345678";
const char* mqtt_server = "172.20.10.2";
const int mqtt_port = 1883;
const char* mqtt_user = "esp32";
const char* mqtt_pass = "1234567";

// --- TOPICS ---
const char* TOPIC_SENSOR = "datasensor/all";
const char* TOPIC_CONTROL_LED1 = "esp32/led1/control";
const char* TOPIC_CONTROL_LED2 = "esp32/led2/control";
const char* TOPIC_CONTROL_LED3 = "esp32/led3/control";

// --- TOPICS PHẢN HỒI TRẠNG THÁI ---
const char* TOPIC_STATUS_LED1 = "esp32/led1/status";
const char* TOPIC_STATUS_LED2 = "esp32/led2/status";
const char* TOPIC_STATUS_LED3 = "esp32/led3/status";

WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(DHTPIN, DHTTYPE);

// --- BIẾN TOÀN CỤC LƯU TRỮ TRẠNG THÁI LOGIC (1=ON, 0=OFF) ---
int currentLed1State = 0;
int currentLed2State = 0;
int currentLed3State = 0;

// --- HÀM GỬI PHẢN HỒI TRẠNG THÁI ---
void publishLEDStatus(const char* statusTopic, int state) {
  char statusMsg[2];
  snprintf(statusMsg, sizeof(statusMsg), "%d", state);
  
  if (client.publish(statusTopic, statusMsg)) {
    Serial.printf("Published status [%s]: %s\n", statusTopic, statusMsg);
  } else {
    Serial.printf("Failed to publish status [%s]\n", statusTopic);
  }
}

// --- HÀM XỬ LÝ LỆNH ĐIỀU KHIỂN TỪ MQTT  ---
void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.trim();

  Serial.printf("Recv [%s]: %s (Length: %d)\n", topic, msg.c_str(), length);

  int state;
  if (msg == "1") {
    state = 1;
  } else if (msg == "0") {
    state = 0;
  } else {
    Serial.println("Invalid state received (not 1 or 0)");
    return;
  }

  int physicalState = state;

  // Xử lý LED1
  if (String(topic) == TOPIC_CONTROL_LED1) {
    digitalWrite(LED1_PIN, physicalState);
    currentLed1State = state;
    Serial.printf("💡 LED1 is now %s\n", (state == 1) ? "ON" : "OFF");
    
    // GỬI PHẢN HỒI TRẠNG THÁI 
    publishLEDStatus(TOPIC_STATUS_LED1, state);
  }
  
  // Xử lý LED2
  if (String(topic) == TOPIC_CONTROL_LED2) {
    digitalWrite(LED2_PIN, physicalState);
    currentLed2State = state;
    Serial.printf("❄️ LED2 (AC) is now %s\n", (state == 1) ? "ON" : "OFF");
    
    // GỬI PHẢN HỒI TRẠNG THÁI 
    publishLEDStatus(TOPIC_STATUS_LED2, state);
  }
  
  // Xử lý LED3
  if (String(topic) == TOPIC_CONTROL_LED3) {
    digitalWrite(LED3_PIN, physicalState);
    currentLed3State = state;
    Serial.printf("LED3 (Fan) is now %s\n", (state == 1) ? "ON" : "OFF");
    
    // GỬI PHẢN HỒI TRẠNG THÁI 
    publishLEDStatus(TOPIC_STATUS_LED3, state);
  }
}

// --- HÀM KẾT NỐI LẠI WIFI ---
void setup_wifi() {
  Serial.print("📶 Connecting to "); 
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi connected");
  Serial.print("📡 IP address: ");
  Serial.println(WiFi.localIP());
}

// --- HÀM KẾT NỐI LẠI MQTT ---
void reconnect() {
  while (!client.connected()) {
    Serial.print("🔌 Attempting MQTT connection...");
    
    if (client.connect("ESP32Client", mqtt_user, mqtt_pass)) {
      Serial.println("MQTT connected");
      
      // Subscribe các topic điều khiển
      client.subscribe(TOPIC_CONTROL_LED1);
      client.subscribe(TOPIC_CONTROL_LED2);
      client.subscribe(TOPIC_CONTROL_LED3);
      
      Serial.println("Subscribed to control topics");
      
      // GỬI TRẠNG THÁI HIỆN TẠI KHI KẾT NỐI LẠI 
      Serial.println("Publishing current device status...");
      publishLEDStatus(TOPIC_STATUS_LED1, currentLed1State);
      delay(100);
      publishLEDStatus(TOPIC_STATUS_LED2, currentLed2State);
      delay(100);
      publishLEDStatus(TOPIC_STATUS_LED3, currentLed3State);
      
    } else {
      Serial.print("MQTT failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5s");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n ESP32 IoT Device Starting...");

  // Khởi tạo chân LED
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);

  // Đảm bảo tất cả LED tắt khi khởi động
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(LED3_PIN, LOW);

  currentLed1State = 0;
  currentLed2State = 0;
  currentLed3State = 0;

  // Khởi tạo cảm biến
  dht.begin();
  
  // Kết nối mạng
  setup_wifi();
  
  // Thiết lập MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  
  Serial.println("Setup completed");
}

unsigned long lastMsg = 0;
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Gửi dữ liệu cảm biến mỗi 5 giây
  if (millis() - lastMsg > 5000) {
    lastMsg = millis();
    
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    int ldr_raw = analogRead(LDR_PIN);
    int ldr_inverted = ADC_MAX_VALUE - ldr_raw;
    int light = map(ldr_inverted, 0, ADC_MAX_VALUE, 0, MAX_ESTIMATED_LUX);
    if (light < 0) light = 0;

    int led1State = currentLed1State;
    int led2State = currentLed2State;
    int led3State = currentLed3State;

    if (!isnan(t) && !isnan(h)) {
      char payload[256];
      snprintf(payload, sizeof(payload), 
               "{\"temperature\":%.2f,\"humidity\":%.2f,\"light\":%d,\"led1\":%d,\"led2\":%d,\"led3\":%d}",
               t, h, light, led1State, led2State, led3State);

      if (client.publish(TOPIC_SENSOR, payload)) {
        Serial.printf("Published sensor data -> %s\n", payload);
      } else {
        Serial.println("Failed to publish sensor data");
      }
    } else {
      Serial.println("Failed to read from DHT sensor!");
    }
  }
}