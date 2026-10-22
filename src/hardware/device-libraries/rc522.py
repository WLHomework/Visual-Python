# Source: original implementation for Visual Python (MFRC522 register map, NXP datasheet).
# License: same terms as the Visual Python project; no third-party driver code copied.
# MFRC522 RFID reader on a MicroPython SPI bus, returning the 4-byte card UID as hex.
# Wiring: 3.3 V supply, SCK/MOSI/MISO as configured, CS and RST on output pins.
# Static implementation for MicroPython v1.29.0; real-hardware timing still needs M5 validation.

import time

from micropython import const

_COMMAND = const(0x01)
_COM_IRQ = const(0x04)
_ERROR = const(0x06)
_FIFO_DATA = const(0x09)
_FIFO_LEVEL = const(0x0A)
_BIT_FRAMING = const(0x0D)
_TX_CONTROL = const(0x14)
_TX_ASK = const(0x15)
_T_MODE = const(0x2A)
_T_PRESCALER = const(0x2B)
_T_RELOAD_H = const(0x2C)
_T_RELOAD_L = const(0x2D)

_SOFT_RESET = const(0x0F)
_IDLE = const(0x00)
_TRANSCEIVE = const(0x0C)
_RX_IRQ = const(0x30)
_TIMEOUT_MS = 50


class RC522:
    def __init__(self, spi, cs, rst):
        self.spi = spi
        self.cs = cs
        self.rst = rst
        self.cs.value(1)
        self.rst.value(0)
        time.sleep_ms(50)
        self.rst.value(1)
        time.sleep_ms(50)
        self._write(_COMMAND, _SOFT_RESET)
        time.sleep_ms(50)
        self._write(_T_MODE, 0x8D)
        self._write(_T_PRESCALER, 0x3E)
        self._write(_T_RELOAD_H, 30)
        self._write(_T_RELOAD_L, 0)
        self._write(_TX_ASK, 0x40)
        self._write(_COMMAND, _IDLE)
        self._write(_TX_CONTROL, 0x03)
        time.sleep_ms(10)

    def _read(self, register):
        self.cs.value(0)
        self.spi.write(bytes(((register << 1) & 0x7E | 0x80,)))
        data = self.spi.read(1)
        self.cs.value(1)
        return data[0]

    def _write(self, register, value):
        self.cs.value(0)
        self.spi.write(bytes((((register << 1) & 0x7E), value)))
        self.cs.value(1)

    def _transceive(self, data, last_bits=0):
        self._write(_COM_IRQ, 0x7F)
        self._write(_FIFO_LEVEL, 0)
        self._write(_COMMAND, _IDLE)
        self._write(_BIT_FRAMING, last_bits)
        for byte in data:
            self._write(_FIFO_DATA, byte)
        self._write(_COMMAND, _TRANSCEIVE)
        self._write(_BIT_FRAMING, last_bits | 0x80)
        start = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), start) < _TIMEOUT_MS:
            if self._read(_COM_IRQ) & _RX_IRQ:
                break
            time.sleep_ms(1)
        else:
            return None
        if self._read(_ERROR) & 0x1B:
            return None
        length = self._read(_FIFO_LEVEL) & 0x3F
        return bytes(self._read(_FIFO_DATA) for _index in range(length))

    def read_uid(self):
        if not self._transceive(b"\x26", 7):
            return ""
        response = self._transceive(b"\x93\x20")
        if not response or len(response) < 5:
            return ""
        uid = response[:4]
        check = uid[0] ^ uid[1] ^ uid[2] ^ uid[3]
        if check != response[4]:
            return ""
        return "".join("%02X" % byte for byte in uid)
