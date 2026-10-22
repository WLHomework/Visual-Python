# Source: original implementation for Visual Python (HD44780/PCF8574 datasheet protocol).
# License: same terms as the Visual Python project; no third-party driver code copied.
# LCD1602 driver for a PCF8574 I2C backpack on MicroPython.
# Backpack mapping: P0=RS, P1=RW, P2=EN, P3=backlight, P4-P7=D4-D7.
# Use a 3.3 V-safe backpack or a level shifter; never feed 5 V I2C signals into the ESP32-S3.
# Static implementation for MicroPython v1.29.0; real-hardware timing still needs M3 validation.

import time

from micropython import const

_RS = const(0x01)
_EN = const(0x04)
_BACKLIGHT = const(0x08)
_COMMAND = const(0x00)
_DATA = const(0x01)
_ROW_OFFSETS = (0x00, 0x40, 0x14, 0x54)


class Lcd1602:
    def __init__(self, i2c, address=0x27, cols=16, rows=2, backlight=True):
        self.i2c = i2c
        self.address = address
        self.cols = int(cols)
        self.rows = int(rows)
        if self.cols < 1:
            self.cols = 1
        if self.cols > 20:
            self.cols = 20
        if self.rows < 1:
            self.rows = 1
        if self.rows > 4:
            self.rows = 4
        self._backlight = _BACKLIGHT if backlight else 0
        self._last = 0
        # HD44780 needs a short power-on delay and the 8-bit/4-bit wake-up sequence.
        time.sleep_ms(50)
        self._write_nibble(0x30)
        time.sleep_ms(5)
        self._write_nibble(0x30)
        time.sleep_ms(1)
        self._write_nibble(0x30)
        time.sleep_ms(1)
        self._write_nibble(0x20)
        time.sleep_ms(1)
        self._command(0x28)  # 4-bit, 2 or 4 lines, 5x8 font
        self._command(0x0C)  # display on, cursor off
        self._command(0x06)  # cursor moves right after each character
        self.clear()

    def _write_nibble(self, value):
        self._last = value
        self.i2c.writeto(self.address, bytes([self._last | self._backlight | _EN]))
        time.sleep_us(50)
        self.i2c.writeto(self.address, bytes([self._last | self._backlight]))
        time.sleep_us(50)

    def _write_byte(self, value, mode):
        self._write_nibble((value & 0xF0) | mode)
        self._write_nibble(((value << 4) & 0xF0) | mode)

    def _command(self, value):
        self._write_byte(value, _COMMAND)

    def _data(self, value):
        self._write_byte(value, _DATA)

    def clear(self):
        self._command(0x01)
        time.sleep_ms(2)

    def move_to(self, row, col):
        if row < 0:
            row = 0
        if row > 3:
            row = 3
        if col < 0:
            col = 0
        if col >= self.cols:
            col = self.cols - 1
        self._command(0x80 | (_ROW_OFFSETS[row] + col))

    def text(self, row, col, text):
        self.move_to(row, col)
        for char in str(text):
            code = ord(char)
            if code < 32 or code > 126:
                code = 63  # '?'
            self._data(code)

    def set_backlight(self, on):
        self._backlight = _BACKLIGHT if on else 0
        self.i2c.writeto(self.address, bytes([self._last | self._backlight]))
