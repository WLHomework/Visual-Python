# Source: original implementation for Visual Python (BMP280 datasheet, Bosch Sensortec).
# License: same terms as the Visual Python project; no third-party driver code copied.
# BMP280 temperature / pressure / altitude driver on MicroPython I2C.
# SDO low selects address 0x76, SDO high selects 0x77; power the module from 3.3 V.
# Static implementation for MicroPython v1.29.0; real-hardware accuracy still needs M5 validation.

import time

from micropython import const

_REG_CALIB = const(0x88)
_REG_ID = const(0xD0)
_REG_RESET = const(0xE0)
_REG_CTRL_MEAS = const(0xF4)
_REG_CONFIG = const(0xF5)
_REG_DATA = const(0xF7)

_SOFT_RESET = const(0xB6)
_CONFIG = const(0x00)  # t_sb = 0.5 ms, filter off, 3-wire off
_CTRL_MEAS = const(0x27)  # osrs_t = x1, osrs_p = x1, normal mode
_SEA_LEVEL_PRESSURE = 101325.0


def _signed16(value):
    if value > 32767:
        value -= 65536
    return value


class BMP280:
    def __init__(self, i2c, address=0x76):
        self.i2c = i2c
        self.address = address
        self._t_fine = 0
        chip_id = self.i2c.readfrom_mem(self.address, _REG_ID, 1)[0]
        if chip_id not in (0x58, 0x60):
            raise OSError("BMP280 not found")
        self.i2c.writeto_mem(self.address, _REG_RESET, bytes([_SOFT_RESET]))
        time.sleep_ms(10)
        self._read_calibration()
        self.i2c.writeto_mem(self.address, _REG_CONFIG, bytes([_CONFIG]))
        self.i2c.writeto_mem(self.address, _REG_CTRL_MEAS, bytes([_CTRL_MEAS]))
        time.sleep_ms(10)

    def _read_calibration(self):
        data = self.i2c.readfrom_mem(self.address, _REG_CALIB, 24)
        self._dig_t1 = data[0] | (data[1] << 8)
        self._dig_t2 = _signed16(data[2] | (data[3] << 8))
        self._dig_t3 = _signed16(data[4] | (data[5] << 8))
        self._dig_p1 = data[6] | (data[7] << 8)
        self._dig_p2 = _signed16(data[8] | (data[9] << 8))
        self._dig_p3 = _signed16(data[10] | (data[11] << 8))
        self._dig_p4 = _signed16(data[12] | (data[13] << 8))
        self._dig_p5 = _signed16(data[14] | (data[15] << 8))
        self._dig_p6 = _signed16(data[16] | (data[17] << 8))
        self._dig_p7 = _signed16(data[18] | (data[19] << 8))
        self._dig_p8 = _signed16(data[20] | (data[21] << 8))
        self._dig_p9 = _signed16(data[22] | (data[23] << 8))

    def _read_raw(self):
        data = self.i2c.readfrom_mem(self.address, _REG_DATA, 6)
        adc_p = (data[0] << 12) | (data[1] << 4) | (data[2] >> 4)
        adc_t = (data[3] << 12) | (data[4] << 4) | (data[5] >> 4)
        return adc_t, adc_p

    def _compensate_temperature(self, adc_t):
        var1 = (((adc_t >> 3) - (self._dig_t1 << 1)) * self._dig_t2) >> 11
        var2 = (((((adc_t >> 4) - self._dig_t1) * ((adc_t >> 4) - self._dig_t1)) >> 12) * self._dig_t3) >> 14
        self._t_fine = var1 + var2
        return ((self._t_fine * 5 + 128) >> 8) / 100.0

    def read_temperature(self):
        adc_t, _adc_p = self._read_raw()
        return self._compensate_temperature(adc_t)

    def read_pressure(self):
        adc_t, adc_p = self._read_raw()
        self._compensate_temperature(adc_t)
        var1 = self._t_fine - 128000
        var2 = var1 * var1 * self._dig_p6
        var2 = var2 + ((var1 * self._dig_p5) << 17)
        var2 = var2 + (self._dig_p4 << 35)
        var1 = ((var1 * var1 * self._dig_p3) >> 8) + ((var1 * self._dig_p2) << 12)
        var1 = (((1 << 47) + var1) * self._dig_p1) >> 33
        if var1 == 0:
            return 0.0
        pressure = 1048576 - adc_p
        pressure = (((pressure << 31) - var2) * 3125) // var1
        var1 = (self._dig_p9 * (pressure >> 13) * (pressure >> 13)) >> 25
        var2 = (self._dig_p8 * pressure) >> 19
        pressure = ((pressure + var1 + var2) >> 8) + (self._dig_p7 << 4)
        return pressure / 256.0

    def read_altitude(self):
        pressure = self.read_pressure()
        if pressure <= 0:
            return 0.0
        return 44330.0 * (1.0 - (pressure / _SEA_LEVEL_PRESSURE) ** 0.1903)
