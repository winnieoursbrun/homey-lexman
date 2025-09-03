'use strict';

const { ZigBeeDriver } = require('homey-zigbeedriver');

class LexmanRemoteDriver extends ZigBeeDriver {

  onInit() {
    this.log('Lexman Remote Driver initialized');

    // Register flow cards
    this.buttonPressedTrigger = this.homey.flow.getDeviceTriggerCard('button_pressed');
  }

  async triggerButtonPressed(device, tokens) {
    await this.buttonPressedTrigger.trigger(device, tokens);
  }

}

module.exports = LexmanRemoteDriver;
