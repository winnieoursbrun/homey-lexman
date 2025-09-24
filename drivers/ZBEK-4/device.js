const { ZigBeeLightDevice } = require('homey-zigbeedriver');
const { debug } = require('zigbee-clusters');

class AdeoLight extends ZigBeeLightDevice {

  async onNodeInit({ zclNode }) {
    try {
      this.log('Initializing ADEO Light device...');

      // Initialize device state
      this.deviceState = {
        isInitialized: false,
        lastStateChange: null,
        stateChanges: 0,
        errors: []
      };

      // Enable debug logging during development
      debug(true);

      // Setup capabilities
      await this.setupCapabilities();

      // Call parent initialization
      await super.onNodeInit({ zclNode });

      this.deviceState.isInitialized = true;
      this.log('ADEO Light device initialized successfully');

      // Notify app of device initialization
      this.homey.app.emit('deviceInitialized', this);

    } catch (error) {
      this.error('Failed to initialize ADEO Light device:', error);
      this.deviceState.errors.push({
        type: 'initialization',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Setup device capabilities
   */
  async setupCapabilities() {
    this.log('Setting up device capabilities...');

    try {
      // Enable capabilities for the light device
      await this.enableCapability('onoff');
      await this.enableCapability('dim');

      // Register capability listeners with error handling
      this.registerCapabilityListener('onoff', this.onCapabilityOnOff.bind(this));
      this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));

      this.log('Device capabilities configured successfully');
    } catch (error) {
      this.error('Failed to setup capabilities:', error);
      throw error;
    }
  }

  /**
   * Handle onoff capability changes
   */
  async onCapabilityOnOff(value) {
    try {
      this.log(`OnOff capability changed to: ${value}`);
      
      // Update device state
      this.updateDeviceState('onoff', value);

      // Call parent handler
      return await super.onCapabilityOnOff(value);
    } catch (error) {
      this.error('Error handling onoff capability:', error);
      throw error;
    }
  }

  /**
   * Handle dim capability changes
   */
  async onCapabilityDim(value) {
    try {
      this.log(`Dim capability changed to: ${value}`);
      
      // Update device state
      this.updateDeviceState('dim', value);

      // Call parent handler
      return await super.onCapabilityDim(value);
    } catch (error) {
      this.error('Error handling dim capability:', error);
      throw error;
    }
  }

  /**
   * Update device state tracking
   */
  updateDeviceState(capability, value) {
    this.deviceState.lastStateChange = {
      capability,
      value,
      timestamp: new Date()
    };
    this.deviceState.stateChanges++;

    // Emit capability change event for app
    this.emit('capabilityChanged', capability, value);
  }

  /**
   * Get device state information
   */
  getDeviceState() {
    return {
      ...this.deviceState,
      deviceInfo: {
        name: this.getName(),
        id: this.getData().id,
        capabilities: this.getCapabilities(),
        available: this.getAvailable(),
        capabilityValues: {
          onoff: this.getCapabilityValue('onoff'),
          dim: this.getCapabilityValue('dim')
        }
      }
    };
  }

  /**
   * Handle device availability changes
   */
  async onAvailabilityChange(available) {
    try {
      this.log(`Device availability changed to: ${available}`);
      
      this.deviceState.lastStateChange = {
        capability: 'available',
        value: available,
        timestamp: new Date()
      };

      // Call parent handler if it exists
      if (super.onAvailabilityChange) {
        await super.onAvailabilityChange(available);
      }
    } catch (error) {
      this.error('Error handling availability change:', error);
    }
  }

  /**
   * Handle device deletion
   */
  async onDeleted() {
    try {
      this.log('Light device is being deleted, cleaning up...');

      // Clean up device state
      this.deviceState = null;

      // Call parent cleanup if it exists
      if (super.onDeleted) {
        await super.onDeleted();
      }

      this.log('Light device cleanup completed');
    } catch (error) {
      this.error('Error during device cleanup:', error);
    }
  }

}

module.exports = AdeoLight;
