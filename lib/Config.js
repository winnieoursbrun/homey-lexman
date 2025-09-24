/**
 * Application Configuration
 * Centralized configuration inspired by Devialet IP Control patterns
 */

const CONFIG = {
  // Device Management
  DEVICE: {
    TIMEOUT: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000, // 1 second
    MAX_ERROR_HISTORY: 100,
    HEARTBEAT_INTERVAL: 60000 // 1 minute
  },

  // ZigBee Specific
  ZIGBEE: {
    MANUFACTURER_ID: 4727, // ADEO manufacturer ID
    MANUFACTURER_CLUSTER_ID: 65024, // 0xFE00
    COLOR_CONTROL_CLUSTER_ID: 768, // 0x0300
    ENDPOINT_ID: 1
  },

  // Button Mappings (similar to Devialet's source mappings)
  BUTTON_MAPPING: {
    ZBEK26: {
      SCENES: {
        0x0a: 1,
        0x0b: 2, 
        0x0c: 3,
        0x0d: 4
      },
      COLOR_CONTROL: {
        CMD_76: 'brightness',
        CMD_5: 'brightness',
        CMD_2: 'color'
      }
    }
  },

  // Flow Cards
  FLOW_CARDS: {
    TRIGGERS: [
      'button_pressed',
      'pressed_on',
      'pressed_off', 
      'pressed_brightness_up',
      'pressed_brightness_down',
      'pressed_scene_1',
      'pressed_scene_2',
      'pressed_scene_3',
      'pressed_scene_4',
      'pressed_color_left',
      'pressed_color_right'
    ]
  },

  // Logging Levels
  LOG_LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
  },

  // Error Codes (inspired by Devialet error handling)
  ERROR_CODES: {
    DEVICE_NOT_FOUND: 'DeviceNotFound',
    DEVICE_UNREACHABLE: 'DeviceUnreachable', 
    INVALID_COMMAND: 'InvalidCommand',
    TIMEOUT: 'Timeout',
    INVALID_VALUE: 'InvalidValue',
    SYSTEM_ERROR: 'SystemError',
    INITIALIZATION_FAILED: 'InitializationFailed',
    CLUSTER_BIND_FAILED: 'ClusterBindFailed'
  },

  // Feature Flags
  FEATURES: {
    ENABLE_DEBUG: true,
    ENABLE_METRICS: true,
    ENABLE_RETRY_LOGIC: true,
    ENABLE_HEARTBEAT: true
  }
};

// Error Classes (inspired by Devialet's structured error handling)
class LexmanError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LexmanError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

class DeviceError extends LexmanError {
  constructor(code, message, deviceId, details = {}) {
    super(code, message, { deviceId, ...details });
    this.name = 'DeviceError';
    this.deviceId = deviceId;
  }
}

class ZigBeeError extends LexmanError {
  constructor(code, message, clusterId, endpointId, details = {}) {
    super(code, message, { clusterId, endpointId, ...details });
    this.name = 'ZigBeeError';
    this.clusterId = clusterId;
    this.endpointId = endpointId;
  }
}

// Utility Functions
const Utils = {
  /**
   * Create a delay promise
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Retry an async operation
   */
  async retry(operation, attempts = CONFIG.DEVICE.RETRY_ATTEMPTS, delay = CONFIG.DEVICE.RETRY_DELAY) {
    let lastError;
    
    for (let i = 0; i < attempts; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (i < attempts - 1) {
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  },

  /**
   * Validate device ID format
   */
  isValidDeviceId(deviceId) {
    return typeof deviceId === 'string' && deviceId.length > 0;
  },

  /**
   * Validate capability name
   */
  isValidCapability(capability) {
    const validCapabilities = ['onoff', 'dim', 'color_temperature', 'light_hue', 'light_saturation'];
    return validCapabilities.includes(capability);
  },

  /**
   * Parse ZigBee frame safely
   */
  parseZigBeeFrame(frame) {
    if (!frame || !Buffer.isBuffer(frame)) {
      throw new ZigBeeError(CONFIG.ERROR_CODES.INVALID_VALUE, 'Invalid frame data');
    }

    return {
      hex: frame.toString('hex'),
      length: frame.length,
      bytes: Array.from(frame)
    };
  },

  /**
   * Create standardized log entry
   */
  createLogEntry(level, message, context = {}) {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context
    };
  }
};

module.exports = {
  CONFIG,
  LexmanError,
  DeviceError,
  ZigBeeError,
  Utils
};