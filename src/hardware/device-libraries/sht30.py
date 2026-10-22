# Source: original implementation for Visual Python (SHT30 datasheet, Sensirion).
# License: same terms as the Visual Python project; no third-party driver code copied.
# SHT30 temperature / humidity driver on MicroPython I2C.
# ADDR low selects 0x44, ADDR high selects 0x45; every reading is CRC-checked.
# Static implementation for MicroPython v1.29.0; real-hardware accuracy still needs M5 validation.

import time

_MEASURE_HIGH = b"\x2c\x06"
_SOFT_RESET = b"\x30\xa2"


def _crc8(data):
    crc = 0xFF
    for byte in data:
        crc ^= byte
        for _bit in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x31) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return crc


class SHT30:
    def __init__(self, i2c, address=0x44):
        self.i2c = i2c
        self.address = address
        self.i2c.writeto(self.address, _SOFT_RESET)
        time.sleep_ms(2)

    def _measure(self):
        self.i2c.writeto(self.address, _MEASURE_HIGH)
        time.sleep_ms(20)
        data = self.i2c.readfrom(self.address, 6)
        if _crc8(data[0:2]) != data[2] or _crc8(data[3:5]) != data[5]:
            raise OSError("SHT30 checksum error")
        temperature = -45.0 + 175.0 * (((data[0] << 8) | data[1]) / 65535.0)
        humidity = 100.0 * (((data[3] << 8) | data[4]) / 65535.0)
        if humidity < 0.0:
            humidity = 0.0
        if humidity > 100.0:
            humidity = 100.0
        return temperature, humidity

    def read_temperature(self):
        return self._measure()[0]

    def read_humidity(self):
        return self._measure()[1]
