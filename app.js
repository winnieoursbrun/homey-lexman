'use strict';

const Homey = require('homey');

class LexmanApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  onInit() {
    this.log('Lexman app is running...');
  }

}

module.exports = LexmanApp;
