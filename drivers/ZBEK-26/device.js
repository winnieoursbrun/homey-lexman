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
      this.log(`Handling frame - endpoint: ${endpointId}, cluster: ${clusterId}`, {
        frameType: typeof frame,
        frameLength: frame?.length,
        meta
      });

      // Handle manufacturer-specific cluster (65024)
      if (endpointId === 1 && clusterId === 65024) {
        return this.handleManufacturerFrame(frame, meta);
      }
      
      // Handle Color Control cluster (768) for up/down/left/right buttons
      if (endpointId === 1 && clusterId === 768) {
        return this.handleColorControlFrame(frame, meta);
      }
      
      // Handle Scenes cluster (5) for scene buttons
      if (endpointId === 1 && clusterId === 5) {
        this.log('Received Scenes cluster frame:', { frame, meta });
        // Let the scenes bound cluster handle this
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
      meta,
      fullFrame: frame.toString ? frame.toString('hex') : frame
    });
    
    try {
      // Parse the raw frame buffer to extract button information
      let frameBuffer;
      if (Buffer.isBuffer(frame)) {
        frameBuffer = frame;
      } else if (frame.toString && typeof frame.toString === 'function') {
        frameBuffer = Buffer.from(frame.toString('hex'), 'hex');
      } else {
        this.log('Color Control frame format not recognized, skipping');
        return;
      }

      // Check if frame follows expected pattern: 01[button_id][param][data_byte]...
      if (frameBuffer.length >= 4 && frameBuffer[0] === 0x01) {
        const buttonId = frameBuffer[1];  // Second byte is button ID
        const param = frameBuffer[2];     // Third byte is parameter
        const dataByte = frameBuffer[3];  // Fourth byte might help identify button
        
        this.log(`Parsed frame - buttonId: 0x${buttonId.toString(16)}, param: 0x${param.toString(16)}, dataByte: 0x${dataByte.toString(16)}`);
        
        const action = this.parseButtonWithContext(buttonId, param, dataByte, frameBuffer);
        
        if (action) {
          this.triggerAction(action, { 
            buttonId, 
            param,
            dataByte,
            frameHex: frameBuffer.toString('hex'),
            meta 
          });
        }
      } else {
        this.log('Frame does not match expected pattern, trying fallback parsing');
        // Fallback to original parsing logic
        const cmdId = frame.cmdId || frameBuffer[0];
        const direction = frameBuffer[1] || 0x00;
        const action = this.parseColorControlCommand(cmdId, direction, frameBuffer);
        
        if (action) {
          this.triggerAction(action, { 
            direction, 
            cmdId, 
            data: frameBuffer.toString('hex'),
            meta 
          });
        }
      }
    } catch (error) {
      this.error('Error parsing Color Control frame:', error);
    }
  }

  /**
   * Parse button with additional context from frame data
   */
  parseButtonWithContext(buttonId, param, dataByte, frameBuffer) {
    this.log(`Parsing button with context - buttonId: 0x${buttonId.toString(16)}, param: 0x${param.toString(16)}, dataByte: 0x${dataByte.toString(16)}`);
    
    // Use the dataByte (4th byte) to help identify the actual button
    // Final working mappings:
    // - param 0x02 + dataByte 0x01 = Green Right  
    // - param 0x02 + dataByte 0x03 = Green Left
    // - param 0x05 + dataByte 0x01 = Green Up
    // - param 0x05 + dataByte 0x03 = Green Down
    // - param 0x4c + dataByte 0x01 = Red Up
    // - param 0x4c + dataByte 0x03 = Red Down
    
    if (param === 0x02) {
      // Green left/right buttons
      if (dataByte === 0x01) {
        return this.getButtonAction('pressed_green_right', 'green right (context detected)');
      } else if (dataByte === 0x03) {
        return this.getButtonAction('pressed_green_left', 'green left (context detected)');
      }
    } else if (param === 0x05) {
      // Green up/down buttons
      if (dataByte === 0x01) {
        return this.getButtonAction('pressed_green_up', 'green up (context detected)');
      } else if (dataByte === 0x03) {
        return this.getButtonAction('pressed_green_down', 'green down (context detected)');
      }
    } else if (param === 0x4c) {
      // Red buttons
      if (dataByte === 0x01) {
        return this.getButtonAction('pressed_red_up', 'red up (context detected)');
      } else if (dataByte === 0x03) {
        return this.getButtonAction('pressed_red_down', 'red down (context detected)');
      }
    }
    
    // Fallback to the original parseButtonId if context detection fails
    return this.parseButtonId(buttonId, param);
  }

  /**
   * Parse button ID and determine action
   */
  parseButtonId(buttonId, param) {
    this.log(`Parsing button ID: 0x${buttonId.toString(16)}, param: 0x${param.toString(16)}`);
    
    // The button IDs increment with each press, so we need to determine button type based on patterns
    // We'll use the parameter byte and the frame structure to identify buttons consistently
    
    const buttonMap = {
      // Original mapping (for reference) - updated to new action names
      0x17: () => this.getButtonAction('pressed_green_up', 'green up'),
      0x18: () => this.getButtonAction('pressed_green_down', 'green down'),
      0x19: () => this.getButtonAction('pressed_green_left', 'green left'),
      0x1a: () => this.getButtonAction('pressed_green_right', 'green right'),
      0x1b: () => this.getButtonAction('pressed_red_up', 'red up'),
      0x1c: () => this.getButtonAction('pressed_red_down', 'red down'),
      
      // Updated mapping based on observed sequences
      0x1d: () => this.getButtonAction('pressed_green_up', 'green up'),
      0x1e: () => this.getButtonAction('pressed_green_down', 'green down'),
      0x1f: () => this.getButtonAction('pressed_green_left', 'green left'),
      0x20: () => this.getButtonAction('pressed_green_right', 'green right'),
      0x21: () => this.getButtonAction('pressed_red_up', 'red up'),
      0x22: () => this.getButtonAction('pressed_red_down', 'red down'),
      
      0x23: () => this.getButtonAction('pressed_green_up', 'green up'),
      0x24: () => this.getButtonAction('pressed_green_down', 'green down'),
      0x25: () => this.getButtonAction('pressed_green_left', 'green left'),
      0x26: () => this.getButtonAction('pressed_green_right', 'green right'),
      0x27: () => this.getButtonAction('pressed_red_up', 'red up'),
      0x28: () => this.getButtonAction('pressed_red_down', 'red down')
    };
    
    const parseFunction = buttonMap[buttonId];
    if (parseFunction) {
      return parseFunction();
    }
    
    // Improved pattern detection based on actual observations
    if (param === 0x4c) {
      // Red buttons typically have param 0x4c
      // Use buttonId modulo to determine up/down
      if (buttonId % 2 === 1) {
        return this.getButtonAction('pressed_red_up', 'red up (pattern detected)');
      } else {
        return this.getButtonAction('pressed_red_down', 'red down (pattern detected)');
      }
    } else if (param === 0x05) {
      // Green up/down buttons have param 0x05
      if (buttonId % 2 === 1) {
        return this.getButtonAction('pressed_green_up', 'green up (param 0x05)');
      } else {
        return this.getButtonAction('pressed_green_down', 'green down (param 0x05)');
      }
    } else if (param === 0x02) {
      // Green left/right buttons have param 0x02
      // We need to track the button state to determine which button is actually being pressed
      return this.determineGreenButtonFromHistory(buttonId, param);
    }
    
    this.log(`Unhandled button ID: 0x${buttonId.toString(16)}, param: 0x${param.toString(16)}`);
    return null;
  }

  /**
   * Determine green button from history and context
   */
  determineGreenButtonFromHistory(buttonId, param) {
    // Since the button IDs increment regardless of which physical button is pressed,
    // we need a different approach. Let's use the third byte of the frame for additional context.
    
    // For now, let's assume that repeated presses of the same physical button
    // will maintain some consistency in the frame structure beyond just the button ID
    
    // Check if we have recent button press history
    if (this.lastButtonPress && this.lastButtonPress.buttonId) {
      const timeDiff = Date.now() - this.lastButtonPress.timestamp;
      
      // If the button press is within 2 seconds and the parameter matches,
      // it's likely the same physical button
      if (timeDiff < 2000 && this.lastButtonPress.param === param) {
        this.log(`Detected repeated press of same button: ${this.lastButtonPress.action}`);
        return this.lastButtonPress.action;
      }
    }
    
    // Default pattern: alternate between left and right for param 0x02
    // This is imperfect but better than cycling through all 4 buttons
    if (buttonId % 2 === 1) {
      const action = 'pressed_green_left';
      this.lastButtonPress = { 
        buttonId, 
        param, 
        action, 
        timestamp: Date.now() 
      };
      return this.getButtonAction(action, 'green left (pattern detected)');
    } else {
      const action = 'pressed_green_right';
      this.lastButtonPress = { 
        buttonId, 
        param, 
        action, 
        timestamp: Date.now() 
      };
      return this.getButtonAction(action, 'green right (pattern detected)');
    }
  }

  /**
   * Helper function to log and return button action
   */
  getButtonAction(action, description) {
    this.log(`Remote action: ${description} -> ${action}`);
    return action;
  }

  /**
   * Parse color control command and determine action
   */
  parseColorControlCommand(cmdId, direction, buttonData) {
    this.log(`Parsing color control command - cmdId: ${cmdId}, direction: 0x${direction ? direction.toString(16) : 'undefined'}`);
    
    const actionMap = {
      76: () => this.parseBrightnessCommand(cmdId, direction),
      5: () => this.parseBrightnessCommand(cmdId, direction),
      2: () => this.parseColorLeftRightCommand(cmdId, direction),
      3: () => this.parseColorLeftRightCommand(cmdId, direction),
      4: () => this.parseColorUpDownCommand(cmdId, direction),
      6: () => this.parseColorCenterCommand(cmdId),
      undefined: () => this.parseFallbackCommand(direction),
      0: () => this.parseFallbackCommand(direction)
    };
    
    const parseFunction = actionMap[cmdId];
    if (parseFunction) {
      return parseFunction();
    }
    
    this.log(`Unhandled color control command - cmdId: ${cmdId}, direction: 0x${direction ? direction.toString(16) : 'undefined'}`);
    return null;
  }

  /**
   * Parse brightness up/down commands
   */
  parseBrightnessCommand(cmdId, direction) {
    if (direction === 0x00 || direction === 0x01) {
      this.log(`Remote action: brightness down (cmd${cmdId}, direction: 0x${direction.toString(16)})`);
      return 'pressed_brightness_down';
    } else if (direction === 0x03 || direction === 0x02) {
      this.log(`Remote action: brightness up (cmd${cmdId}, direction: 0x${direction.toString(16)})`);
      return 'pressed_brightness_up';
    }
    return null;
  }

  /**
   * Parse color left/right commands
   */
  parseColorLeftRightCommand(cmdId, direction) {
    if (direction === 0x00 || direction === 0x01) {
      this.log(`Remote action: color left (cmd${cmdId}, direction: 0x${direction.toString(16)})`);
      return 'pressed_color_left';
    } else if (direction === 0x03 || direction === 0x02) {
      this.log(`Remote action: color right (cmd${cmdId}, direction: 0x${direction.toString(16)})`);
      return 'pressed_color_right';
    }
    return null;
  }

  /**
   * Parse color up/down commands
   */
  parseColorUpDownCommand(cmdId, direction) {
    if (direction === 0x00 || direction === 0x01) {
      this.log(`Remote action: color down (cmd${cmdId}, direction: 0x${direction.toString(16)})`);
      return 'pressed_color_down';
    } else if (direction === 0x03 || direction === 0x02) {
      this.log(`Remote action: color up (cmd${cmdId}, direction: 0x${direction.toString(16)})`);
      return 'pressed_color_up';
    }
    return null;
  }

  /**
   * Parse color center command
   */
  parseColorCenterCommand(cmdId) {
    this.log(`Remote action: color center (cmd${cmdId})`);
    return 'pressed_color_center';
  }

  /**
   * Parse fallback command when cmdId is unknown
   */
  parseFallbackCommand(direction) {
    if (direction === 0x00 || direction === 0x01) {
      this.log(`Remote action: brightness down (unknown cmd, direction: 0x${direction ? direction.toString(16) : '00'})`);
      return 'pressed_brightness_down';
    } else if (direction === 0x03 || direction === 0x02) {
      this.log(`Remote action: brightness up (unknown cmd, direction: 0x${direction ? direction.toString(16) : '03'})`);
      return 'pressed_brightness_up';
    }
    return null;
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
