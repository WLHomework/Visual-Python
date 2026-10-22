# Source: original implementation for Visual Python (DS3231 datasheet).
# License: same terms as the Visual Python project; no third-party driver code copied.
# DS3231 real-time clock driver on MicroPython I2C (fixed address 0x68).
# The driver always uses 24-hour mode and clears the oscillator-stop flag after setting.
# Static implementation for MicroPython v1.29.0; real-hardware accuracy still needs M5 validation.

import time

from micropython import const

_REG_TIME = const(0x00)
_REG_STATUS = const(0x0F)
_OSC_STOP_FLAG = const(0x80)
_WEEKDAY_TABLE = (0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)


class DS3231:
    def __init__(self, i2c, address=0x68):
        self.i2c = i2c
        self.address = address

    @staticmethod
    def _from_bcd(value):
        return (value >> 4) * 10 + (value & 0x0F)

    @staticmethod
    def _to_bcd(value):
        return ((value // 10) << 4) | (value % 10)

    @staticmethod
    def _weekday(year, month, day):
        if month < 3:
            year -= 1
        return (year + year // 4 - year // 100 + year // 400 + _WEEKDAY_TABLE[month - 1] + day) % 7 + 1

    def _read(self, register, length=1):
        return self.i2c.readfrom_mem(self.address, register, length)

    def _write(self, register, data):
        self.i2c.writeto_mem(self.address, register, data)

    def read_datetime(self):
        data = self._read(_REG_TIME, 7)
        second = self._from_bcd(data[0] & 0x7F)
        minute = self._from_bcd(data[1] & 0x7F)
        hour_register = data[2]
        if hour_register & 0x40:
            hour = self._from_bcd(hour_register & 0x1F)
            if hour_register & 0x20:
                hour = hour % 12 + 12
        else:
            hour = self._from_bcd(hour_register & 0x3F)
        weekday = data[3] & 0x07
        day = self._from_bcd(data[4] & 0x3F)
        month = self._from_bcd(data[5] & 0x1F)
        year = 2000 + self._from_bcd(data[6])
        return (year, month, day, weekday, hour, minute, second)

    def set_datetime(self, year, month, day, hour, minute, second):
        year = int(year)
        month = int(month)
        day = int(day)
        hour = int(hour)
        minute = int(minute)
        second = int(second)
        # Clamp every field so a wrong block input cannot write invalid BCD registers.
        if year < 2000:
            year = 2000
        if year > 2099:
            year = 2099
        if month < 1:
            month = 1
        if month > 12:
            month = 12
        if day < 1:
            day = 1
        if day > 31:
            day = 31
        if hour < 0:
            hour = 0
        if hour > 23:
            hour = 23
        if minute < 0:
            minute = 0
        if minute > 59:
            minute = 59
        if second < 0:
            second = 0
        if second > 59:
            second = 59
        weekday = self._weekday(year, month, day)
        self._write(_REG_TIME, bytes((
            self._to_bcd(second),
            self._to_bcd(minute),
            self._to_bcd(hour),
            weekday,
            self._to_bcd(day),
            self._to_bcd(month),
            self._to_bcd(year % 100),
        )))
        status = self._read(_REG_STATUS)[0]
        self._write(_REG_STATUS, bytes((status & 0x7F,)))
        time.sleep_ms(2)
