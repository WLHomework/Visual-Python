# H6.4 smoke test for the P0 down-channeling (WROOM / ESP8266).
# Copy this file to the board as main.py (or paste it into the REPL) and reset.
# It only uses firmware modules: machine, os, sys, time.
# Wiring for the optional I2C checks:
#   ESP32-WROOM : SDA=GPIO21, SCL=GPIO22, LCD1602 0x27/0x3F, BH1750 0x23/0x5C
#   ESP8266     : SDA=GPIO4,  SCL=GPIO5,  LCD1602 0x27/0x3F, BH1750 0x23/0x5C
# GPIO2 is the onboard LED on both boards; GPIO5 is used for the PWM check.

import os
import sys
import time

import machine

IS_ESP8266 = sys.platform == "esp8266"
LED_PIN = 2
PWM_PIN = 5
ADC_MAX = 1023 if IS_ESP8266 else 4095
I2C_SDA = 4 if IS_ESP8266 else 21
I2C_SCL = 5 if IS_ESP8266 else 22

results = []


def report(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (" " + str(detail) if detail else ""))


def blink():
    led = machine.Pin(LED_PIN, machine.Pin.OUT)
    for _index in range(3):
        led.value(1 if IS_ESP8266 else 0)
        time.sleep_ms(120)
        led.value(0 if IS_ESP8266 else 1)
        time.sleep_ms(120)
    return "GPIO2 x3"


def read_adc():
    if IS_ESP8266:
        value = machine.ADC(0).read()
    else:
        value = machine.ADC(machine.Pin(32)).read()
    if value < 0 or value > ADC_MAX:
        raise ValueError("ADC out of range: " + str(value))
    return value


def pwm_sweep():
    pwm = machine.PWM(machine.Pin(PWM_PIN), freq=1000, duty=0)
    pwm.duty(512)
    time.sleep_ms(50)
    pwm.duty(1023)
    time.sleep_ms(50)
    pwm.deinit()
    return "GPIO5 1 kHz duty 512/1023"


def i2c_scan():
    i2c = machine.I2C(scl=machine.Pin(I2C_SCL), sda=machine.Pin(I2C_SDA), freq=400000)
    found = i2c.scan()
    return found


def lcd_text():
    import lcd1602

    i2c = machine.I2C(scl=machine.Pin(I2C_SCL), sda=machine.Pin(I2C_SDA), freq=400000)
    for address in (0x27, 0x3F):
        try:
            lcd = lcd1602.Lcd1602(i2c, address=address, cols=16, rows=2)
            lcd.text(0, 0, "H6.4 OK")
            lcd.clear()
            return hex(address)
        except OSError:
            continue
    raise OSError("LCD1602 not found at 0x27/0x3F")


def bh1750_lux():
    import bh1750

    i2c = machine.I2C(scl=machine.Pin(I2C_SCL), sda=machine.Pin(I2C_SDA), freq=400000)
    for address in (0x23, 0x5C):
        try:
            sensor = bh1750.BH1750(i2c, address=address)
            return (hex(address), round(sensor.read_lux(), 1))
        except OSError:
            continue
    raise OSError("BH1750 not found at 0x23/0x5C")


def main():
    print("H6.4 smoke test")
    print("platform:", sys.platform)
    print("uname:", os.uname())
    print("freq:", machine.freq())

    for name, function in (
        ("onboard LED", blink),
        ("ADC", read_adc),
        ("PWM", pwm_sweep),
    ):
        try:
            report(name, True, function())
        except Exception as error:
            report(name, False, repr(error))

    try:
        addresses = i2c_scan()
        report("I2C scan", True, [hex(address) for address in addresses])
        expected = [0x27, 0x3F, 0x23, 0x5C]
        print("INFO I2C expected one of", [hex(address) for address in expected])
    except Exception as error:
        report("I2C scan", False, repr(error))

    try:
        report("LCD1602", True, lcd_text())
    except Exception as error:
        print("SKIP LCD1602:", repr(error))

    try:
        address, lux = bh1750_lux()
        report("BH1750 lux", True, (address, lux))
    except Exception as error:
        print("SKIP BH1750 lux:", repr(error))

    passed = sum(1 for ok in results if ok)
    print("H6.4 RESULT:", str(passed) + "/" + str(len(results)), "checks passed")
    if passed == len(results):
        print("H6.4 OK")


main()
