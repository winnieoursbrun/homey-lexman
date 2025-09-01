'use strict';

const { ZigBeeDriver } = require('homey-zigbeedriver');

class LexmanLightDriver extends ZigBeeDriver {

  onInit() {
    this.log('Lexman Light Driver initialized');
  }

}

module.exports = LexmanLightDriver;
