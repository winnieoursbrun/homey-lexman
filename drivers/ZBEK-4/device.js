const { ZigBeeLightDevice } = require('homey-zigbeedriver');
const { debug } = require('zigbee-clusters');

class AdeoLight extends ZigBeeLightDevice {
  async onNodeInit({ zclNode }) {
    // Enable capabilities for the light device
    await this.enableCapability('onoff');
    await this.enableCapability('dim');

    // Register capability listeners
    this.registerCapabilityListener('onoff', this.onCapabilityOnOff.bind(this));
    this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));

    // Call parent initialization
    await super.onNodeInit({ zclNode });

    // Enable debug logging during development
    debug(true);
  }
}

module.exports = AdeoLight;
