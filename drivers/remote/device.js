'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { CLUSTER } = require('zigbee-clusters');

class LexmanRemoteDevice extends ZigBeeDevice {

  async onNodeInit({ zclNode }) {
    
    // Enable debug logging during development
    const { debug } = require('zigbee-clusters');
    debug(true);

    // Call super first
    await super.onNodeInit({ zclNode });

    // Register battery capabilities
    this.registerCapability('measure_battery', CLUSTER.POWER_CONFIGURATION);

    // Configure battery voltage reporting (not batteryPercentage)
    await this.configureAttributeReporting([
      {
        endpointId: this.getClusterEndpoint(CLUSTER.POWER_CONFIGURATION),
        cluster: CLUSTER.POWER_CONFIGURATION,
        attributeName: 'batteryVoltage',
        minInterval: 0,
        maxInterval: 3600,
        minChange: 1,
      },
    ]).catch(this.error);

    // Register button press listeners for each cluster
    this.registerClusterCommandListeners();

    this.log('Lexman remote device initialized');
  }

  registerClusterCommandListeners() {
    // Listen for manufacturer-specific cluster commands (main button communication)
    // Cluster 65024 (0xFE00) with manufacturer ID 4727 is used for button presses
    try {
      // Try to access the manufacturer-specific cluster directly
      const manufacturerCluster = this.zclNode.endpoints[1].clusters[65024];
      if (manufacturerCluster) {
        manufacturerCluster.on('command', this.onManufacturerSpecificCommand.bind(this));
        this.log('Registered listener for manufacturer-specific cluster 65024');
      } else {
        this.log('Manufacturer-specific cluster 65024 not found, trying alternative approach');
        
        // Alternative: Listen to all commands on endpoint 1 and filter by cluster
        this.zclNode.endpoints[1].on('command', (command) => {
          if (command.cluster === 65024 || command.clusterId === 65024) {
            this.onManufacturerSpecificCommand(command);
          }
        });
        this.log('Registered generic endpoint listener for cluster 65024');
      }
    } catch (error) {
      this.error('Error registering manufacturer-specific cluster listener:', error);
      
      // Fallback: Use a more generic approach
      this.zclNode.on('command', (command) => {
        this.log('Fallback generic command received:', command);
        if (command.cluster === 65024 || command.clusterId === 65024 || 
            (command.frame && command.frame.manufacturerId === 4727)) {
          this.onManufacturerSpecificCommand(command);
        }
      });
      this.log('Registered fallback generic command listener');
    }

    // Listen for ON_OFF cluster commands (power buttons)
    if (this.zclNode.endpoints[1].clusters[CLUSTER.ON_OFF.NAME]) {
      this.zclNode.endpoints[1].clusters[CLUSTER.ON_OFF.NAME]
        .on('command', this.onOnOffCommand.bind(this));
      this.log('Registered ON_OFF cluster listener');
    }

    // Listen for LEVEL_CONTROL cluster commands (dim buttons) 
    if (this.zclNode.endpoints[1].clusters[CLUSTER.LEVEL_CONTROL.NAME]) {
      this.zclNode.endpoints[1].clusters[CLUSTER.LEVEL_CONTROL.NAME]
        .on('command', this.onLevelControlCommand.bind(this));
      this.log('Registered LEVEL_CONTROL cluster listener');
    }

    // Listen for COLOR_CONTROL cluster commands (scene buttons)
    if (this.zclNode.endpoints[1].clusters[CLUSTER.COLOR_CONTROL.NAME]) {
      this.zclNode.endpoints[1].clusters[CLUSTER.COLOR_CONTROL.NAME]
        .on('command', this.onColorControlCommand.bind(this));
      this.log('Registered COLOR_CONTROL cluster listener');
    }

    // Listen for SCENES cluster commands (additional scene buttons)
    if (this.zclNode.endpoints[1].clusters[CLUSTER.SCENES.NAME]) {
      this.zclNode.endpoints[1].clusters[CLUSTER.SCENES.NAME]
        .on('command', this.onScenesCommand.bind(this));
      this.log('Registered SCENES cluster listener');
    }

    // Listen for IAS_ZONE cluster commands (might be used for button presses)
    if (this.zclNode.endpoints[1].clusters[CLUSTER.IAS_ZONE.NAME]) {
      this.zclNode.endpoints[1].clusters[CLUSTER.IAS_ZONE.NAME]
        .on('command', this.onIasZoneCommand.bind(this));
      this.log('Registered IAS_ZONE cluster listener');
    }

    // Add debugging listener to catch ALL commands for troubleshooting
    this.zclNode.on('command', (command) => {
      this.log('ALL commands debug - received:', {
        cluster: command.cluster,
        clusterId: command.clusterId,
        command: command.command,
        frame: command.frame ? {
          cmdId: command.frame.cmdId,
          manufacturerId: command.frame.manufacturerId,
          data: command.frame.data?.toString('hex')
        } : null
      });
    });

    this.log('Cluster command listeners registered');
  }

  async onOnOffCommand({ command, args }) {
    this.log('ON_OFF command received:', command, args);
    
    let buttonId;
    if (command === 'on') {
      buttonId = 'on';
    } else if (command === 'off') {
      buttonId = 'off';
    } else if (command === 'toggle') {
      buttonId = 'center'; // Often center button acts as toggle
    } else {
      this.log('Unknown ON_OFF command:', command);
      return;
    }

    await this.triggerButtonPressed(buttonId, command);
  }

  async onLevelControlCommand({ command, args }) {
    this.log('LEVEL_CONTROL command received:', command, args);
    
    let buttonId;
    if (command === 'step' || command === 'stepWithOnOff') {
      // args.stepMode: 0 = up, 1 = down
      buttonId = args.stepMode === 0 ? 'up' : 'down';
    } else if (command === 'move' || command === 'moveWithOnOff') {
      // args.moveMode: 0 = up, 1 = down
      buttonId = args.moveMode === 0 ? 'arrow_up' : 'arrow_down';
    } else if (command === 'stop' || command === 'stopWithOnOff') {
      buttonId = 'center'; // Stop could be center button
    } else {
      this.log('Unknown LEVEL_CONTROL command:', command);
      return;
    }

    await this.triggerButtonPressed(buttonId, command);
  }

  async onColorControlCommand({ command, args }) {
    this.log('COLOR_CONTROL command received:', command, args);
    
    let buttonId;
    if (['enhancedMoveHue', 'moveHue', 'moveToHue', 'enhancedMoveToHue'].includes(command)) {
      buttonId = this.getButtonFromHue(args.hue);
    } else if (['moveColorTemperature', 'moveToColorTemperature'].includes(command)) {
      // Map color temperature to left/right navigation
      if (args.colorTemperature !== undefined) {
        buttonId = args.colorTemperature < 250 ? 'left' : 'right';
      } else if (args.moveMode !== undefined) {
        buttonId = args.moveMode === 0 ? 'right' : 'left';
      }
    } else {
      this.log('Unknown COLOR_CONTROL command:', command);
      return;
    }

    if (buttonId) {
      await this.triggerButtonPressed(buttonId, command);
    }
  }

  async onScenesCommand({ command, args }) {
    this.log('SCENES command received:', command, args);
    
    let buttonId;
    if (command === 'recallScene') {
      // Map scene IDs to numbered buttons
      if (args.sceneId !== undefined) {
        buttonId = `button_${Math.min(args.sceneId + 1, 4)}`;
      }
    } else if (command === 'storeScene') {
      buttonId = 'center'; // Store scene might be center button
    } else {
      this.log('Unknown SCENES command:', command);
      return;
    }

    if (buttonId) {
      await this.triggerButtonPressed(buttonId, command);
    }
  }

  async onIasZoneCommand({ command, args }) {
    this.log('IAS_ZONE command received:', command, args);
    
    // IAS Zone might send button press events
    let buttonId;
    if (command === 'zoneStatusChangeNotification') {
      // Parse zone status for button identification
      if (args.zoneStatus !== undefined) {
        buttonId = this.getButtonFromZoneStatus(args.zoneStatus);
      }
    } else {
      this.log('Unknown IAS_ZONE command:', command);
      return;
    }

    if (buttonId) {
      await this.triggerButtonPressed(buttonId, command);
    }
  }

  async onManufacturerSpecificCommand(command) {
    this.log('Manufacturer-specific command received:', command);

    // Parse the data buffer to determine which button was pressed
    let buttonId = null;
    
    // Handle different command structures
    const frame = command.frame || command;
    const data = frame.data || command.data;
    
    if (data && Buffer.isBuffer(data)) {
      this.log('Raw data buffer:', data.toString('hex'));
      
      // Based on your log, the data is <Buffer 0d 01>
      // We need to map different data patterns to different buttons
      // This mapping will need to be determined through testing
      
      if (data.length >= 2) {
        const byte1 = data[0]; // 0x0d in your example
        const byte2 = data[1]; // 0x01 in your example
        
        // Map the data pattern to button IDs
        // You'll need to press each button and see what data it sends
        buttonId = this.getButtonFromManufacturerData(byte1, byte2);
        
        this.log(`Parsed manufacturer data: byte1=0x${byte1.toString(16)}, byte2=0x${byte2.toString(16)}, buttonId=${buttonId}`);
      }
    } else if (data && data.length >= 2) {
      // Handle if data is an array instead of buffer
      const byte1 = data[0];
      const byte2 = data[1];
      buttonId = this.getButtonFromManufacturerData(byte1, byte2);
      this.log(`Parsed manufacturer data (array): byte1=0x${byte1.toString(16)}, byte2=0x${byte2.toString(16)}, buttonId=${buttonId}`);
    }

    if (buttonId) {
      await this.triggerButtonPressed(buttonId, 'manufacturer_specific');
    } else {
      this.log('Could not determine button from manufacturer-specific command');
    }
  }

  getButtonFromHue(hue) {
    if (hue === undefined) return null;
    
    // Map hue values to numbered buttons (1, 2, 3, 4)
    if (hue >= 0 && hue < 16384) return 'button_1';
    if (hue >= 16384 && hue < 32768) return 'button_2';
    if (hue >= 32768 && hue < 49152) return 'button_3';
    return 'button_4';
  }

  getButtonFromZoneStatus(zoneStatus) {
    // This method might need to be customized based on your remote's actual behavior
    // For now, we'll map different zone status values to different buttons
    if (zoneStatus === undefined) return null;
    
    // Map zone status bits to specific buttons
    // You may need to adjust these mappings based on actual testing
    if (zoneStatus & 0x01) return 'left';
    if (zoneStatus & 0x02) return 'right';
    if (zoneStatus & 0x04) return 'up';
    if (zoneStatus & 0x08) return 'down';
    
    return 'center'; // Default fallback
  }

  getButtonFromManufacturerData(byte1, byte2) {
    // This method maps the manufacturer-specific data to button IDs
    // You'll need to test each button to determine the correct mappings
    
    // Example mapping based on common patterns:
    const key = `${byte1.toString(16)}_${byte2.toString(16)}`;
    
    const buttonMap = {
      // Add mappings as you discover them by testing each button
      '0d_01': 'button_1',      // Example: your current data maps to button 1
      '0d_02': 'button_2',      // You'll need to press button 2 and see what data it sends
      '0d_03': 'button_3',      // And so on for each button...
      '0d_04': 'button_4',
      '0e_01': 'on',
      '0e_02': 'off',
      '0f_01': 'up',
      '0f_02': 'down',
      '10_01': 'left',
      '10_02': 'right',
      '11_01': 'arrow_up',
      '11_02': 'arrow_down',
      '12_01': 'center',
      // Add more mappings as you test each button
    };

    const result = buttonMap[key];
    if (!result) {
      this.log(`Unknown button data pattern: ${key} (byte1=0x${byte1.toString(16)}, byte2=0x${byte2.toString(16)})`);
    }
    
    return result || null;
  }

  async triggerButtonPressed(buttonId, command) {
    this.log(`Button pressed: ${buttonId} (command: ${command})`);
    
    // Trigger the flow card
    const tokens = {
      button: buttonId,
      command: command
    };

    try {
      await this.driver.triggerButtonPressed(this, tokens);
      this.log(`Successfully triggered button_pressed flow for button: ${buttonId}`);
    } catch (error) {
      this.error('Error triggering button_pressed flow:', error);
    }
  }
  
}

module.exports = LexmanRemoteDevice;
