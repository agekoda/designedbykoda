// requires
// Adafruit GFX
// Adafruit AHTX0
// Adafruit SSD1306
// ENS160 - Adafruit Fork
// Sensirion I2C SPS30

#include <Arduino.h>
#include <Wire.h>
#include <SensirionI2cSps30.h>
#include <Adafruit_AHTX0.h>
#include <ScioSense_ENS160.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// pin definitions
#define SOIL1_PIN 1
#define SOIL2_PIN 2
#define SOIL3_PIN 3
#define SDA_PIN 9
#define SCL_PIN 8

// OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// sensor objects
SensirionI2cSps30 sps30;
Adafruit_AHTX0 aht;
ScioSense_ENS160 ens160;

// variables
static int16_t sps30Error;
static char errorMessage[64];

static uint16_t lastNc0p5 = 0xFFFF;
static uint8_t identicalReadCount = 0;
static uint8_t allZeroReadCount = 0;

float g_pm1 = 0, g_pm25 = 0, g_pm4 = 0, g_pm10 = 0;
float g_temp = 0, g_hum = 0;
uint16_t g_eco2 = 0, g_tvoc = 0;
uint8_t g_aqi = 0;
float g_soil1 = 0, g_soil2 = 0, g_soil3 = 0;

int8_t g_pm25Trend = 0;
int8_t g_pm10Trend = 0;
static uint16_t lastPm25Raw = 0xFFFF;
static uint16_t lastPm10Raw = 0xFFFF;

void drawScreen4_Dashboard();
void drawTrendArrow(int x, int y, int8_t trend);

void setup() {
  Serial.begin(115200);
  Serial.println("Device Starting...");

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Wire.begin(SDA_PIN, SCL_PIN);

  // OLED init
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 not found!");
    while (1);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // SPS30 - start measurement once and leave it running
  sps30.begin(Wire, SPS30_I2C_ADDR_69);

  sps30.stopMeasurement();
  delay(100);

  int8_t productType[8] = {0};
  sps30.readProductType(productType, 8);
  Serial.print("SPS30 type: ");
  Serial.println((char*)productType);

  sps30Error = sps30.startMeasurement(SPS30_OUTPUT_FORMAT_OUTPUT_FORMAT_UINT16);
  if (sps30Error != 0) {
    errorToString(sps30Error, errorMessage, sizeof(errorMessage));
    Serial.print("SPS30 start error: ");
    Serial.println(errorMessage);
  } else {
    Serial.println("SPS30 continuous measurement started");
  }

  Serial.println("Warming up SPS30 fan/laser...");
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Warming up");
  display.println("SPS30 sensor...");
  display.display();
  delay(10000);

  // AHT21
  if (!aht.begin()) {
    Serial.println("AHT21 not found!");
    while(1);
  }

  // ENS160
  if (!ens160.begin()) {
    Serial.println("ENS160 not found!");
    while(1);
  }
  ens160.setMode(ENS160_OPMODE_STD);
  delay(100);

  Serial.println("All sensors initialized successfully");
}

void loop() {
  // poll the ready flag until fresh data is actually available.
  uint16_t dataReady = 0;
  unsigned long readyWaitStart = millis();
  const unsigned long readyTimeoutMs = 2000;

  while (true) {
    int16_t readyError = sps30.readDataReadyFlag(dataReady);
    if (readyError != 0) {
      errorToString(readyError, errorMessage, sizeof(errorMessage));
      Serial.print("SPS30 ready-flag read error: ");
      Serial.println(errorMessage);
      dataReady = 0;
      break;
    }
    if (dataReady) break;
    if (millis() - readyWaitStart >= readyTimeoutMs) break;
    delay(100);
  }

  if (!dataReady) {
    Serial.println("SPS30 data not ready, timed out waiting...");
  } else {
    uint16_t pm1, pm25, pm4, pm10;
    uint16_t nc0p5, nc1p0, nc2p5, nc4p0, nc10p0, tps;

    sps30Error = sps30.readMeasurementValuesUint16(
      pm1, pm25, pm4, pm10,
      nc0p5, nc1p0, nc2p5, nc4p0, nc10p0, tps
    );

    if (sps30Error != 0) {
      errorToString(sps30Error, errorMessage, sizeof(errorMessage));
      Serial.print("SPS30 Error: ");
      Serial.println(errorMessage);
    } else {
      // stale-read check on the finer-resolution NC0.5 register.
      if (nc0p5 == lastNc0p5) {
        identicalReadCount++;
        if (identicalReadCount >= 5) {
          Serial.println("WARNING: SPS30 raw NC0.5 value identical for 5+ reads in a row - "
                          "sensor may not be updating (check wiring/power).");
        }
      } else {
        identicalReadCount = 0;
      }
      lastNc0p5 = nc0p5;

      if (nc0p5 == 0 && nc1p0 == 0 && nc2p5 == 0 && nc4p0 == 0 && nc10p0 == 0) {
        allZeroReadCount++;
        if (allZeroReadCount >= 5) {
          Serial.println("WARNING: SPS30 reporting all-zero particle counts repeatedly - "
                          "forcing a measurement restart to recover.");
          sps30.stopMeasurement();
          delay(200);
          sps30.startMeasurement(SPS30_OUTPUT_FORMAT_OUTPUT_FORMAT_UINT16);
          delay(2000); // brief settle time after restart
          allZeroReadCount = 0;
        }
      } else {
        allZeroReadCount = 0;
      }

      // PM2.5 / PM10 trend based on the raw registers sigh.
      if (pm25 > lastPm25Raw) g_pm25Trend = 1;
      else if (pm25 < lastPm25Raw) g_pm25Trend = -1;
      else g_pm25Trend = 0;
      lastPm25Raw = pm25;

      if (pm10 > lastPm10Raw) g_pm10Trend = 1;
      else if (pm10 < lastPm10Raw) g_pm10Trend = -1;
      else g_pm10Trend = 0;
      lastPm10Raw = pm10;

      g_pm1 = pm1 / 10.0;
      g_pm25 = pm25 / 10.0;
      g_pm4 = pm4 / 10.0;
      g_pm10 = pm10 / 10.0;

      // soil sensors
      int soil1 = analogRead(SOIL1_PIN);
      int soil2 = analogRead(SOIL2_PIN);
      int soil3 = analogRead(SOIL3_PIN);
      g_soil1 = soil1 * (3.3 / 4095.0);
      g_soil2 = soil2 * (3.3 / 4095.0);
      g_soil3 = soil3 * (3.3 / 4095.0);

      // AHT21
      sensors_event_t humidity_event, temp_event;
      aht.getEvent(&humidity_event, &temp_event);
      g_temp = temp_event.temperature;
      g_hum = humidity_event.relative_humidity;

      // ENS160
      for (int i = 0; i < 3; i++) {
        ens160.set_envdata(g_temp, g_hum);
        ens160.measure(true);
        g_eco2 = ens160.geteCO2();
        g_tvoc = ens160.getTVOC();
        g_aqi = ens160.getAQI();
        if (i < 2) delay(100);
      }

      Serial.printf(
        "PM1:%.1f PM2.5:%.1f PM4:%.1f PM10:%.1f Temp:%.2f Hum:%.2f eCO2:%u TVOC:%u AQI:%u\n",
        g_pm1, g_pm25, g_pm4, g_pm10, g_temp, g_hum, g_eco2, g_tvoc, g_aqi
      );

      display.clearDisplay();
      drawScreen4_Dashboard();
      display.display();
    }
  }
}

void drawScreen4_Dashboard() {
  char buf[8];

  char pm25Buf[8], pm10Buf[8];
  dtostrf(g_pm25, 4, 1, pm25Buf);
  dtostrf(g_pm10, 4, 1, pm10Buf);

  int16_t x1, y1;
  uint16_t w, h;

  display.setTextSize(1);
  display.getTextBounds("PM2.5", 0, 0, &x1, &y1, &w, &h);
  display.setCursor((64 - w) / 2, 0);
  display.print("PM2.5");

  display.getTextBounds("PM10", 0, 0, &x1, &y1, &w, &h);
  display.setCursor(64 + (64 - w) / 2, 0);
  display.print("PM10");

  display.setTextSize(2);
  display.setCursor(0, 9);
  display.print(pm25Buf);
  display.setCursor(64, 9);
  display.print(pm10Buf);

  drawTrendArrow(56, 12, g_pm25Trend);
  drawTrendArrow(120, 12, g_pm10Trend);

  display.setTextSize(1);
  display.setCursor(0, 27);
  display.printf("eCO2:%u  TVOC:%u", g_eco2, g_tvoc);

  display.setCursor(0, 38);
  dtostrf(g_temp, 4, 1, buf);
  display.print("Temp:");
  display.print(buf);
  display.print("C");

  display.setCursor(0, 48);
  dtostrf(g_hum, 4, 1, buf);
  display.print("Hum:");
  display.print(buf);
  display.print("%");

  // uptime, bottom left corner.
  display.setCursor(0, 57);
  display.printf("Up: %lus", millis() / 1000);

  char aqiBuf[4];
  sprintf(aqiBuf, "%u", g_aqi);

  display.setTextSize(1);
  display.getTextBounds("AQI", 0, 0, &x1, &y1, &w, &h);
  display.setCursor(SCREEN_WIDTH - w, 39);
  display.print("AQI");

  display.setTextSize(2);
  display.getTextBounds(aqiBuf, 0, 0, &x1, &y1, &w, &h);
  display.setCursor(SCREEN_WIDTH - w, SCREEN_HEIGHT - h);
  display.print(aqiBuf);
}

void drawTrendArrow(int x, int y, int8_t trend) {
  const int size = 4;
  if (trend > 0) {
    // up triangle
    display.fillTriangle(x, y + size, x + size, y + size, x + size / 2, y, SSD1306_WHITE);
  } else if (trend < 0) {
    // down triangle
    display.fillTriangle(x, y, x + size, y, x + size / 2, y + size, SSD1306_WHITE);
  }
}