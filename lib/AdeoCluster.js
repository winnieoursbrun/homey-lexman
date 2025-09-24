const { Cluster, ZCLDataTypes } = require('zigbee-clusters');
const { CONFIG } = require('./Config');

class AdeoCluster extends Cluster {
  static get ID() {
    return CONFIG.ZIGBEE.MANUFACTURER_CLUSTER_ID; // 65024 (0xFE00) - manufacturer-specific cluster
  }

  static get NAME() {
    return 'adeoManufacturerSpecific';
  }

  static get MANUFACTURER_ID() {
    return CONFIG.ZIGBEE.MANUFACTURER_ID; // 4727 - ADEO manufacturer ID
  }

  static get COMMANDS() {
    return {
      buttonEvent: {
        id: 0,
        manufacturerId: CONFIG.ZIGBEE.MANUFACTURER_ID,
        args: {
          buttonId: ZCLDataTypes.uint8,
          action: ZCLDataTypes.uint8,
        },
      },
      sceneEvent: {
        id: 1,
        manufacturerId: CONFIG.ZIGBEE.MANUFACTURER_ID,
        args: {
          sceneId: ZCLDataTypes.uint8,
          action: ZCLDataTypes.uint8,
        },
      },
    };
  }

  static get ATTRIBUTES() {
    return {
      deviceState: {
        id: 0x0000,
        type: ZCLDataTypes.uint8
      },
      buttonMapping: {
        id: 0x0001,
        type: ZCLDataTypes.array
      }
    };
  }
}

module.exports = AdeoCluster;
