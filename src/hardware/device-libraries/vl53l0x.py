# Source: original implementation for Visual Python. The register initialization sequence
# and SPAD calibration follow the public ST VL53L0X API sequence; the code structure,
# naming and error handling are written for this project (no third-party source copied).
# License: same terms as the Visual Python project.
# VL53L0X time-of-flight distance sensor on MicroPython I2C (address 0x29).
# Returns distance in millimetres; the 3.3 V supply must be stable during a measurement.
# Static implementation for MicroPython v1.29.0; real-hardware accuracy still needs M5 validation.

import time

from micropython import const

_MODEL_ID_REG = const(0xC0)
_MODEL_ID = const(0xEE)
_IO_TIMEOUT = 1000
_SYSRANGE_START = const(0x00)
_SYSTEM_SEQUENCE = const(0x01)
_INTERRUPT_CLEAR = const(0x0B)
_RESULT_INTERRUPT = const(0x13)
_RESULT_RANGE = const(0x14)
_EXTSUP_HV = const(0x89)
_MSRC_CONFIG = const(0x60)
_FINAL_RATE_RTN_LIMIT = const(0x44)
_INTERRUPT_GPIO = const(0x0A)
_GPIO_MUX_ACTIVE_HIGH = const(0x84)
_SPAD_ENABLES = const(0xB0)
_SPAD_NUM_REQUESTED = const(0x4E)
_SPAD_REF_START = const(0x4F)
_REF_EN_START_SELECT = const(0xB6)

# Signal-rate and timing configuration from the ST single-shot initialization sequence.
_TUNING = (
    (0xFF, 0x01), (0x00, 0x00),
    (0xFF, 0x00), (0x09, 0x00), (0x10, 0x00), (0x11, 0x00),
    (0x24, 0x01), (0x25, 0xFF), (0x75, 0x00),
    (0xFF, 0x01), (0x4E, 0x2C), (0x48, 0x00), (0x30, 0x20),
    (0xFF, 0x00), (0x30, 0x09), (0x54, 0x00), (0x31, 0x04), (0x32, 0x03),
    (0x40, 0x83), (0x46, 0x25), (0x60, 0x00), (0x27, 0x00),
    (0x50, 0x06), (0x51, 0x00), (0x52, 0x96), (0x56, 0x08), (0x57, 0x30),
    (0x61, 0x00), (0x62, 0x00), (0x64, 0x00), (0x65, 0x00), (0x66, 0xA0),
    (0xFF, 0x01), (0x22, 0x32), (0x47, 0x14), (0x49, 0xFF), (0x4A, 0x00),
    (0xFF, 0x00), (0x7A, 0x0A), (0x7B, 0x00), (0x78, 0x21),
    (0xFF, 0x01), (0x23, 0x34), (0x42, 0x00), (0x44, 0xFF), (0x45, 0x26),
    (0x46, 0x05), (0x40, 0x40), (0x0E, 0x06), (0x20, 0x1A), (0x43, 0x40),
    (0xFF, 0x00), (0x34, 0x03), (0x35, 0x44),
    (0xFF, 0x01), (0x31, 0x04), (0x4B, 0x09), (0x4C, 0x05), (0x4D, 0x04),
    (0xFF, 0x00), (0x44, 0x00), (0x45, 0x20), (0x47, 0x08), (0x48, 0x28),
    (0x67, 0x00), (0x70, 0x04), (0x71, 0x01), (0x72, 0xFE), (0x76, 0x00), (0x77, 0x00),
    (0xFF, 0x01), (0x0D, 0x01),
    (0xFF, 0x00), (0x80, 0x01), (0x01, 0xF8),
    (0xFF, 0x01), (0x8E, 0x01), (0x00, 0x01),
    (0xFF, 0x00), (0x80, 0x00),
)


class VL53L0X:
    def __init__(self, i2c, address=0x29):
        self.i2c = i2c
        self.address = address
        self._stop_variable = 0
        if self._read(_MODEL_ID_REG) != _MODEL_ID:
            raise OSError("VL53L0X not found")
        self._init()

    def _read(self, register, length=1):
        data = self.i2c.readfrom_mem(self.address, register, length)
        return data[0] if length == 1 else data

    def _read_u16(self, register):
        data = self._read(register, 2)
        return (data[0] << 8) | data[1]

    def _write(self, register, value):
        self.i2c.writeto_mem(self.address, register, bytes((value,)))

    def _write_u16(self, register, value):
        self.i2c.writeto_mem(self.address, register, bytes((value >> 8, value & 0xFF)))

    def _init(self):
        # 3.3 V supply: clear the 2.8 V mode bit, then unlock the private register page.
        self._write(_EXTSUP_HV, self._read(_EXTSUP_HV) & 0xFE)
        self._write(0x88, 0x00)
        self._write(0x80, 0x01)
        self._write(0xFF, 0x01)
        self._write(0x00, 0x00)
        self._stop_variable = self._read(0x91)
        self._write(0x00, 0x01)
        self._write(0xFF, 0x00)
        self._write(0x80, 0x00)
        self._write(_MSRC_CONFIG, self._read(_MSRC_CONFIG) | 0x12)
        self._write_u16(_FINAL_RATE_RTN_LIMIT, int(0.25 * (1 << 7)))
        self._write(_SYSTEM_SEQUENCE, 0xFF)
        count, aperture = self._spad_info()
        spad_map = bytearray(self._read(_SPAD_ENABLES, 6))
        enabled = 0
        for index in range(48):
            mask = 1 << (index >> 2)
            if (index < 12 and aperture) or enabled >= count:
                spad_map[index // 8] &= ~mask
            elif spad_map[index // 8] & mask:
                enabled += 1
        self.i2c.writeto_mem(self.address, _SPAD_ENABLES, spad_map)
        for register, value in _TUNING:
            self._write(register, value)
        self._write(_INTERRUPT_GPIO, 0x04)
        self._write(_GPIO_MUX_ACTIVE_HIGH, self._read(_GPIO_MUX_ACTIVE_HIGH) & ~0x10)
        self._write(_INTERRUPT_CLEAR, 0x01)
        self._write(_SYSTEM_SEQUENCE, 0x01)
        self._calibrate(0x40)
        self._write(_SYSTEM_SEQUENCE, 0x02)
        self._calibrate(0x00)
        self._write(_SYSTEM_SEQUENCE, 0xE8)

    def _spad_info(self):
        self._write(0x80, 0x01)
        self._write(0xFF, 0x01)
        self._write(0x00, 0x00)
        self._write(0xFF, 0x06)
        self._write(0x83, self._read(0x83) | 0x08)
        self._write(0xFF, 0x07)
        self._write(0x81, 0x01)
        self._write(0x80, 0x01)
        self._write(0x94, 0x6B)
        self._write(0x83, 0x00)
        for _ in range(_IO_TIMEOUT):
            if self._read(0x83):
                break
            time.sleep_ms(1)
        else:
            raise OSError("VL53L0X SPAD timeout")
        self._write(0x83, 0x01)
        value = self._read(0x92)
        self._write(0x81, 0x00)
        self._write(0xFF, 0x06)
        self._write(0x83, self._read(0x83) & ~0x08)
        self._write(0xFF, 0x01)
        self._write(0x00, 0x01)
        self._write(0xFF, 0x00)
        self._write(0x80, 0x00)
        return value & 0x7F, bool(value & 0x80)

    def _calibrate(self, vhv_init_byte):
        self._write(_SYSRANGE_START, 0x01 | vhv_init_byte)
        for _ in range(_IO_TIMEOUT):
            if self._read(_RESULT_INTERRUPT) & 0x07:
                break
            time.sleep_ms(1)
        else:
            raise OSError("VL53L0X calibration timeout")
        self._write(_INTERRUPT_CLEAR, 0x01)
        self._write(_SYSRANGE_START, 0x00)

    def read_mm(self):
        # Single-shot measurement: load the stop variable, start, then wait for the result.
        self._write(0x80, 0x01)
        self._write(0xFF, 0x01)
        self._write(0x00, 0x00)
        self._write(0x91, self._stop_variable)
        self._write(0x00, 0x01)
        self._write(0xFF, 0x00)
        self._write(0x80, 0x00)
        self._write(_SYSRANGE_START, 0x01)
        for _ in range(_IO_TIMEOUT):
            if not self._read(_SYSRANGE_START) & 0x01:
                break
            time.sleep_ms(1)
        else:
            raise OSError("VL53L0X start timeout")
        for _ in range(_IO_TIMEOUT):
            if self._read(_RESULT_INTERRUPT) & 0x07:
                break
            time.sleep_ms(1)
        else:
            raise OSError("VL53L0X range timeout")
        value = self._read_u16(_RESULT_RANGE + 10)
        self._write(_INTERRUPT_CLEAR, 0x01)
        return value
