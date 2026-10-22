# Source: original implementation for Visual Python (MPU-6050 register map, InvenSense).
# License: same terms as the Visual Python project; no third-party driver code copied.
# MPU6050 acceleration / angular velocity / temperature driver on MicroPython I2C.
# AD0 low selects 0x68, AD0 high selects 0x69; power the module from 3.3 V.
# Accel range is +/-2 g and gyro range is +/-250 deg/s; static implementation for v1.29.0.

import time

from micropython import const

_REG_CONFIG = const(0x1A)
_REG_GYRO_CONFIG = const(0x1B)
_REG_ACCEL_CONFIG = const(0x1C)
_REG_ACCEL_XOUT_H = const(0x3B)
_REG_PWR_MGMT_1 = const(0x6B)
_REG_WHO_AM_I = const(0x75)

_ACCEL_SCALE = 16384.0  # LSB per g at +/-2 g
_GYRO_SCALE = 131.0  # LSB per deg/s at +/-250 deg/s
_KNOWN_IDS = (0x68, 0x70, 0x71, 0x73, 0x98)


def _signed16(high, low):
    value = (high << 8) | low
    if value > 32767:
        value -= 65536
    return value


class MPU6050:
    def __init__(self, i2c, address=0x68):
        self.i2c = i2c
        self.address = address
        chip_id = self.i2c.readfrom_mem(self.address, _REG_WHO_AM_I, 1)[0]
        if chip_id not in _KNOWN_IDS:
            raise OSError("MPU6050 not found")
        self.i2c.writeto_mem(self.address, _REG_PWR_MGMT_1, b"\x00")
        time.sleep_ms(50)
        self.i2c.writeto_mem(self.address, _REG_CONFIG, b"\x03")
        self.i2c.writeto_mem(self.address, _REG_GYRO_CONFIG, b"\x00")
        self.i2c.writeto_mem(self.address, _REG_ACCEL_CONFIG, b"\x00")

    def _read_words(self, register, count):
        data = self.i2c.readfrom_mem(self.address, register, count * 2)
        return [_signed16(data[index], data[index + 1]) for index in range(0, count * 2, 2)]

    def read_acceleration(self):
        values = self._read_words(_REG_ACCEL_XOUT_H, 3)
        return (values[0] / _ACCEL_SCALE, values[1] / _ACCEL_SCALE, values[2] / _ACCEL_SCALE)

    def read_gyro(self):
        values = self._read_words(_REG_ACCEL_XOUT_H + 8, 3)
        return (values[0] / _GYRO_SCALE, values[1] / _GYRO_SCALE, values[2] / _GYRO_SCALE)

    def read_temperature(self):
        value = self._read_words(_REG_ACCEL_XOUT_H + 6, 1)[0]
        return value / 340.0 + 36.53
