const EventEmitter = require('events');

/**
 * Device Manager inspired by Devialet IP Control patterns
 * Provides centralized device state management and error handling
 */
class DeviceManager extends EventEmitter {

  constructor(app) {
    super();
    this.app = app;
    this.devices = new Map();
    this.deviceStates = new Map();
    this.deviceErrors = new Map();
    
    // Configuration
    this.config = {
      maxErrorHistory: 100,
      deviceTimeout: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 1000 // 1 second
    };

    this.app.log('DeviceManager initialized');
  }

  /**
   * Register a device with the manager
   */
  registerDevice(device) {
    try {
      const deviceId = this.getDeviceId(device);
      
      if (this.devices.has(deviceId)) {
        this.app.log(`Device ${deviceId} already registered, updating...`);
      }

      this.devices.set(deviceId, device);
      this.deviceStates.set(deviceId, this.createInitialDeviceState(device));
      
      // Setup device event listeners
      this.setupDeviceListeners(device, deviceId);

      this.app.log(`Device registered: ${deviceId} (${device.getName()})`);
      this.emit('deviceRegistered', device, deviceId);

      return deviceId;
    } catch (error) {
      this.app.error('Error registering device:', error);
      throw error;
    }
  }

  /**
   * Unregister a device from the manager
   */
  unregisterDevice(device) {
    try {
      const deviceId = this.getDeviceId(device);
      
      if (this.devices.has(deviceId)) {
        this.devices.delete(deviceId);
        this.deviceStates.delete(deviceId);
        this.deviceErrors.delete(deviceId);
        
        this.app.log(`Device unregistered: ${deviceId}`);
        this.emit('deviceUnregistered', device, deviceId);
      }
    } catch (error) {
      this.app.error('Error unregistering device:', error);
    }
  }

  /**
   * Get device ID from device object
   */
  getDeviceId(device) {
    return device.getData().id || device.getId();
  }

  /**
   * Create initial device state
   */
  createInitialDeviceState(device) {
    return {
      name: device.getName(),
      driverUri: device.getDriver().id,
      capabilities: device.getCapabilities(),
      available: device.getAvailable(),
      registeredAt: new Date(),
      lastSeen: new Date(),
      interactions: 0,
      errors: []
    };
  }

  /**
   * Setup event listeners for a device
   */
  setupDeviceListeners(device, deviceId) {
    // Listen for capability changes
    device.on('capabilityChanged', (capability, value) => {
      this.handleCapabilityChange(deviceId, capability, value);
    });

    // Listen for availability changes
    device.on('availabilityChanged', (available) => {
      this.handleAvailabilityChange(deviceId, available);
    });

    // Listen for errors
    device.on('error', (error) => {
      this.handleDeviceError(deviceId, error);
    });
  }

  /**
   * Handle device capability changes
   */
  handleCapabilityChange(deviceId, capability, value) {
    try {
      const state = this.deviceStates.get(deviceId);
      if (state) {
        state.lastSeen = new Date();
        state.interactions++;
        
        this.app.log(`Device ${deviceId} capability ${capability} changed to:`, value);
        this.emit('capabilityChanged', deviceId, capability, value);
      }
    } catch (error) {
      this.app.error(`Error handling capability change for ${deviceId}:`, error);
    }
  }

  /**
   * Handle device availability changes
   */
  handleAvailabilityChange(deviceId, available) {
    try {
      const state = this.deviceStates.get(deviceId);
      if (state) {
        state.available = available;
        state.lastSeen = new Date();
        
        this.app.log(`Device ${deviceId} availability changed to:`, available);
        this.emit('availabilityChanged', deviceId, available);
      }
    } catch (error) {
      this.app.error(`Error handling availability change for ${deviceId}:`, error);
    }
  }

  /**
   * Handle device errors
   */
  handleDeviceError(deviceId, error) {
    try {
      let errorHistory = this.deviceErrors.get(deviceId);
      if (!errorHistory) {
        errorHistory = [];
        this.deviceErrors.set(deviceId, errorHistory);
      }

      const errorRecord = {
        error: error.message || error,
        timestamp: new Date(),
        type: error.constructor.name
      };

      errorHistory.push(errorRecord);

      // Keep error history manageable
      if (errorHistory.length > this.config.maxErrorHistory) {
        errorHistory.shift();
      }

      this.app.error(`Device ${deviceId} error:`, error);
      this.emit('deviceError', deviceId, error);
    } catch (err) {
      this.app.error(`Error handling device error for ${deviceId}:`, err);
    }
  }

  /**
   * Get device state
   */
  getDeviceState(deviceId) {
    return this.deviceStates.get(deviceId);
  }

  /**
   * Get all device states
   */
  getAllDeviceStates() {
    const states = {};
    for (const [deviceId, state] of this.deviceStates) {
      states[deviceId] = state;
    }
    return states;
  }

  /**
   * Get device errors
   */
  getDeviceErrors(deviceId) {
    return this.deviceErrors.get(deviceId) || [];
  }

  /**
   * Get device statistics
   */
  getDeviceStats(deviceId) {
    const state = this.deviceStates.get(deviceId);
    const errors = this.deviceErrors.get(deviceId) || [];
    
    if (!state) {
      return null;
    }

    return {
      ...state,
      totalErrors: errors.length,
      recentErrors: errors.slice(-10), // Last 10 errors
      uptime: Date.now() - state.registeredAt.getTime()
    };
  }

  /**
   * Get system overview
   */
  getSystemOverview() {
    const totalDevices = this.devices.size;
    const availableDevices = Array.from(this.deviceStates.values())
      .filter(state => state.available).length;
    
    const totalErrors = Array.from(this.deviceErrors.values())
      .reduce((total, errors) => total + errors.length, 0);

    const deviceTypes = {};
    for (const state of this.deviceStates.values()) {
      const driverUri = state.driverUri;
      deviceTypes[driverUri] = (deviceTypes[driverUri] || 0) + 1;
    }

    return {
      totalDevices,
      availableDevices,
      unavailableDevices: totalDevices - availableDevices,
      totalErrors,
      deviceTypes,
      lastUpdate: new Date()
    };
  }

  /**
   * Execute command on device with retry logic
   */
  async executeDeviceCommand(deviceId, command, ...args) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    let lastError;
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        if (typeof device[command] === 'function') {
          const result = await device[command](...args);
          
          // Update last seen timestamp on successful command
          const state = this.deviceStates.get(deviceId);
          if (state) {
            state.lastSeen = new Date();
            state.interactions++;
          }

          return result;
        } else {
          throw new Error(`Command ${command} not found on device ${deviceId}`);
        }
      } catch (error) {
        lastError = error;
        this.handleDeviceError(deviceId, error);
        
        if (attempt < this.config.retryAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.devices.clear();
    this.deviceStates.clear();
    this.deviceErrors.clear();
    this.removeAllListeners();
    this.app.log('DeviceManager destroyed');
  }
}

module.exports = DeviceManager;