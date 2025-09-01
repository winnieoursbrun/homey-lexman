'use strict';

const { ZigBeeLightDevice } = require('homey-zigbeedriver');
const { CLUSTER } = require('zigbee-clusters');

class LexmanLightDevice extends ZigBeeLightDevice {

  async onNodeInit({ zclNode }) {
    
    // Enable debug logging during development
    // const { debug } = require('zigbee-clusters');
    // debug(true);

    // Call super first
    await super.onNodeInit({ zclNode });

    // Register standard light capabilities
    this.registerCapability('onoff', CLUSTER.ON_OFF, {
      reportOpts: {
        configureAttributeReporting: {
          minInterval: 0,
          maxInterval: 300,
          minChange: 1,
        },
      },
    });

    this.registerCapability('dim', CLUSTER.LEVEL_CONTROL, {
      reportOpts: {
        configureAttributeReporting: {
          minInterval: 0,
          maxInterval: 300,
          minChange: 5,
        },
      },
    });
    
    this.log('Lexman light device initialized');
  }

}

module.exports = LexmanLightDevice;
