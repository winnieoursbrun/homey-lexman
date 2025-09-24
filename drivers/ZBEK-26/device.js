const { ZigBeeDevice } = require('homey-zigbeedriver');
const { debug, CLUSTER } = require('zigbee-clusters');
const OnOffBoundCluster = require('../../lib/OnOffBoundCluster');
const LevelControlBoundCluster = require('../../lib/LevelControlBoundCluster');
const ScenesBoundCluster = require('../../lib/ScenesBoundCluster');
const ColorControlBoundCluster = require('../../lib/ColorControlBoundCluster');
const AdeoBoundCluster = require('../../lib/AdeoBoundCluster');
const AdeoCluster = require('../../lib/AdeoCluster');

class AdeoRemote extends ZigBeeDevice {

  async onNodeInit({ zclNode }) {
    try {
      // Enable debug logging during development
      debug(true);

      this.log('Initializing ADEO Remote device...');

      // Make sure to call the parent class's onNodeInit
      await super.onNodeInit({ zclNode });

      // Register battery capability if not present
      if (!this.hasCapability('measure_battery')) {
        await this.addCapability('measure_battery');
        this.log('Added measure_battery capability');
      }

      // Register battery capability using the proper ZigBeeDevice method
      this.registerCapability('measure_battery', CLUSTER.POWER_CONFIGURATION, {
        get: 'batteryPercentageRemaining',
        report: 'batteryPercentageRemaining',
        reportParser: (value) => {
          this.log('Battery percentage report received:', value);
          
          // Handle different battery value formats
          let batteryPercentage;
          if (value === 255 || value === null || value === undefined) {
            // Invalid/unknown battery level
            return null;
          } else if (value > 200) {
            // Some devices report 0-255 scale
            batteryPercentage = Math.max(0, Math.min(100, Math.round((value / 255) * 100)));
          } else if (value > 100) {
            // Standard ZCL 0-200 scale (200 = 100%)
            batteryPercentage = Math.max(0, Math.min(100, Math.round(value / 2)));
          } else {
            // Already 0-100 scale
            batteryPercentage = Math.max(0, Math.min(100, Math.round(value)));
          }
          
          this.log(`Parsed battery percentage: ${batteryPercentage}%`);
          return batteryPercentage;
        },
        reportOpts: {
          configureAttributeReporting: {
            minInterval: 300, // 5 minutes
            maxInterval: 7200, // 2 hours
            minChange: 2, // 2% change
          },
        },
        getOpts: {
          getOnStart: true, // Get battery level on device startup
          getOnOnline: true, // Get battery level when device comes online
        },
      });

      // Also try to register battery voltage as a fallback
      try {
        const powerCluster = this.zclNode.endpoints[1]?.clusters?.powerConfiguration;
        if (powerCluster) {
          // Listen for battery voltage as fallback
          powerCluster.on('attr.batteryVoltage', (value) => {
            this.log('Battery voltage report received:', value);
            try {
              // Convert voltage to percentage (typical CR2032: 3.0V = 100%, 2.0V = 0%)
              const voltage = value / 10; // Convert from decivolts to volts
              const batteryPercentage = Math.max(0, Math.min(100, Math.round((voltage - 2.0) / (3.0 - 2.0) * 100)));
              
              this.log(`Converted voltage ${voltage}V to battery percentage: ${batteryPercentage}%`);
              this.setCapabilityValue('measure_battery', batteryPercentage).catch(this.error);
            } catch (error) {
              this.error('Error processing battery voltage:', error);
            }
          });
        }
      } catch (voltageErr) {
        this.log('Battery voltage fallback not available:', voltageErr.message);
      }

      // Initialize device state
      this.deviceState = {
        isInitialized: false,
        lastButtonPress: null,
        buttonsPressed: 0,
        errors: []
      };

      // Setup device endpoints and clusters
      await this.setupEndpoints(zclNode);
      
      // Setup frame handling for manufacturer-specific frames
      await this.setupFrameHandling(zclNode);
      
      // Setup cluster bindings
      await this.setupClusterBindings(zclNode);

      this.deviceState.isInitialized = true;
      this.log('ADEO Remote device initialized successfully');

      // Notify app of device initialization
      this.homey.app.emit('deviceInitialized', this);

    } catch (error) {
      this.error('Failed to initialize ADEO Remote device:', error);
      this.deviceState.errors.push({
        type: 'initialization',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }

  /**
   * Setup device endpoints
   */
  async setupEndpoints(zclNode) {
    this.log('Setting up device endpoints...');
    
    this.endpoint = zclNode.endpoints[1];
    if (!this.endpoint) {
      throw new Error('No endpoint available on device');
    }

    this.log('Endpoint 1 configured successfully');
  }

  /**
   * Setup frame handling for manufacturer-specific frames
   */
  async setupFrameHandling(zclNode) {
    this.log('Setting up frame handling...');

    try {
      // Get the raw ZigBee node for handling manufacturer-specific frames
      const node = await this.homey.zigbee.getNode(this);

      // Store original handler
      this.originalHandleFrame = node.handleFrame;

      // Override handleFrame to catch manufacturer-specific frames
      node.handleFrame = this.handleFrame.bind(this, node);
      
      this.log('Frame handling configured successfully');
    } catch (error) {
      this.error('Failed to setup frame handling:', error);
      throw error;
    }
  }

  /**
   * Handle incoming ZigBee frames
   */
  handleFrame(node, endpointId, clusterId, frame, meta) {
    try {
      // Handle manufacturer-specific cluster (65024)
      if (endpointId === 1 && clusterId === 65024) {
        return this.handleManufacturerFrame(frame, meta);
      }
      
      // Handle Color Control cluster (768) for up/down buttons
      if (endpointId === 1 && clusterId === 768) {
        return this.handleColorControlFrame(frame, meta);
      }
      
      // Call original handler for other clusters
      if (this.originalHandleFrame) {
        this.originalHandleFrame.call(node, endpointId, clusterId, frame, meta);
      }
    } catch (error) {
      this.error('Error handling frame:', error);
      this.deviceState.errors.push({
        type: 'frame_handling',
        error: error.message,
        timestamp: new Date(),
        clusterId,
        endpointId
      });
    }
  }

  /**
   * Handle manufacturer-specific frames
   */
  handleManufacturerFrame(frame, meta) {
    this.log('Received manufacturer frame:', {
      frame: frame.toString('hex'),
      meta
    });
    
    try {
      // Parse the frame data - button ID is at position 5
      if (frame.length >= 6) {
        const buttonId = frame[5];
        const action = frame.length > 6 ? frame[6] : frame[1];
        
        // Map button IDs to scene numbers - updated mapping based on actual data
        const sceneMap = { 0x0a: 1, 0x0b: 2, 0x0c: 3, 0x0d: 4 };
        const sceneId = sceneMap[buttonId];
        
        if (sceneId) {
          this.triggerSceneButton(sceneId, { buttonId, action });
        }
      }
    } catch (error) {
      this.error('Error parsing manufacturer frame:', error);
    }
  }

  /**
   * Handle Color Control cluster frames
   */
  handleColorControlFrame(frame, meta) {
    this.log('Received Color Control frame:', {
      cmdId: frame.cmdId,
      data: frame.data ? frame.data.toString('hex') : 'no data',
      meta
    });
    
    try {
      if (!frame.data || frame.data.length < 1) {
        return;
      }

      const direction = frame.data[0];
      const action = this.parseColorControlCommand(frame.cmdId, direction);
      
      if (action) {
        this.triggerAction(action, { direction, cmdId: frame.cmdId });
      }
    } catch (error) {
      this.error('Error parsing Color Control frame:', error);
    }
  }

  /**
   * Parse color control command and determine action
   */
  parseColorControlCommand(cmdId, direction) {
    switch (cmdId) {
      case 76: {
        // Original up/down buttons
        const isUp = direction === 0x03;
        const action = isUp ? 'pressed_brightness_up' : 'pressed_brightness_down';
        this.log(`Remote action: ${isUp ? 'brightness up' : 'brightness down'} (cmd76, direction: 0x${direction.toString(16)})`);
        return action;
      }
      case 5: {
        // Additional up/down buttons
        const isUp = direction === 0x03;
        const action = isUp ? 'pressed_brightness_up' : 'pressed_brightness_down';
        this.log(`Remote action: ${isUp ? 'brightness up' : 'brightness down'} (cmd5, direction: 0x${direction.toString(16)})`);
        return action;
      }
      case 2: {
        // Left/right buttons
        const isRight = direction === 0x03;
        const action = isRight ? 'pressed_color_right' : 'pressed_color_left';
        this.log(`Remote action: ${isRight ? 'color right' : 'color left'} (cmd2, direction: 0x${direction.toString(16)})`);
        return action;
      }
      default:
        return null;
    }
  }

  /**
   * Setup cluster bindings
   */
  async setupClusterBindings(zclNode) {
    this.log('Setting up cluster bindings...');

    try {
      const endpoint = this.endpoint;

      // Register OnOff bound cluster
      await this.setupOnOffCluster(endpoint);
      
      // Register LevelControl bound cluster
      await this.setupLevelControlCluster(endpoint);
      
      // Register Scenes bound cluster
      await this.setupScenesCluster(endpoint);
      
      // Register Color Control bound cluster
      await this.setupColorControlCluster(endpoint);
      
      // Register manufacturer-specific cluster
      await this.setupManufacturerCluster(endpoint);

      this.log('All cluster bindings configured successfully');
    } catch (error) {
      this.error('Failed to setup cluster bindings:', error);
      throw error;
    }
  }

  /**
   * Setup OnOff cluster
   */
  async setupOnOffCluster(endpoint) {
    try {
      endpoint.bind(CLUSTER.ON_OFF.NAME, new OnOffBoundCluster({
        onSetOn: () => {
          this.log('Remote action: setOn');
          this.triggerAction('pressed_on');
        },
        onSetOff: () => {
          this.log('Remote action: setOff');
          this.triggerAction('pressed_off');
        }
      }));
    } catch (error) {
      this.error('Failed to setup OnOff cluster:', error);
    }
  }

  /**
   * Setup LevelControl cluster
   */
  async setupLevelControlCluster(endpoint) {
    try {
      endpoint.bind(CLUSTER.LEVEL_CONTROL.NAME, new LevelControlBoundCluster({
        onStep: (payload) => {
          this.log('Remote action: step', payload);
          const isUp = payload.stepMode === 0;
          const action = isUp ? 'pressed_brightness_up' : 'pressed_brightness_down';
          this.log(`Remote action: ${isUp ? 'brightness up' : 'brightness down'}`);
          this.triggerAction(action, payload);
        }
      }));
    } catch (error) {
      this.error('Failed to setup LevelControl cluster:', error);
    }
  }

  /**
   * Setup Scenes cluster
   */
  async setupScenesCluster(endpoint) {
    try {
      endpoint.bind(CLUSTER.SCENES.NAME, new ScenesBoundCluster({
        onRecallScene: (payload) => {
          const sceneId = payload.sceneId;
          this.log(`Remote action: scene ${sceneId}`);
          this.triggerSceneButton(sceneId, payload);
        }
      }));
    } catch (error) {
      this.error('Failed to setup Scenes cluster:', error);
    }
  }

  /**
   * Setup Color Control cluster
   */
  async setupColorControlCluster(endpoint) {
    try {
      endpoint.bind(CLUSTER.COLOR_CONTROL.NAME, new ColorControlBoundCluster({
        onMoveToHue: (payload) => {
          this.log('Remote action: color control - move to hue', payload);
        },
        onMoveToSaturation: (payload) => {
          this.log('Remote action: color control - move to saturation', payload);
        }
      }));
    } catch (error) {
      this.error('Failed to setup ColorControl cluster:', error);
    }
  }

  /**
   * Setup manufacturer-specific cluster
   */
  async setupManufacturerCluster() {
    try {
      // Check if manufacturer cluster is available before binding
      if (this.zclNode.endpoints[1].clusters.adeoManufacturerSpecific) {
        await this.zclNode.endpoints[1].bind('adeoManufacturerSpecific');
        this.log('Manufacturer cluster bound successfully');
      } else {
        this.log('Manufacturer cluster not available, skipping binding');
      }
    } catch (error) {
      this.error('Failed to setup manufacturer cluster:', error.message);
      // Continue initialization even if manufacturer cluster fails
    }
  }

  /**
   * Trigger a scene button press
   */
  triggerSceneButton(sceneId, buttonData = {}) {
    try {
      // Update device state
      this.deviceState.lastButtonPress = {
        type: 'scene',
        sceneId,
        timestamp: new Date(),
        data: buttonData
      };
      this.deviceState.buttonsPressed++;

      // Use app's centralized trigger method
      if (this.homey.app.triggerSceneButton) {
        return this.homey.app.triggerSceneButton(this, sceneId, buttonData);
      }

      // Fallback to direct trigger
      const action = `pressed_scene_${sceneId}`;
      return this.triggerAction(action, buttonData);
    } catch (error) {
      this.error(`Error triggering scene ${sceneId}:`, error);
      return false;
    }
  }

  /**
   * Trigger a generic action
   */
  triggerAction(actionId, actionData = {}) {
    try {
      // Update device state
      this.deviceState.lastButtonPress = {
        type: 'action',
        actionId,
        timestamp: new Date(),
        data: actionData
      };
      this.deviceState.buttonsPressed++;

      // Trigger the flow card
      const triggerCard = this.homey.flow.getDeviceTriggerCard(actionId);
      if (triggerCard) {
        triggerCard.trigger(this, actionData);
        this.log(`Triggered action: ${actionId}`);
        return true;
      } else {
        this.error(`No trigger card found for action: ${actionId}`);
        return false;
      }
    } catch (error) {
      this.error(`Error triggering action ${actionId}:`, error);
      return false;
    }
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
        available: this.getAvailable()
      }
    };
  }

  /**
   * Handle device destruction
   */
  async onDeleted() {
    try {
      this.log('Device is being deleted, cleaning up...');
      
      // Restore original frame handler if it exists
      if (this.originalHandleFrame) {
        const node = await this.homey.zigbee.getNode(this);
        node.handleFrame = this.originalHandleFrame;
      }

      // Clean up device state
      this.deviceState = null;

      this.log('Device cleanup completed');
    } catch (error) {
      this.error('Error during device cleanup:', error);
    }
  }

}

module.exports = AdeoRemote;
