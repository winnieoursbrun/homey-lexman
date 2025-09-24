'use strict';

const Homey = require('homey');
const DeviceManager = require('./lib/DeviceManager');

class LexmanApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    try {
      this.log('Lexman app is initializing...');
      
      // Initialize device manager
      this.deviceManager = new DeviceManager(this);
      
      // Initialize app components
      await this.initializeDeviceManagement();
      await this.initializeFlowCards();
      await this.initializeEventHandlers();
      
      this.log('Lexman app initialized successfully');
    } catch (error) {
      this.error('Failed to initialize Lexman app:', error);
      throw error;
    }
  }

  /**
   * Initialize device management and discovery
   */
  async initializeDeviceManagement() {
    this.log('Initializing device management...');
    
    // Store device states and configurations (now handled by DeviceManager)
    this.deviceConfigurations = new Map();
    
    // Initialize device discovery handlers
    this.homey.drivers.on('device_init', this.onDeviceInit.bind(this));
    this.homey.drivers.on('device_deleted', this.onDeviceDeleted.bind(this));

    // Setup device manager event listeners
    this.deviceManager.on('deviceRegistered', this.onDeviceRegistered.bind(this));
    this.deviceManager.on('deviceUnregistered', this.onDeviceUnregistered.bind(this));
    this.deviceManager.on('capabilityChanged', this.onDeviceCapabilityChanged.bind(this));
    this.deviceManager.on('deviceError', this.onDeviceError.bind(this));
  }

  /**
   * Initialize flow cards and triggers
   */
  async initializeFlowCards() {
    this.log('Initializing flow cards...');
    
    // Store flow card references for easy access
    this.flowCards = {
      triggers: {},
      conditions: {},
      actions: {}
    };

    // Initialize common trigger cards
    const triggerCards = [
      'button_pressed',
      'pressed_on', 'pressed_off',
      'pressed_brightness_up', 'pressed_brightness_down',
      'pressed_scene_1', 'pressed_scene_2', 'pressed_scene_3', 'pressed_scene_4'
    ];

    triggerCards.forEach(triggerId => {
      try {
        this.flowCards.triggers[triggerId] = this.homey.flow.getDeviceTriggerCard(triggerId);
        this.log(`Initialized trigger card: ${triggerId}`);
      } catch (error) {
        this.error(`Failed to initialize trigger card ${triggerId}:`, error);
      }
    });
  }

  /**
   * Initialize event handlers
   */
  async initializeEventHandlers() {
    this.log('Initializing event handlers...');
    
    // Handle app unload gracefully
    process.on('SIGTERM', this.onUnload.bind(this));
    process.on('SIGINT', this.onUnload.bind(this));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', this.onUncaughtException.bind(this));
    process.on('unhandledRejection', this.onUnhandledRejection.bind(this));
  }

  /**
   * Handle device initialization
   */
  async onDeviceInit(device) {
    try {
      this.log(`Device initializing: ${device.getName()} (${device.getClass()})`);
      
      // Register device with device manager
      this.deviceManager.registerDevice(device);
      
    } catch (error) {
      this.error('Error handling device initialization:', error);
    }
  }

  /**
   * Handle device deletion
   */
  async onDeviceDeleted(device) {
    try {
      this.log(`Device deleted: ${device.getName()}`);
      
      // Unregister device from device manager
      this.deviceManager.unregisterDevice(device);
      
      // Clean up device configuration
      const deviceId = this.deviceManager.getDeviceId(device);
      this.deviceConfigurations.delete(deviceId);
      
    } catch (error) {
      this.error('Error handling device deletion:', error);
    }
  }

  /**
   * Handle device registration (from DeviceManager)
   */
  async onDeviceRegistered(device, deviceId) {
    try {
      this.log(`Device registered in manager: ${deviceId}`);
      
      // Setup device-specific event handlers
      await this.setupDeviceHandlers(device);
      
    } catch (error) {
      this.error('Error handling device registration:', error);
    }
  }

  /**
   * Handle device unregistration (from DeviceManager)
   */
  async onDeviceUnregistered(device, deviceId) {
    this.log(`Device unregistered from manager: ${deviceId}`);
  }

  /**
   * Handle device capability changes (from DeviceManager)
   */
  onDeviceCapabilityChanged(deviceId, capability, value) {
    try {
      const device = this.deviceManager.devices.get(deviceId);
      if (device) {
        this.handleCapabilityChange(device, capability, value);
      }
    } catch (error) {
      this.error('Error handling capability change:', error);
    }
  }

  /**
   * Handle device errors (from DeviceManager)
   */
  onDeviceError(deviceId, error) {
    this.error(`Device ${deviceId} error:`, error);
  }

  /**
   * Setup device-specific event handlers
   */
  async setupDeviceHandlers(device) {
    const driverId = device.getDriver().id;
    
    // Setup handlers based on driver type
    switch (driverId) {
      case 'ZBEK-26':
        await this.setupZBEK26Handlers(device);
        break;
      case 'ZBEK-4':
        await this.setupZBEK4Handlers(device);
        break;
      default:
        this.log(`No specific handlers for driver: ${driverId}`);
    }
  }

  /**
   * Setup handlers for ZBEK-26 devices
   */
  async setupZBEK26Handlers(device) {
    // Handle capability changes
    device.on('capabilityChanged', (capability, value) => {
      this.log(`ZBEK-26 ${device.getName()} - ${capability} changed to:`, value);
      
      // Trigger appropriate flow cards based on capability changes
      this.handleCapabilityChange(device, capability, value);
    });
  }

  /**
   * Setup handlers for ZBEK-4 devices  
   */
  async setupZBEK4Handlers(device) {
    // Handle capability changes for ZBEK-4
    device.on('capabilityChanged', (capability, value) => {
      this.log(`ZBEK-4 ${device.getName()} - ${capability} changed to:`, value);
      
      // Trigger appropriate flow cards
      this.handleCapabilityChange(device, capability, value);
    });
  }

  /**
   * Handle capability changes and trigger appropriate flow cards
   */
  handleCapabilityChange(device, capability, value) {
    try {
      // Map capabilities to flow triggers
      const triggerMap = {
        'onoff': value ? 'pressed_on' : 'pressed_off',
        'dim': value > 0.5 ? 'pressed_brightness_up' : 'pressed_brightness_down'
      };

      const triggerId = triggerMap[capability];
      if (triggerId && this.flowCards.triggers[triggerId]) {
        this.flowCards.triggers[triggerId].trigger(device, {
          capability,
          value
        });
      }
    } catch (error) {
      this.error('Error handling capability change:', error);
    }
  }

  /**
   * Trigger scene button press
   */
  triggerSceneButton(device, sceneId, buttonData = {}) {
    try {
      const triggerId = `pressed_scene_${sceneId}`;
      
      if (this.flowCards.triggers[triggerId]) {
        this.flowCards.triggers[triggerId].trigger(device, {
          scene: sceneId,
          timestamp: new Date(),
          ...buttonData
        });
        
        this.log(`Triggered scene ${sceneId} for device ${device.getName()}`);
        return true;
      } else {
        this.error(`No trigger card found for scene ${sceneId}`);
        return false;
      }
    } catch (error) {
      this.error(`Error triggering scene ${sceneId}:`, error);
      return false;
    }
  }

  /**
   * Trigger generic button press
   */
  triggerButtonPress(device, buttonName, buttonData = {}) {
    try {
      if (this.flowCards.triggers.button_pressed) {
        this.flowCards.triggers.button_pressed.trigger(device, {
          button: buttonName,
          timestamp: new Date()
        }, {
          button: buttonName,
          ...buttonData
        });
        
        this.log(`Triggered button press: ${buttonName} for device ${device.getName()}`);
        return true;
      }
      return false;
    } catch (error) {
      this.error(`Error triggering button press ${buttonName}:`, error);
      return false;
    }
  }

  /**
   * Get device state information
   */
  getDeviceState(deviceId) {
    return this.deviceManager.getDeviceState(deviceId);
  }

  /**
   * Get all device states
   */
  getAllDeviceStates() {
    return this.deviceManager.getAllDeviceStates();
  }

  /**
   * Get system overview
   */
  getSystemOverview() {
    return this.deviceManager.getSystemOverview();
  }

  /**
   * Execute command on device
   */
  async executeDeviceCommand(deviceId, command, ...args) {
    return this.deviceManager.executeDeviceCommand(deviceId, command, ...args);
  }

  /**
   * Handle app unload
   */
  async onUnload() {
    try {
      this.log('Lexman app is shutting down...');
      
      // Clean up device manager
      if (this.deviceManager) {
        this.deviceManager.destroy();
      }
      
      // Clean up resources
      this.deviceConfigurations.clear();
      
      this.log('Lexman app shutdown complete');
    } catch (error) {
      this.error('Error during app shutdown:', error);
    }
  }

  /**
   * Handle uncaught exceptions
   */
  onUncaughtException(error) {
    this.error('Uncaught exception:', error);
  }

  /**
   * Handle unhandled rejections
   */
  onUnhandledRejection(reason, promise) {
    this.error('Unhandled rejection at:', promise, 'reason:', reason);
  }

}

module.exports = LexmanApp;

module.exports = LexmanApp;
