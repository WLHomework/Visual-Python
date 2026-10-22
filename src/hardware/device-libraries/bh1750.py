# Source: original implementation for Visual Python (BH1750 datasheet protocol).
# License: same terms as the Visual Python project; no third-party driver code copied.
# The sensor must be powered from 3.3 V and share the I2C bus passed to BH1750.

import time

from micropython import const

_POWER_ON = const(0x01)
_CONTINUOUS_H_RES = const(0x10)
_LUX_PER_COUNT = 1.2


class BH1750:
    def __init__(self, i2c, address=0x23):
        self.i2c = i2c
        self.address = address
        self.i2c.writeto(self.address, bytes([_POWER_ON]))
        time.sleep_ms(10)
        self.i2c.writeto(self.address, bytes([_CONTINUOUS_H_RES]))
        # Continuous H-resolution conversion takes up to 180 ms; wait before the first read.
        time.sleep_ms(180)

    def read_lux(self):
        data = self.i2c.readfrom(self.address, 2)
        raw = (data[0] << 8) | data[1]
        return raw / _LUX_PER_COUNT

