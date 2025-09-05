const { Cluster, ZCLDataTypes } = require('zigbee-clusters');

class AdeoCluster extends Cluster {
  static get ID() {
    return 65024; // 0xFE00 - manufacturer-specific cluster
  }

  static get NAME() {
    return 'adeoManufacturerSpecific';
  }

  static get MANUFACTURER_ID() {
    return 4727; // ADEO manufacturer ID
  }

  static get COMMANDS() {
    return {
      buttonEvent: {
        id: 0,
        manufacturerId: 4727,
        args: {
          buttonId: ZCLDataTypes.uint8,
          action: ZCLDataTypes.uint8,
        },
      },
    };
  }
}

module.exports = AdeoCluster;
