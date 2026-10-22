# Source: original implementation for Visual Python (TM1637 datasheet protocol).
# License: same terms as the Visual Python project; no third-party driver code copied.
# TM1637 four-digit seven-segment display driver, bit-banged on two GPIO pins.
# Pass pins configured as outputs; typical modules have their own pull-up resistors.
# Static implementation for MicroPython v1.29.0; real-hardware timing still needs M5 validation.

import time

_DIGITS = (
    0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F,
)
_MINUS = 0x40
_BLANK = 0x00
_DOT = 0x80
_COLON_DIGIT = 1


class Tm1637:
    def __init__(self, clk, dio, brightness=7):
        self.clk = clk
        self.dio = dio
        brightness = int(brightness)
        if brightness < 0:
            brightness = 0
        if brightness > 7:
            brightness = 7
        self.brightness = brightness
        self.clk.value(1)
        self.dio.value(1)
        self.clear()

    def _start(self):
        self.dio.value(1)
        self.clk.value(1)
        time.sleep_us(2)
        self.dio.value(0)
        time.sleep_us(2)
        self.clk.value(0)

    def _stop(self):
        self.clk.value(0)
        self.dio.value(0)
        time.sleep_us(2)
        self.clk.value(1)
        time.sleep_us(2)
        self.dio.value(1)

    def _write_byte(self, value):
        for _bit in range(8):
            self.dio.value(value & 0x01)
            value >>= 1
            time.sleep_us(1)
            self.clk.value(1)
            time.sleep_us(3)
            self.clk.value(0)
            time.sleep_us(1)

    def _command(self, command):
        self._start()
        self._write_byte(command)
        self._stop()

    def _write_digits(self, digits):
        self._command(0x40)
        self._start()
        self._write_byte(0xC0)
        for digit in digits:
            self._write_byte(digit)
        self._stop()
        self._command(0x88 | self.brightness)

    def clear(self):
        self._write_digits((_BLANK, _BLANK, _BLANK, _BLANK))

    def show_number(self, value, decimals=0, colon=False):
        decimals = int(decimals)
        if decimals < 0:
            decimals = 0
        if decimals > 3:
            decimals = 3
        try:
            scaled = int(round(float(value) * (10 ** decimals)))
        except (TypeError, ValueError):
            scaled = 0
        negative = scaled < 0
        if negative:
            scaled = -scaled
        if scaled > (999 if negative else 9999):
            self._write_digits((_MINUS, _MINUS, _MINUS, _MINUS))
            return
        digits = []
        for position in range(3, -1, -1):
            digits.append(_DIGITS[(scaled // (10 ** position)) % 10])
        if negative:
            digits[0] |= _MINUS
        if decimals > 0:
            digits[3 - decimals] |= _DOT
        if colon:
            digits[_COLON_DIGIT] |= _DOT
        self._write_digits(digits)
